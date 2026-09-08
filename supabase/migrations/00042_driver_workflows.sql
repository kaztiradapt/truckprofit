-- Preserve historical reporting currency/amount; original receipt values are additional facts.
alter table public.expenses
  add column receipt_amount numeric(16,2),
  add column receipt_currency char(3),
  add column receipt_fx_rate numeric(18,8),
  add constraint expense_receipt_values check (
    (receipt_amount is null and receipt_currency is null and receipt_fx_rate is null)
    or (receipt_amount is not null and receipt_currency is not null and receipt_fx_rate is not null
      and receipt_amount > 0 and receipt_amount <= 999999999
      and receipt_currency in ('KZT','RUB','USD','CNY','UZS')
      and receipt_fx_rate > 0 and receipt_fx_rate <= 1000000
      and round(receipt_amount * receipt_fx_rate,2) = amount
      and (receipt_currency <> currency or receipt_fx_rate = 1)));

alter table public.trips
  add column assignment_response text not null default 'PENDING'
    check (assignment_response in ('PENDING','ACCEPTED','DECLINED')),
  add column assignment_token uuid not null default gen_random_uuid() unique,
  add column assignment_responded_at timestamptz,
  add column assignment_refusal_reason text;

create function public.guard_trip_assignment_response()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' or new.driver_id is distinct from old.driver_id
    or new.vehicle_id is distinct from old.vehicle_id then
    new.assignment_token := gen_random_uuid();
    new.assignment_response := 'PENDING';
    new.assignment_responded_at := null;
    new.assignment_refusal_reason := null;
  elsif auth.uid() is not null and (
    new.assignment_token is distinct from old.assignment_token
    or new.assignment_response is distinct from old.assignment_response
    or new.assignment_responded_at is distinct from old.assignment_responded_at
    or new.assignment_refusal_reason is distinct from old.assignment_refusal_reason) then
    raise exception 'Only the assigned driver can respond in Telegram';
  end if;
  return new;
end;
$$;
create trigger trips_guard_assignment before insert or update on public.trips
  for each row execute function public.guard_trip_assignment_response();
revoke all on function public.guard_trip_assignment_response() from public,anon,authenticated;

