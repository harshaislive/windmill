# Supabase Project Metrics Explainer

This document explains the Supabase Project Metrics dashboard in simple language.

The dashboard is like a daily health check for each Supabase project. It does not replace the Supabase billing page. It helps us notice early signs of load, waste, security risk, or capacity pressure so we can act before users feel problems.

## How The System Works

1. Windmill runs a scheduled job.
2. The job calls a Supabase Edge Function for each project.
3. The Edge Function reads Supabase privileged metrics.
4. It saves one row into `project_metrics_snapshots`.
5. The Windmill raw app reads those rows and shows the dashboard.

Each row is one snapshot. If the job runs once per day, each row is one day of evidence.

## Important Idea: Snapshot vs Delta

Some numbers are a direct reading at that moment.

Example: active connections is like asking, "How many people are inside the room right now?"

Some numbers are counters that keep increasing.

Example: network transmit total is like a car odometer. If the odometer says 10.71 GB, that does not mean today's usage is 10.71 GB. It means the total counter has reached 10.71 GB.

For these counters, the useful number is the difference from the previous snapshot.

Example:

```text
Today total:     10.71 GB
Yesterday total: 10.69 GB
Difference:       0.02 GB
```

So `egress_gb = 0.02` means around 0.02 GB moved out since the previous snapshot.

## Metrics We Track

### `timestamp`

What it means:
The time when the snapshot was taken.

Why we measure it:
Without time, we cannot understand whether a value is normal, increasing, decreasing, or sudden.

What can be acted upon:
If snapshots are missing, the schedule or Edge Function may be failing. Fix the collector before trusting the dashboard.

### `network_transmit_total_gb`

What it means:
The total network data transmitted by the project/node metric counter so far.

Why we measure it:
It helps us calculate how much network traffic happened between two snapshots.

What can be acted upon:
Do not treat this as today's billable egress. It is a raw total counter. Use it mainly to calculate the delta.

### `egress_gb`

What it means:
Network transmitted since the previous snapshot. This is calculated as:

```text
current network_transmit_total_gb - previous network_transmit_total_gb
```

Why we measure it:
It tells us whether traffic is growing. More egress can mean more users, heavier files, inefficient API calls, or unnecessary data transfer.

What can be acted upon:
If this suddenly jumps, check what changed: new app release, public file downloads, large API responses, repeated polling, or a bot. Reduce payload sizes, cache repeated responses, paginate large data, and avoid sending full rows when only a few fields are needed.

Note:
This may not exactly match Supabase Usage billing egress. Supabase billing can use different rules and date ranges.

### `active_connections`

What it means:
How many database connections are open at the snapshot time.

Why we measure it:
Too many open database connections can slow down or block the database.

What can be acted upon:
If this is high, check apps and scripts that open many database connections. Use connection pooling, close unused connections, avoid long-running queries, and reduce background jobs that hit the database too often.

### `cpu_percent`

What it means:
How busy the CPU was during the period between snapshots.

Why we measure it:
High CPU means the project is working hard. This may be due to heavy queries, too many requests, background jobs, or inefficient functions.

What can be acted upon:
If CPU stays high, inspect slow queries, add indexes, simplify expensive queries, reduce repeated jobs, and check Edge Functions or API routes doing heavy work.

### `disk_usage_percent`

What it means:
How much disk/storage is used as a percentage.

Why we measure it:
If disk usage gets too high, the database can become unhealthy or stop accepting writes.

What can be acted upon:
If disk usage keeps rising, archive old data, delete unused rows, clean logs, remove large unused files, or upgrade storage before it becomes urgent.

### `api_requests_count` or `api_requests_delta`

What it means:
How many API requests happened during the period, if stored as a delta. If it is a raw counter, it needs comparison with the previous snapshot.

Why we measure it:
Request count shows how much the project is being used. Sudden increases can be healthy growth or a problem.

What can be acted upon:
If requests jump suddenly, check traffic sources, frontend polling, automation loops, bots, and failing clients retrying too often. Add caching, backoff, rate limits, or better query filters.

