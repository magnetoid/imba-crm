-- ═════════════════════════════════════════════════════════════════════════
--  20260522_call_analyzer_trigger.sql
--
--  Phase 7f — wire the call-analyzer agent to run whenever a recording
--  URL lands on a crm_activities row of type='meeting'. The columns
--  (recording_url, transcript_url, transcript_text, coach_notes) were
--  added in 20260520_phase7f_call_intel.sql.
--
--  Idempotent.
-- ═════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.trg_enqueue_call_analyzer()
returns trigger language plpgsql as $$
begin
  -- Fire on insert if recording_url is already set, or on update when
  -- recording_url goes from NULL → set, or transcript_text gets filled.
  if (tg_op = 'INSERT'  and new.recording_url   is not null)
  or (tg_op = 'UPDATE'  and (new.recording_url  is distinct from old.recording_url
                          or new.transcript_text is distinct from old.transcript_text))
  then
    -- Skip if already analysed (coach_notes is non-empty).
    if coalesce(new.coach_notes, '{}'::jsonb) <> '{}'::jsonb then
      return new;
    end if;
    insert into public.crm_agent_jobs (agent_kind, lead_id, input, triggered_by)
    values (
      'call-analyzer',
      new.lead_id,
      jsonb_build_object('activity_id', new.id, 'reason', 'recording_or_transcript_set'),
      'trigger:crm_activities'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_call_analyzer on public.crm_activities;
create trigger trg_enqueue_call_analyzer
  after insert or update of recording_url, transcript_text on public.crm_activities
  for each row execute function public.trg_enqueue_call_analyzer();

-- Wire the agent into autonomy overrides as 'auto' — extracting coach
-- notes is read-only AI work, no need for human approval. Operator can
-- flip to 'approval' from Settings if they want to gate it.
update public.crm_runtime_settings
set agent_autonomy_overrides = coalesce(agent_autonomy_overrides, '{}'::jsonb)
  || jsonb_build_object('call-analyzer', 'auto')
where id = 1;

commit;