-- New bot actions share the update lease and an atomic idempotency receipt.
-- Identity is checked against the PRIVATE Telegram chat, never against a client-supplied username.
create function public.execute_driver_workflow(p_update_id bigint,p_token uuid,p_action text,p_args jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
<<workflow>>
declare
  log public.telegram_update_logs%rowtype;
  trip public.trips%rowtype;
  expense public.expenses%rowtype;
  org uuid := (p_args->>'organizationId')::uuid;
  driver uuid := (p_args->>'driverId')::uuid;
  result_id uuid;
  base char(3);
  receipt_currency text := p_args->>'originalCurrency';
  receipt_amount numeric := (p_args->>'originalAmount')::numeric;
  rate numeric := (p_args->>'exchangeRate')::numeric;
  converted numeric;
  litres numeric := (p_args->>'fuelLitres')::numeric;
  reason text := btrim(p_args->>'reason');
  before_value jsonb;
  category text;
begin
  select * into log from public.telegram_update_logs where telegram_update_id=p_update_id for update;
  if not found or log.lease_token is distinct from p_token or log.status<>'RECEIVED' or log.lease_expires_at<=now() then raise exception 'Update lease expired'; end if;
  if not exists(select 1 from public.drivers d where d.id=driver and d.organization_id=org
    and d.status='ACTIVE' and d.deleted_at is null and d.telegram_user_id::text=log.conversation_key)
    then raise exception 'Driver identity is not available'; end if;
  insert into public.telegram_operation_results(telegram_update_id,operation)
    values(p_update_id,'driver:'||p_action) on conflict do nothing;
  select result into result_id from public.telegram_operation_results
    where telegram_update_id=p_update_id and operation='driver:'||p_action for update;
  if result_id is not null then return result_id; end if;

  if p_action='respond_assignment' then
    select * into trip from public.trips where assignment_token=(p_args->>'assignmentToken')::uuid
      and organization_id=org and driver_id=driver and status='ACTIVE' and deleted_at is null for update;
    if not found then raise exception 'Assignment is no longer available'; end if;
    if trip.assignment_response <> 'PENDING' then raise exception 'Assignment already answered'; end if;
    if (p_args->>'response') is null or (p_args->>'response') not in ('ACCEPTED','DECLINED') then raise exception 'Invalid response'; end if;
    if p_args->>'response'='DECLINED' and (reason is null or length(reason)<3 or length(reason)>500) then raise exception 'A refusal reason is required'; end if;
    update public.trips set assignment_response=p_args->>'response',assignment_responded_at=now(),
      assignment_refusal_reason=case when p_args->>'response'='DECLINED' then reason else null end where id=trip.id;
    result_id:=trip.id;
    insert into public.audit_events(organization_id,entity_type,entity_id,action,source,before_data,after_data,reason)
      values(org,'trip',trip.id,'DRIVER_ASSIGNMENT_RESPONSE','TELEGRAM',
        jsonb_build_object('assignment_response',trip.assignment_response),
        jsonb_build_object('assignment_response',p_args->>'response','driver_id',driver),reason);
  elsif p_action in ('create_expense','edit_expense') then
    select * into trip from public.trips where id=(p_args->>'tripId')::uuid and organization_id=org
      and driver_id=driver and status='ACTIVE' and deleted_at is null for update;
    if not found then raise exception 'No active trip is assigned to this driver'; end if;
    select base_currency into base from public.organizations where id=org;
    if receipt_currency is null or receipt_currency not in ('KZT','RUB','USD','CNY','UZS')
      or receipt_amount is null or not(receipt_amount>0 and receipt_amount<=999999999)
      or receipt_amount<>round(receipt_amount,2) then raise exception 'Invalid receipt amount or currency'; end if;
    if receipt_currency=base then rate:=1; end if;
    if rate is null or not(rate>0 and rate<=1000000) or rate<>round(rate,8) then raise exception 'Invalid exchange rate'; end if;
    converted:=round(receipt_amount*rate,2);
    if not(converted>=0.01 and converted<=999999999) then raise exception 'Converted amount is out of range'; end if;

    if p_action='edit_expense' then
      select * into expense from public.expenses where id=(p_args->>'expenseId')::uuid
        and organization_id=org and driver_id=driver and trip_id=trip.id and source='TELEGRAM'
        and status='RECORDED' and deleted_at is null for update;
      if not found then raise exception 'Expense is unavailable for this driver'; end if;
      if expense.updated_at is distinct from (p_args->>'expectedUpdatedAt')::timestamptz then raise exception 'Expense changed; open it again'; end if;
      select code into category from public.expense_categories where id=expense.category_id;
      before_value:=to_jsonb(expense);
    else category:=p_args->>'categoryCode';
    end if;
    if category='FUEL' and (litres is null or not(litres>=0.001 and litres<=100000) or litres<>round(litres,3)) then raise exception 'Invalid fuel litres'; end if;
    if category<>'FUEL' then litres:=null; end if;
    if p_action='create_expense' then
      result_id:=public.record_telegram_expense(org,driver,trip.id,category,converted,base,
        (p_args->>'occurredAt')::timestamptz,(p_args->>'odometerKm')::numeric,litres,
        case when litres is not null then 'L' else null end,
        case when litres is not null then converted/litres else null end,null,null);
    else result_id:=expense.id;
    end if;
    update public.expenses e set amount=converted,
      receipt_amount=workflow.receipt_amount,
      receipt_currency=workflow.receipt_currency,
      receipt_fx_rate=rate,quantity=litres,
      price_per_unit=case when litres is not null then converted/litres else null end
      where e.id=result_id;
    insert into public.audit_events(organization_id,entity_type,entity_id,action,source,before_data,after_data)
      values(org,'expense',result_id,case when p_action='edit_expense' then 'DRIVER_CORRECTED' else 'RECEIPT_CURRENCY_RECORDED' end,
        'TELEGRAM',before_value,jsonb_build_object('driver_id',driver,'amount',converted,'currency',base,
          'receipt_amount',receipt_amount,'receipt_currency',receipt_currency,'receipt_fx_rate',rate,'quantity',litres));
  else raise exception 'Unsupported driver action';
  end if;
  update public.telegram_operation_results set result=result_id
    where telegram_update_id=p_update_id and operation='driver:'||p_action;
  return result_id;
end;
$$;
revoke all on function public.execute_driver_workflow(bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.execute_driver_workflow(bigint,uuid,text,jsonb) to service_role;
