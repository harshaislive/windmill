import * as wmill from "windmill-client";

type MonitorPayload = {
  server?: string;
  timestamp?: string;
  host?: Record<string, any>;
  docker?: {
    containers?: any[];
    top_cpu?: any[];
    suspicious?: any[];
  };
  docker_disk_report?: string;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function unwrapBody(body: unknown): MonitorPayload {
  const record = asRecord(body);
  if ("body" in record && Object.keys(record).length <= 4) {
    return asRecord(record.body) as MonitorPayload;
  }
  return record as MonitorPayload;
}

function validIso(value: unknown) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function firstMountPercent(disks: unknown, mount: string) {
  if (!Array.isArray(disks)) return null;
  const disk = disks.find((item) => asRecord(item).mount === mount);
  const percent = asRecord(disk).used_percent;
  return typeof percent === "number" ? percent : null;
}

function stringOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function identityFromContainer(container: Record<string, any>) {
  const identity = asRecord(container.project_identity);
  const labels = asRecord(container.coolify_labels);
  return {
    project:
      stringOrNull(identity.coolify_project) ||
      stringOrNull(labels["coolify.projectName"]),
    resource:
      stringOrNull(identity.coolify_resource) ||
      stringOrNull(labels["coolify.resourceName"]),
    service:
      stringOrNull(identity.coolify_service) ||
      stringOrNull(labels["coolify.serviceName"]) ||
      stringOrNull(identity.compose_service),
    environment:
      stringOrNull(identity.coolify_environment) ||
      stringOrNull(labels["coolify.environmentName"]),
    type:
      stringOrNull(identity.coolify_type) ||
      stringOrNull(labels["coolify.type"]),
    domains: arrayValue(identity.public_domains),
  };
}

function projectKey(project: unknown, resource: unknown) {
  return `${stringOrNull(project) || "unknown-project"}::${stringOrNull(resource) || "unknown-resource"}`;
}

async function payloadHash(payload: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload ?? null));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function ensureTables() {
  const sql = wmill.datatable("main");
  await sql`
    CREATE TABLE IF NOT EXISTS hetzner_windmill_monitor_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      monitor_timestamp TIMESTAMPTZ NOT NULL,
      server TEXT NOT NULL,
      hostname TEXT,
      load_1m DOUBLE PRECISION,
      load_5m DOUBLE PRECISION,
      load_15m DOUBLE PRECISION,
      memory_used_percent DOUBLE PRECISION,
      root_disk_used_percent DOUBLE PRECISION,
      docker_disk_used_percent DOUBLE PRECISION,
      docker_container_count INTEGER NOT NULL DEFAULT 0,
      suspicious_count INTEGER NOT NULL DEFAULT 0,
      payload_sha256 TEXT NOT NULL,
      host JSONB NOT NULL DEFAULT '{}'::JSONB,
      docker JSONB NOT NULL DEFAULT '{}'::JSONB,
      suspicious JSONB NOT NULL DEFAULT '[]'::JSONB,
      top_processes JSONB NOT NULL DEFAULT '[]'::JSONB,
      top_containers JSONB NOT NULL DEFAULT '[]'::JSONB,
      docker_disk_report TEXT,
      raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_received_at ON hetzner_windmill_monitor_snapshots (received_at DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_server_time ON hetzner_windmill_monitor_snapshots (server, monitor_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_suspicious ON hetzner_windmill_monitor_snapshots (suspicious_count DESC)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS hetzner_windmill_monitor_project_snapshots (
      snapshot_id TEXT NOT NULL REFERENCES hetzner_windmill_monitor_snapshots(snapshot_id) ON DELETE CASCADE,
      received_at TIMESTAMPTZ NOT NULL,
      monitor_timestamp TIMESTAMPTZ NOT NULL,
      server TEXT NOT NULL,
      project_key TEXT NOT NULL,
      project_name TEXT NOT NULL,
      resource_name TEXT,
      service_name TEXT,
      coolify_type TEXT,
      environment_name TEXT,
      public_domains JSONB NOT NULL DEFAULT '[]'::JSONB,
      container_count INTEGER NOT NULL DEFAULT 0,
      cpu_percent_sum DOUBLE PRECISION,
      memory_percent_max DOUBLE PRECISION,
      suspicious_count INTEGER NOT NULL DEFAULT 0,
      suspicious_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
      containers JSONB NOT NULL DEFAULT '[]'::JSONB,
      raw_project JSONB NOT NULL DEFAULT '{}'::JSONB,
      PRIMARY KEY (snapshot_id, project_key)
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_project_latest ON hetzner_windmill_monitor_project_snapshots (project_name, monitor_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_project_cpu ON hetzner_windmill_monitor_project_snapshots (cpu_percent_sum DESC)`.execute();

  await sql`
    CREATE TABLE IF NOT EXISTS hetzner_windmill_monitor_container_snapshots (
      snapshot_id TEXT NOT NULL REFERENCES hetzner_windmill_monitor_snapshots(snapshot_id) ON DELETE CASCADE,
      received_at TIMESTAMPTZ NOT NULL,
      monitor_timestamp TIMESTAMPTZ NOT NULL,
      server TEXT NOT NULL,
      container_name TEXT NOT NULL,
      project_key TEXT NOT NULL,
      project_name TEXT NOT NULL,
      resource_name TEXT,
      service_name TEXT,
      coolify_type TEXT,
      environment_name TEXT,
      image TEXT,
      status TEXT,
      running BOOLEAN,
      cpu_percent DOUBLE PRECISION,
      memory_percent DOUBLE PRECISION,
      memory_usage TEXT,
      network_io TEXT,
      block_io TEXT,
      pids TEXT,
      restart_count INTEGER,
      network_mode TEXT,
      privileged BOOLEAN,
      coolify_labelled BOOLEAN,
      public_domains JSONB NOT NULL DEFAULT '[]'::JSONB,
      ports JSONB NOT NULL DEFAULT '{}'::JSONB,
      risky_mounts JSONB NOT NULL DEFAULT '[]'::JSONB,
      suspicious_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
      raw_container JSONB NOT NULL DEFAULT '{}'::JSONB,
      PRIMARY KEY (snapshot_id, container_name)
    )
  `.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_container_project_latest ON hetzner_windmill_monitor_container_snapshots (project_name, monitor_timestamp DESC)`.execute();
  await sql`CREATE INDEX IF NOT EXISTS idx_hetzner_monitor_container_cpu ON hetzner_windmill_monitor_container_snapshots (cpu_percent DESC)`.execute();
}

export async function main(
  body: unknown = null,
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
  dry_run = false,
) {
  const payload = unwrapBody(body);
  const host = asRecord(payload.host);
  const docker = asRecord(payload.docker);
  const memory = asRecord(host.memory);
  const loadavg = Array.isArray(host.loadavg) ? host.loadavg : [];
  const containers = Array.isArray(docker.containers) ? docker.containers : [];
  const suspicious = Array.isArray(docker.suspicious) ? docker.suspicious : [];
  const topContainers = Array.isArray(docker.top_cpu) ? docker.top_cpu : containers.slice(0, 10);
  const server = String(payload.server || host.hostname || "unknown");
  const monitorTimestamp = validIso(payload.timestamp);
  const hash = await payloadHash(payload);
  const snapshotId = `${server}:${monitorTimestamp}:${hash.slice(0, 16)}`;

  const summary = {
    snapshot_id: snapshotId,
    server,
    hostname: host.hostname ? String(host.hostname) : null,
    monitor_timestamp: monitorTimestamp,
    loadavg,
    memory_used_percent: typeof memory.used_percent === "number" ? memory.used_percent : null,
    root_disk_used_percent: firstMountPercent(host.disk, "/"),
    docker_disk_used_percent: firstMountPercent(host.disk, "/var/lib/docker"),
    docker_container_count: containers.length,
    suspicious_count: suspicious.length,
    suspicious,
  };

  if (dry_run) {
    return {
      ok: true,
      dry_run: true,
      summary,
      header_keys: Object.keys(headers ?? {}),
      query,
    };
  }

  await ensureTables();
  const sql = wmill.datatable("main");
  await sql`
    INSERT INTO hetzner_windmill_monitor_snapshots (
      snapshot_id, received_at, monitor_timestamp, server, hostname,
      load_1m, load_5m, load_15m, memory_used_percent,
      root_disk_used_percent, docker_disk_used_percent,
      docker_container_count, suspicious_count, payload_sha256,
      host, docker, suspicious, top_processes, top_containers,
      docker_disk_report, raw_payload
    ) VALUES (
      ${snapshotId}, NOW(), ${monitorTimestamp}::TIMESTAMPTZ, ${server}, ${summary.hostname},
      ${typeof loadavg[0] === "number" ? loadavg[0] : null},
      ${typeof loadavg[1] === "number" ? loadavg[1] : null},
      ${typeof loadavg[2] === "number" ? loadavg[2] : null},
      ${summary.memory_used_percent}::DOUBLE PRECISION,
      ${summary.root_disk_used_percent}::DOUBLE PRECISION,
      ${summary.docker_disk_used_percent}::DOUBLE PRECISION,
      ${containers.length}::INTEGER,
      ${suspicious.length}::INTEGER,
      ${hash},
      ${JSON.stringify(host)}::TEXT::JSONB,
      ${JSON.stringify(docker)}::TEXT::JSONB,
      ${JSON.stringify(suspicious)}::TEXT::JSONB,
      ${JSON.stringify(Array.isArray(host.top_processes) ? host.top_processes : [])}::TEXT::JSONB,
      ${JSON.stringify(topContainers)}::TEXT::JSONB,
      ${payload.docker_disk_report || null},
      ${JSON.stringify(payload)}::TEXT::JSONB
    )
    ON CONFLICT (snapshot_id) DO UPDATE SET
      received_at = NOW(),
      host = EXCLUDED.host,
      docker = EXCLUDED.docker,
      suspicious = EXCLUDED.suspicious,
      top_processes = EXCLUDED.top_processes,
      top_containers = EXCLUDED.top_containers,
      docker_disk_report = EXCLUDED.docker_disk_report,
      raw_payload = EXCLUDED.raw_payload
  `.execute();

  const projectUsage = Array.isArray(docker.project_usage) ? docker.project_usage : [];
  const projectByContainer = new Map<string, Record<string, any>>();
  for (const project of projectUsage) {
    const projectRecord = asRecord(project);
    for (const container of arrayValue(projectRecord.containers)) {
      const name = asRecord(container).name;
      if (name) projectByContainer.set(String(name), projectRecord);
    }
  }

  await sql`DELETE FROM hetzner_windmill_monitor_project_snapshots WHERE snapshot_id = ${snapshotId}`.execute();
  await sql`DELETE FROM hetzner_windmill_monitor_container_snapshots WHERE snapshot_id = ${snapshotId}`.execute();

  for (const project of projectUsage) {
    const item = asRecord(project);
    const key = projectKey(item.project, item.resource);
    await sql`
      INSERT INTO hetzner_windmill_monitor_project_snapshots (
        snapshot_id, received_at, monitor_timestamp, server, project_key,
        project_name, resource_name, service_name, coolify_type, environment_name,
        public_domains, container_count, cpu_percent_sum, memory_percent_max,
        suspicious_count, suspicious_reasons, containers, raw_project
      ) VALUES (
        ${snapshotId}, NOW(), ${monitorTimestamp}::TIMESTAMPTZ, ${server}, ${key},
        ${String(item.project || "unknown-project")}, ${stringOrNull(item.resource)},
        ${stringOrNull(item.service)}, ${stringOrNull(item.type)}, ${stringOrNull(item.environment)},
        ${JSON.stringify(arrayValue(item.public_domains))}::TEXT::JSONB,
        ${numberOrNull(item.container_count)}::INTEGER,
        ${numberOrNull(item.cpu_percent_sum)}::DOUBLE PRECISION,
        ${numberOrNull(item.memory_percent_max)}::DOUBLE PRECISION,
        ${numberOrNull(item.suspicious_count)}::INTEGER,
        ${JSON.stringify(arrayValue(item.suspicious_reasons))}::TEXT::JSONB,
        ${JSON.stringify(arrayValue(item.containers))}::TEXT::JSONB,
        ${JSON.stringify(item)}::TEXT::JSONB
      )
      ON CONFLICT (snapshot_id, project_key) DO UPDATE SET
        public_domains = EXCLUDED.public_domains,
        container_count = EXCLUDED.container_count,
        cpu_percent_sum = EXCLUDED.cpu_percent_sum,
        memory_percent_max = EXCLUDED.memory_percent_max,
        suspicious_count = EXCLUDED.suspicious_count,
        suspicious_reasons = EXCLUDED.suspicious_reasons,
        containers = EXCLUDED.containers,
        raw_project = EXCLUDED.raw_project
    `.execute();
  }

  for (const container of containers) {
    const item = asRecord(container);
    const identity = identityFromContainer(item);
    const projectRecord = projectByContainer.get(String(item.name)) || {};
    const project = identity.project || stringOrNull(projectRecord.project) || stringOrNull(item.compose_project) || "unknown-project";
    const resource = identity.resource || stringOrNull(projectRecord.resource);
    const service = identity.service || stringOrNull(projectRecord.service);
    const domains = identity.domains.length ? identity.domains : arrayValue(projectRecord.public_domains);
    const key = projectKey(project, resource);

    await sql`
      INSERT INTO hetzner_windmill_monitor_container_snapshots (
        snapshot_id, received_at, monitor_timestamp, server, container_name,
        project_key, project_name, resource_name, service_name, coolify_type,
        environment_name, image, status, running, cpu_percent, memory_percent,
        memory_usage, network_io, block_io, pids, restart_count, network_mode,
        privileged, coolify_labelled, public_domains, ports, risky_mounts,
        suspicious_reasons, raw_container
      ) VALUES (
        ${snapshotId}, NOW(), ${monitorTimestamp}::TIMESTAMPTZ, ${server}, ${String(item.name || "unknown-container")},
        ${key}, ${String(project)}, ${resource}, ${service}, ${identity.type || stringOrNull(projectRecord.type)},
        ${identity.environment || stringOrNull(projectRecord.environment)}, ${stringOrNull(item.image)}, ${stringOrNull(item.status)},
        ${typeof item.running === "boolean" ? item.running : null}::BOOLEAN,
        ${numberOrNull(item.cpu_percent)}::DOUBLE PRECISION,
        ${numberOrNull(item.memory_percent)}::DOUBLE PRECISION,
        ${stringOrNull(item.memory_usage)}, ${stringOrNull(item.network_io)}, ${stringOrNull(item.block_io)},
        ${stringOrNull(item.pids)}, ${numberOrNull(item.restart_count)}::INTEGER,
        ${stringOrNull(item.network_mode)}, ${typeof item.privileged === "boolean" ? item.privileged : null}::BOOLEAN,
        ${typeof item.coolify_labelled === "boolean" ? item.coolify_labelled : null}::BOOLEAN,
        ${JSON.stringify(domains)}::TEXT::JSONB,
        ${JSON.stringify(asRecord(item.ports))}::TEXT::JSONB,
        ${JSON.stringify(arrayValue(item.risky_mounts))}::TEXT::JSONB,
        ${JSON.stringify(arrayValue(item.suspicious_reasons))}::TEXT::JSONB,
        ${JSON.stringify(item)}::TEXT::JSONB
      )
      ON CONFLICT (snapshot_id, container_name) DO UPDATE SET
        project_key = EXCLUDED.project_key,
        project_name = EXCLUDED.project_name,
        resource_name = EXCLUDED.resource_name,
        service_name = EXCLUDED.service_name,
        cpu_percent = EXCLUDED.cpu_percent,
        memory_percent = EXCLUDED.memory_percent,
        suspicious_reasons = EXCLUDED.suspicious_reasons,
        raw_container = EXCLUDED.raw_container
    `.execute();
  }

  return {
    ok: true,
    stored: true,
    table: "main.hetzner_windmill_monitor_snapshots",
    derived_tables: [
      "main.hetzner_windmill_monitor_project_snapshots",
      "main.hetzner_windmill_monitor_container_snapshots",
    ],
    ...summary,
  };
}
