# CAPI: send visitor UA + IP with Qualified1on1AnswerSignal (2026-11-06)
Why: 49 qualified signals in 14 days reached pixel 1038315946895688 with fbc/fbp, but Meta credited 0 to ads. action_source=website events need client_user_agent (+ client_ip_address).
Change: HTTP preprocessor reads User-Agent + first X-Forwarded-For hop; added to user_data for **embed** signals only (never for the Typeform webhook = Typeform's server).
Deployed: hash e287340f724a9598 (was 5a9ea84be4db86ce, created 2026-10-23). Tests: 16/16 (3 new). Meta test event accepted (trace ATq4Qw6CPEl5wXF7kTuGRmA).
Rollback: copy deployed_before.ts over f/sales/handle_typeform_qualified_1on1_signal.ts, restore schema from deployed_before_meta.json, `wmill script push`.
Note: the repo copy before this was an older 722-line version (local_repo_before.ts); repo now matches deployed.