### `db_storage_size`

What it means:
How large the database storage is.

Why we measure it:
Storage growth tells us whether data is accumulating normally or unexpectedly.

What can be acted upon:
If storage grows fast, find the biggest tables, check logs/events tables, and confirm whether old data should be archived or deleted.

### `tables_without_rls_count`

What it means:
How many tables do not have Row Level Security enabled.

Why we measure it:
RLS is one of Supabase's most important safety controls. Without it, public clients may access data too broadly if policies or keys are misused.

What can be acted upon:
Review the table names, enable RLS where needed, and add clear policies. Some internal-only tables may be okay without public access, but they should be reviewed intentionally.

### `tables_without_rls_names`

What it means:
The actual table names that do not have RLS enabled.

Why we measure it:
The count tells us there is a risk. The names tell us where to fix it.

What can be acted upon:
Start with customer, user, payment, lead, message, or private business tables. Public lookup tables may be lower risk.

### `failed_auth_attempts_24h`

What it means:
How many failed login attempts happened in the last 24 hours.

Why we measure it:
Failed logins can show password mistakes, broken login flows, bots, or attacks.

What can be acted upon:
If this jumps, check auth logs, suspicious IPs, recent frontend changes, and whether users are confused by the login flow. Add rate limiting or stronger checks if needed.

### `total_logins_24h`

What it means:
How many successful logins happened in the last 24 hours.

Why we measure it:
It gives a basic signal of real user activity.

What can be acted upon:
If logins drop suddenly, check site availability, auth provider status, recent releases, and whether users are getting blocked.

### `password_resets_24h`

What it means:
How many password reset requests happened in the last 24 hours.

Why we measure it:
Many resets can mean users are struggling, accounts are old, or someone is trying to attack accounts.

What can be acted upon:
If this jumps, check auth emails, reset UX, suspicious repeated requests, and whether users are reporting login trouble.

### `otp_requests_24h`

What it means:
How many OTP or magic-link style login requests happened in the last 24 hours.

Why we measure it:
It shows login activity and can reveal repeated retries.

What can be acted upon:
If OTP requests are high but successful logins are low, check email/SMS delivery, expired links, spam folders, and UI confusion.

### `new_signups_24h`

What it means:
How many new users signed up in the last 24 hours.

Why we measure it:
It helps connect technical load with business growth.

What can be acted upon:
If signups spike, watch database, API requests, and auth errors. If signups fall suddenly, check marketing links, forms, auth flows, and recent deployments.

## What Healthy Supabase Operation Looks Like

A smooth Supabase project usually has:

- snapshots arriving on time
- steady or explainable traffic
- low failed auth compared to successful logins
- database connections below dangerous levels
- CPU that does not stay high for long
- disk usage that grows slowly and predictably
- no sensitive public tables without RLS
- request spikes that can be explained by campaigns, product launches, or known jobs

## Simple Daily Review

Use this checklist once a day:

1. Did today's snapshot arrive?
2. Did `egress_gb` suddenly jump?
3. Did `api_requests_count` or request delta suddenly jump?
4. Are active connections unusually high?
5. Is CPU staying high?
6. Is disk usage moving toward a danger zone?
7. Did failed auth attempts increase?
8. Are there any important tables without RLS?

## What To Do When Something Looks Wrong

If traffic jumps:
Check new releases, marketing campaigns, bots, repeated polling, and large API responses.

If CPU jumps:
Check slow queries, missing indexes, expensive background jobs, and Edge Functions.

If connections jump:
Check scripts, workers, dashboards, and apps that may open too many DB connections.

If disk usage jumps:
Find large tables, logs, file uploads, and old event data.

If auth failures jump:
Check login delivery, frontend errors, suspicious repeated attempts, and user complaints.

If RLS issues appear:
Review those tables before exposing them to client-side apps.

## Final Rule

The dashboard should not be used as a billing invoice. It is an early warning system.

Supabase Usage tells us what Supabase bills or reports officially. This dashboard tells us what the project looks like operationally so we can keep it fast, safe, and predictable.
