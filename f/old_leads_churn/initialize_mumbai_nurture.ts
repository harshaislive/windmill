import * as wmill from 'windmill-client';

/** Isolated queue and journal. No prospect or CRM call is made here. */
export async function main(dry_run: boolean = true) {
  if (dry_run) return { dry_run: true, tables: [
    'mumbai_nurture_recipients', 'mumbai_nurture_source_links',
    'mumbai_nurture_sends', 'mumbai_nurture_events', 'mumbai_nurture_daily_capacity',
    'mumbai_nurture_handoffs',
    'mumbai_nurture_mail_cursors',
    'mumbai_nurture_admission_approvals',
    'mumbai_nurture_notes',
    'mumbai_nurture_bounce_cursors',
    'mumbai_nurture_internal_tests',
    'mumbai_nurture_internal_replies',
  ] };
  const sql = wmill.datatable('main');
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_recipients (
    id bigserial PRIMARY KEY,
    email_normalized text NOT NULL UNIQUE,
    person_name text,
    zoho_lead_id text UNIQUE,
    zoho_contact_id text UNIQUE,
    admission_mode text NOT NULL DEFAULT 'crm' CHECK(admission_mode IN ('crm','gmail')),
    sender text NOT NULL CHECK (sender IN ('sai@beforest.co','community@beforest.co','yogesh@beforest.co','harish@beforest.co')),
    owner_name text NOT NULL,
    owner_user_id text,
    collective text NOT NULL DEFAULT 'Mumbai',
    state text NOT NULL DEFAULT 'HELD',
    stop_reason text,
    next_step smallint CHECK (next_step BETWEEN 1 AND 6),
    next_due_at timestamptz,
    last_verified_send_at timestamptz,
    source_version text NOT NULL DEFAULT 'mumbai-v1',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_source_links (
    deal_id text PRIMARY KEY,
    recipient_id bigint NOT NULL REFERENCES mumbai_nurture_recipients(id),
    spreadsheet_id text NOT NULL,
    sheet_name text NOT NULL,
    sheet_row integer,
    source_present boolean NOT NULL DEFAULT true,
    batch_id text,
    linked_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_sends (
    id bigserial PRIMARY KEY,
    recipient_id bigint NOT NULL REFERENCES mumbai_nurture_recipients(id),
    sequence_version text NOT NULL DEFAULT 'mumbai-v1',
    step smallint NOT NULL CHECK (step BETWEEN 1 AND 6),
    status text NOT NULL CHECK (status IN ('RESERVED','ATTEMPTING','UNCERTAIN','VERIFIED_SENT','CANCELLED')),
    intended_payload_hash text,
    recipient_email text NOT NULL,
    sender text NOT NULL,
    crm_message_id text UNIQUE,
    transport text NOT NULL DEFAULT 'zoho_crm' CHECK(transport IN ('zoho_crm','gmail_smtp')),
    mail_message_id text UNIQUE,
    attempt_count integer NOT NULL DEFAULT 0,
    reserved_at timestamptz,
    attempted_at timestamptz,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recipient_id, sequence_version, step)
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_events (
    event_key text PRIMARY KEY,
    recipient_id bigint NOT NULL REFERENCES mumbai_nurture_recipients(id),
    kind text NOT NULL CHECK (kind IN ('REPLY','OPTOUT','BOUNCE','SALES_HANDOFF','COLLECTIVE_CHANGE','ADDRESS_CHANGE','IDENTITY_HOLD')),
    source text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_daily_capacity (
    local_day date NOT NULL,
    scope text NOT NULL,
    reserved_count integer NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    verified_count integer NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (local_day, scope)
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_handoffs (
    event_key text PRIMARY KEY REFERENCES mumbai_nurture_events(event_key),
    recipient_id bigint NOT NULL REFERENCES mumbai_nurture_recipients(id),
    status text NOT NULL CHECK (status IN ('RESERVED','ATTEMPTING','UNCERTAIN','VERIFIED')),
    crm_task_id text UNIQUE,
    attempted_at timestamptz,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_mail_cursors (
    recipient_id bigint PRIMARY KEY REFERENCES mumbai_nurture_recipients(id),
    sender text NOT NULL,
    uid_validity text NOT NULL,
    last_uid bigint NOT NULL CHECK (last_uid >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_admission_approvals (
    recipient_id bigint PRIMARY KEY REFERENCES mumbai_nurture_recipients(id),
    reviewed_email text NOT NULL,
    source_version text NOT NULL,
    consent_confirmed boolean NOT NULL,
    active_sales_clear boolean NOT NULL,
    allow_crm_create boolean NOT NULL DEFAULT false,
    company_for_new_lead text NOT NULL DEFAULT '',
    reviewed_by text NOT NULL,
    reviewed_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_notes (
    event_key text PRIMARY KEY REFERENCES mumbai_nurture_events(event_key),
    recipient_id bigint NOT NULL REFERENCES mumbai_nurture_recipients(id),
    status text NOT NULL CHECK (status IN ('ATTEMPTING','UNCERTAIN','VERIFIED')),
    crm_note_id text UNIQUE,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_bounce_cursors (
    sender text PRIMARY KEY,
    uid_validity text NOT NULL,
    last_uid bigint NOT NULL CHECK (last_uid>=0),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_internal_tests (
    qa_key text PRIMARY KEY,
    recipient_email text NOT NULL,
    crm_module text NOT NULL,
    crm_record_id text NOT NULL,
    sender text NOT NULL,
    step smallint NOT NULL,
    payload_sha256 text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL CHECK (status IN ('ATTEMPTING','UNCERTAIN','VERIFIED','REJECTED')),
    crm_message_id text UNIQUE,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    verified_at timestamptz
  )`.execute();
  await sql`ALTER TABLE mumbai_nurture_internal_tests
    ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb`.execute();
  await sql`CREATE TABLE IF NOT EXISTS mumbai_nurture_internal_replies (
    qa_key text PRIMARY KEY REFERENCES mumbai_nurture_internal_tests(qa_key),
    recipient_email text NOT NULL,
    sender_inbox text NOT NULL,
    uid_validity text NOT NULL,
    imap_uid bigint NOT NULL,
    rfc_message_id text,
    received_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
  )`.execute();
  await sql`CREATE INDEX IF NOT EXISTS mumbai_nurture_due_idx ON mumbai_nurture_recipients (next_due_at, id) WHERE state = 'READY'`.execute();
  const rows = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mumbai_nurture_%' ORDER BY table_name`.fetch();
  return { dry_run: false, tables: rows.map((r: any) => r.table_name) };
}
