# 2026-11-12 Collective funnel: Typeform fills + failure alert (office PC)

- Secret `f/sales_tracker/typeform_read_token` (Harsha ran `wmill variable add` from ~/.config/typeform/token.env).
- `f/sales_tracker/collective_funnel_refresh`: 14fd92a98e2ecfbb -> 9918179394b9ba33 (`before.ts` / `after.ts`).
  New step `typeform`: completed responses per page form per IST day, team tests out, repeat = same email/phone already filled that form.
  Forms: kfcjiXxR Mumbai, hbDB2ybS Hammiyala, i8eBLQkz Poomaale 2.0, jfnFyUQF Poomaale 1.0, leXyUOuT Hyderabad, CYae8hmZ Bhopal.
  Alert: email harsha@ (Maton Gmail) when a source fails 2 runs in a row, max once per 6 h per source, + one "refreshing again". State in data.alerts.
- Template `dashboard_pages.funnel_live` updated (`tpl_before.html` / `tpl_after.html`); old one kept as row `funnel_live_prev_20261112`.
  Fills now from Typeform; falls back to lead-derived fills if typeform data is empty.
- Check 22 Sep -> 5 Nov: Typeform vs old page = HAM 87/87, BPL 10/10, P10 18/18, P20 54/55, MUM 48/50, HYD 42/32 (old page missed Vivek-sheet fills).
- Rollback: re-deploy before.ts content as a new version of the script; run put_tpl.ts with html = tpl_before.html.
- Tools: `wmrun.py` (bun preview job via CLI token), `get_tpl.ts`, `put_tpl.ts`, `test_alert.ts`.
