-- Management reporting: preserve every recorded cost in the actual result while
-- allowing exceptional costs to be excluded from the normalized operating view.

alter table public.expenses
  add column cost_behavior text not null default 'VARIABLE'
    check (cost_behavior in ('VARIABLE', 'FIXED', 'RESERVE', 'ONE_OFF', 'CAPITAL')),
  add column include_in_normalized_cost boolean not null default true;

comment on column public.expenses.cost_behavior is
  'Management classification: variable, fixed, reserve, one-off or capital expenditure.';

comment on column public.expenses.include_in_normalized_cost is
  'False keeps the expense in actual totals but removes it from normalized operating cost.';

create index expenses_management_report_idx
  on public.expenses (organization_id, occurred_at desc, cost_behavior)
  where deleted_at is null and status = 'RECORDED';

