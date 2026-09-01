-- Retain every driver location point and let trip managers classify it.

alter table public.trip_location_points
  add column if not exists event_type text not null default 'CHECKPOINT',
  add column if not exists note text;

alter table public.trip_location_points
  drop constraint if exists trip_location_points_event_type_check,
  add constraint trip_location_points_event_type_check check (
    event_type in ('CHECKPOINT', 'REST', 'LOADING', 'UNLOADING', 'OTHER')
  ),
  drop constraint if exists trip_location_points_note_length_check,
  add constraint trip_location_points_note_length_check check (
    note is null or char_length(note) <= 300
  );

create or replace function public.update_trip_location_annotation(
  p_organization_id uuid,
  p_location_id uuid,
  p_event_type text,
  p_note text
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  current_point public.trip_location_points%rowtype;
  normalized_note text;
begin
  if not public.has_org_permission(p_organization_id, 'MANAGE_TRIPS') then
    raise exception 'Trip management permission required';
  end if;
  if p_event_type not in ('CHECKPOINT', 'REST', 'LOADING', 'UNLOADING', 'OTHER') then
    raise exception 'Invalid location event type';
  end if;

  normalized_note := nullif(trim(coalesce(p_note, '')), '');
  if normalized_note is not null and char_length(normalized_note) > 300 then
    raise exception 'Location note is too long';
  end if;

  select point.* into current_point
  from public.trip_location_points point
  where point.id = p_location_id
    and point.organization_id = p_organization_id
  for update;
  if not found then raise exception 'Location point not found'; end if;

  update public.trip_location_points
  set event_type = p_event_type,
      note = normalized_note
  where id = p_location_id and organization_id = p_organization_id;

  insert into public.audit_events (
    organization_id, entity_type, entity_id, action, actor_user_id, source, before_data, after_data
  ) values (
    p_organization_id,
    'trip_location_point',
    p_location_id,
    'ANNOTATED',
    auth.uid(),
    'WEB',
    jsonb_build_object('event_type', current_point.event_type, 'note', current_point.note),
    jsonb_build_object('event_type', p_event_type, 'note', normalized_note)
  );

  return p_location_id;
end;
$$;

revoke all on function public.update_trip_location_annotation(uuid, uuid, text, text) from public;
grant execute on function public.update_trip_location_annotation(uuid, uuid, text, text) to authenticated;
