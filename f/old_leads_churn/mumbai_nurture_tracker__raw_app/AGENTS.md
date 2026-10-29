# Mumbai nurture tracker

Public password-protected Windmill dashboard, authorized by Harsha on 1 October 2026: f/old_leads_churn/mumbai_nurture_tracker, app ID22.
https://flows.ops.beforest.co/apps/get/f/old_leads_churn/mumbai_nurture_tracker?workspace=beforest-automations

Public sales-team URL: https://flows.ops.beforest.co/api/r/mumbai-churn/dashboard . Harsha corrected access on 5 October 2026: the code is today's Asia/Kolkata date in DDMMYYYY, recomputed server-side before every data read and changing at midnight IST. The former dashboard_passcode_sha256 variable is unused; never restore the fixed code. Never embed the current code in frontend assets, URLs or public responses. Frontend stores the entered code only in sessionStorage and sends it in X-Mumbai-Churn-Passcode. Lock dashboard and India date rollover clear access and loaded data. Test missing/wrong/current/previous-day access and midnight IST after changes.

Read-only. Backend references only f/old_leads_churn/read_mumbai_nurture_dashboard. Reads exact existing Mumbai queue/journal and supplementary names from Harsha Maton google-sheets. No send, write, import, admission or CRM promotion buttons. Never expose secrets or technical message IDs in this UI. Public raw-app SQL table permissions are empty; data comes only through the protected reader. Scope deployments to this app and its dedicated public route.

The standalone reader consumes existing main datatable tables as the publisher. All SQL must remain SELECT-only. No schema migrations. Auto-refresh every60seconds. Legacy historical sends are included in total; sends today uses Asia/Kolkata date. Original sixstep sequence and48hminimum. InternalQA is labelled/excluded from genuine reply count. Requested policy is newprospect database-only tracking, with Harsha deciding any later Zoho promotion. The public route embeds the built existing UI; rebuild assets after UI edits.
