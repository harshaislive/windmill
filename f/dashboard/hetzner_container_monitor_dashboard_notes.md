# Hetzner Container Monitor Dashboard

This is a simple explanation of what we built, written like we are explaining it to a 12 year old.

## The Big Idea

We have a server on Hetzner.

That server runs many small apps inside Docker containers. Some containers run Windmill, some run Coolify, some run n8n, some run Beforest apps, and some run databases.

We wanted one simple dashboard in Windmill that tells us:

- Is the server alive?
- When did it last send data?
- Which project is using CPU?
- Which project is using memory?
- Which containers are running?
- Which containers need attention?
- Which Coolify project does each container belong to?

So we made a small monitoring system.

## How The Data Moves

Think of it like a school report card.

The Hetzner server checks itself and sends a report to Windmill.

```text
Hetzner server
  -> collector.py checks the server
  -> sends JSON to Windmill webhook
  -> Windmill saves it in database tables
  -> Dashboard reads those tables
  -> We see a clean screen with project/container health
```

## Part 1: The Hetzner Collector

On the Hetzner server, there is a Python file:

```text
/opt/hetzner-windmill-monitor/collector.py
```

That file collects information like:

- Server name
- Time of the report
- CPU load
- Memory usage
- Disk usage
- Docker containers
- Docker container CPU usage
- Docker container memory usage
- Docker network usage
- Docker block IO
- Open ports
- SSH login summary
- Suspicious or risky containers

Then it sends all of this as a JSON payload to Windmill.

## Part 2: Windmill Webhook

Windmill receives the report through this HTTP trigger:

```text
f/dashboard/hetzner_windmill_monitor
```

The public route is:

```text
https://windmill.devsharsha.live/api/r/hetzner/windmill-monitor
```

The server must send the secret header:

```text
X-Monitor-Secret
```

This makes sure random people cannot send fake monitor data.

## Part 3: Raw Payload Table

First, Windmill saves the full report exactly as it came in.

This table is:

```text
main.hetzner_windmill_monitor_snapshots
```

This is the main source of truth.

It stores:

- `snapshot_id`
- `received_at`
- `monitor_timestamp`
- `server`
- `hostname`
- `load_1m`
- `load_5m`
- `load_15m`
- `memory_used_percent`
- `root_disk_used_percent`
- `docker_disk_used_percent`
- `docker_container_count`
- `suspicious_count`
- `host`
- `docker`
- `suspicious`
- `top_processes`
- `top_containers`
- `docker_disk_report`
- `raw_payload`

The important bit: `raw_payload` keeps the full original JSON report.

So even if we later change the dashboard, we still have the full data.

## Part 4: Project Table

The raw report is big and nested.

Dashboards do not like reading giant nested JSON every time.

So we also made a clean project-level table:

```text
main.hetzner_windmill_monitor_project_snapshots
```

This table says:

```text
For this snapshot, this Coolify project used this much CPU and memory.
```

It stores things like:

- Project name
- Resource name
- Service name
- Environment
- Public domains
- Container count
- Total CPU percent
- Max memory percent
- Suspicious count
- Suspicious reasons
- Containers inside the project

Example project:

```text
project_name: windmill-automations
resource_name: windmill-ago44g8w4004sk8wckc00kc4
container_count: 7
cpu_percent_sum: 8.43
memory_percent_max: 2.49
suspicious_count: 3
```

## Part 5: Container Table

We also made a clean container-level table:

```text
main.hetzner_windmill_monitor_container_snapshots
```

This table says:

```text
For this snapshot, this exact container was using this much CPU and memory.
```

It stores things like:

- Container name
- Project name
- Resource name
- Service name
- Image
- Running status
- CPU percent
- Memory percent
- Memory usage text
- Network IO
- Block IO
- Restart count
- Network mode
- Whether it is privileged
- Public domains
- Ports
- Risky mounts
- Suspicious reasons
- Full raw container JSON

Example container:

```text
container_name: windmill-worker-1-ago44g8w4004sk8wckc00kc4
project_name: windmill-automations
service_name: windmill-worker-1
cpu_percent: 1.16
memory_percent: 0.41
suspicious_reasons: risky_host_mount
```

## Part 6: How We Know Coolify Project Names

Docker containers have labels.

Coolify adds labels to containers it manages.

Example labels:

