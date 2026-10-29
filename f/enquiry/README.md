# Beforest enquiry capture

Public endpoint after deployment:

`POST https://windmill.devsharsha.live/api/r/beforest-automations/beforest/enquiry/submit`

The endpoint stores accepted submissions in `main.beforest_enquiry_submissions` and creates the table and indexes on the first accepted submission. The browser never receives or uses a Windmill token.

Local validation:

```powershell
wmill lint f/enquiry
wmill script preview f/enquiry/capture_enquiry.ts -d '{"body":{"request_id":"10bdfd17-97b8-4baf-bd98-041911988034","full_name":"Test Enquiry","email":"test@example.com","phone":"9876543210","interest":"General enquiry","consent":true,"consent_text":"I have read and agree to the Terms & Conditions and acknowledge the Privacy Policy. I authorize Beforest Lifestyle Solutions Pvt. Ltd. and its authorized representatives to contact me regarding my enquiry, products, services, events, and updates via phone calls, SMS, email, and WhatsApp, including if my number is registered under DND/NDNC.","consent_version":"2026-08-05","privacy_policy_url":"https://beforest.co/privacy-policy/","terms_url":"https://beforest.co/terms-and-conditions/","submitted_at":"2026-08-05T08:00:05.000Z","form_started_at":"2026-08-05T08:00:00.000Z"},"dry_run":true}'
```

Deployment (run manually from the repository root):

```powershell
wmill generate-metadata f/enquiry --yes --strict-folder-boundaries
wmill sync push --yes -i "f/enquiry/**" --include-triggers
```

