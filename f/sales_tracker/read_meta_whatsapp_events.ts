import * as wmill from "windmill-client";

export async function main() {
  const sql = wmill.datatable("main");
  return { events: await sql`SELECT e.event_kind,e.message_id,e.recipient,e.provider_status,
    e.provider_timestamp,e.errors,e.flow_token,e.payload,e.received_at,e.job_id,
    a.batch_id AS test_batch,a.template_name
    FROM sales_tracker_meta_whatsapp_events e
    LEFT JOIN sales_tracker_whatsapp_test_attempts a ON a.message_id=e.message_id
    ORDER BY e.received_at DESC LIMIT 50`.fetch() };
}