```text
coolify.projectName
coolify.resourceName
coolify.serviceName
coolify.environmentName
coolify.type
```

We use those labels to connect a Docker container back to its Coolify project.

That is how the dashboard can show a dropdown like:

```text
All projects
10percent
be-experiences
bewebinars
collectives
delhivery-server
eclipse
geminilive
hospitality
ig-agent
myn8n
n8n
simulations-sales
vectorsearch
waha-gateway
windmill-automations
Coolify System / coolify
Coolify System / redis
Coolify Proxy
```

## Part 7: Dashboard Backend

The dashboard does not directly read the giant raw JSON.

It calls this Windmill script:

```text
f/dashboard/get_hetzner_monitor_dashboard
```

Local file:

```text
f/dashboard/get_hetzner_monitor_dashboard.ts
```

This script:

1. Finds the latest server snapshot.
2. Reads the host summary.
3. Reads Docker project usage.
4. Reads container usage.
5. Builds the project dropdown list.
6. Filters containers when a project is selected.
7. Returns clean dashboard data.

It returns:

- Latest snapshot
- Host memory/disk/load data
- Health warnings
- Project list
- Selected project
- Container rows
- Recent history
- Top host processes

## Part 8: Dashboard App

The Windmill raw app is:

```text
f/dashboard/hetzner_container_monitor_dashboard
```

Local folder:

```text
f/dashboard/hetzner_container_monitor_dashboard__raw_app
```

The dashboard screen shows:

- Last received time
- Server load
- Host memory
- Disk usage
- Container count
- Watch item count
- Project dropdown
- Project summary
- Projects by memory
- Watch items
- Container table
- Recent snapshot bars
- Top host processes

## What The Dashboard Looks Like

It is simple and not fancy.

It uses a black-text, white-background, TUI-style layout like our other operational dashboards.

Example:

```text
Beforest server monitor
Hetzner Container Pulse

Project: [ windmill-automations v ]    [ Refresh ]

Last received     Load             Memory      Disk       Containers   Watch
20 May 04:36 PM   0.45/0.64/0.65   19.7%       12.9%      32           5

Project Summary
windmill-automations
7 containers
CPU total: 8.43%
Memory max: 2.49%
Watch items: 3

Containers
Project              Service              CPU     Memory      Status    Watch
windmill-automations db                   4.21%   779.8MiB    running   ok
windmill-automations windmill-worker-1    1.16%   128.4MiB    running   risky_host_mount
windmill-automations windmill-worker-2    0.76%   135.3MiB    running   risky_host_mount
```

## What We Verified

We checked that Windmill received real data.

Latest tested snapshot had:

```text
server: beforestjan
containers: 32
projects: 22
watch items: 5
memory used: 19.71%
disk used: 12.93%
```

We also tested the dropdown.

For:

```text
windmill-automations
```

The backend returned:

```text
containers: 7
watch items: 3
```

So the project filter works.

## Watch Items

A watch item does not always mean something is bad.

It means:

```text
Look at this carefully.
```

Right now, the common watch reason is:

```text
risky_host_mount
```

This usually means a container can access something sensitive from the host, like:

```text
/var/run/docker.sock
```

Some containers need this to do their job, but we still mark it so we remember it is powerful.

## Files We Added Or Changed

Changed receiver:

```text
f/dashboard/hetzner_windmill_monitor.ts
```

Added dashboard backend:

```text
f/dashboard/get_hetzner_monitor_dashboard.ts
f/dashboard/get_hetzner_monitor_dashboard.script.yaml
f/dashboard/get_hetzner_monitor_dashboard.script.lock
```

Added raw app:

```text
f/dashboard/hetzner_container_monitor_dashboard__raw_app/
```

Important raw app files:

```text
App.tsx
index.css
index.html
index.tsx
wmill.ts
raw_app.yaml
backend/get_hetzner_monitor_dashboard.yaml
package.json
```

## The Short Version

We built a monitor like this:

```text
Server checks itself
  -> sends JSON to Windmill
  -> Windmill saves raw data
  -> Windmill also creates clean project/container rows
  -> Dashboard reads those rows
  -> We can choose a Coolify project from dropdown
  -> We can see what each project and container is consuming
```

This helps us quickly answer:

```text
What is happening on the server right now?
Which project is heavy?
Which container needs attention?
Is Windmill still receiving monitor data?
```
