-- Lease both the update and its conversation across all serverless instances.
-- A webhook returns 200 only after session state + PROCESSED commit atomically.
alter table public.telegram_update_logs
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column conversation_key text;

create table public.telegram_conversation_leases (
  conversation_key text primary key,
  lease_token uuid not null,
  expires_at timestamptz not null
);
create table public.telegram_operation_results (
  telegram_update_id bigint not null references public.telegram_update_logs(telegram_update_id),
  operation text not null,
  result uuid,
  primary key (telegram_update_id, operation)
);
alter table public.telegram_conversation_leases enable row level security;
alter table public.telegram_operation_results enable row level security;
revoke all privileges on table public.telegram_conversation_leases, public.telegram_operation_results from anon;
revoke all privileges on table public.telegram_conversation_leases, public.telegram_operation_results from authenticated;

create function public.claim_telegram_update(p_update_id bigint, p_conversation_key text, p_token uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare existing public.telegram_update_logs%rowtype;
begin
  if p_update_id <= 0 or p_token is null or nullif(p_conversation_key,'') is null then raise exception 'Invalid update'; end if;
  insert into public.telegram_update_logs(telegram_update_id) values(p_update_id) on conflict do nothing;
  select * into existing from public.telegram_update_logs where telegram_update_id=p_update_id for update;
  if existing.status='PROCESSED' then return 'PROCESSED'; end if;
  if existing.status='RECEIVED' and existing.lease_expires_at > now() then return 'BUSY'; end if;
  insert into public.telegram_conversation_leases values (p_conversation_key,p_token,now()+interval '2 minutes')
  on conflict(conversation_key) do update set lease_token=excluded.lease_token, expires_at=excluded.expires_at
    where public.telegram_conversation_leases.expires_at <= now();
  if not found then return 'BUSY'; end if;
  update public.telegram_update_logs set status='RECEIVED', lease_token=p_token,
    lease_expires_at=now()+interval '2 minutes', conversation_key=p_conversation_key,
    received_at=now(), processed_at=null, error_summary=null where telegram_update_id=p_update_id;
  return 'CLAIMED';
end;
$$;

create function public.complete_telegram_update(p_update_id bigint, p_token uuid, p_success boolean, p_write_state boolean, p_state jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare existing public.telegram_update_logs%rowtype;
begin
  select * into existing from public.telegram_update_logs where telegram_update_id=p_update_id for update;
  if not found or existing.lease_token is distinct from p_token or existing.lease_expires_at <= now() or existing.status<>'RECEIVED' then
    raise exception 'Update lease expired';
  end if;
  if p_success and p_write_state then
    if p_state is null then
      delete from public.telegram_conversations where conversation_key=existing.conversation_key;
    else
      insert into public.telegram_conversations(conversation_key,state,expires_at)
      values(existing.conversation_key,p_state,now()+interval '48 hours')
      on conflict(conversation_key) do update set state=excluded.state, expires_at=excluded.expires_at;
    end if;
  end if;
  update public.telegram_update_logs set status=case when p_success then 'PROCESSED'::public.telegram_update_status else 'FAILED'::public.telegram_update_status end,
    processed_at=now(), lease_expires_at=null, error_summary=case when p_success then null else 'Telegram handler failed' end
    where telegram_update_id=p_update_id;
  delete from public.telegram_conversation_leases where conversation_key=existing.conversation_key and lease_token=p_token;
end;
$$;

-- Effects and their idempotency receipts share one DB transaction. A retry after
-- saving an expense/status but before session commit returns the same result.
create function public.execute_telegram_operation(p_update_id bigint, p_token uuid, p_operation text, p_args jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare operation_result uuid; existing public.telegram_update_logs%rowtype;
begin
  select * into existing from public.telegram_update_logs where telegram_update_id=p_update_id for update;
  if not found or existing.lease_token is distinct from p_token or existing.status<>'RECEIVED' or existing.lease_expires_at <= now() then raise exception 'Update lease expired'; end if;
  insert into public.telegram_operation_results(telegram_update_id,operation) values(p_update_id,p_operation) on conflict do nothing;
  select result into operation_result from public.telegram_operation_results where telegram_update_id=p_update_id and operation=p_operation for update;
  if operation_result is not null then return operation_result; end if;
  case p_operation
  when 'record_telegram_expense' then
    operation_result:=public.record_telegram_expense((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,p_args->>'p_category_code',(p_args->>'p_amount')::numeric,(p_args->>'p_currency')::char(3),(p_args->>'p_occurred_at')::timestamptz,(p_args->>'p_odometer_km')::numeric,(p_args->>'p_quantity')::numeric,p_args->>'p_unit',(p_args->>'p_price_per_unit')::numeric,p_args->>'p_location_text',p_args->>'p_comment');
  when 'record_telegram_odometer' then
    operation_result:=public.record_telegram_odometer((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,(p_args->>'p_value_km')::numeric,(p_args->>'p_recorded_at')::timestamptz);
  when 'record_telegram_vehicle_status' then
    operation_result:=public.record_telegram_vehicle_status((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,p_args->>'p_status_code',p_args->>'p_load_state',p_args->>'p_location_text',(p_args->>'p_recorded_at')::timestamptz);
  when 'driver_start_assigned_leg' then
    operation_result:=public.driver_start_assigned_leg((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,(p_args->>'p_odometer_km')::numeric,p_args->>'p_load_state');
  when 'driver_finish_assigned_leg' then
    operation_result:=public.driver_finish_assigned_leg((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,(p_args->>'p_odometer_km')::numeric);
  when 'record_telegram_trip_location' then
    operation_result:=public.record_telegram_trip_location((p_args->>'p_organization_id')::uuid,(p_args->>'p_driver_id')::uuid,(p_args->>'p_trip_id')::uuid,(p_args->>'p_latitude')::double precision,(p_args->>'p_longitude')::double precision,(p_args->>'p_horizontal_accuracy_m')::numeric,(p_args->>'p_recorded_at')::timestamptz,(p_args->>'p_telegram_message_id')::bigint,p_args->>'p_note',p_args->>'p_event_type');
  else raise exception 'Unsupported Telegram operation';
  end case;
  if operation_result is null then raise exception 'Operation returned no result'; end if;
  update public.telegram_operation_results set result=operation_result where telegram_update_id=p_update_id and operation=p_operation;
  return operation_result;
end;
$$;
revoke all on function public.claim_telegram_update(bigint,text,uuid) from public, anon, authenticated;
revoke all on function public.complete_telegram_update(bigint,uuid,boolean,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.execute_telegram_operation(bigint,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_telegram_update(bigint,text,uuid) to service_role;
grant execute on function public.complete_telegram_update(bigint,uuid,boolean,boolean,jsonb) to service_role;
grant execute on function public.execute_telegram_operation(bigint,uuid,text,jsonb) to service_role;
