function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required to read monitor datatables.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required to read monitor datatables.");
  let lastError = "";
  for (const candidate of apiCandidates(path)) {
    const response = await fetch(candidate, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return await response.json();
    lastError = `${response.status} ${await response.text().catch(() => "")}`;
    if (response.status !== 404) break;
  }
  throw new Error(`Windmill API request failed for ${path}: ${lastError}`);
}

function datatable(workspace: string) {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const args = Object.fromEntries(values.map((value, index) => [`arg${index + 1}`, value]));
    const comments = values.map((_, index) => `-- $${index + 1} arg${index + 1}`).join("\n");
    const placeholder = (value: unknown, nextChunk: string, index: number) => {
      if (nextChunk.trimStart().startsWith("::")) return `$${index + 1}`;
      if (typeof value === "number") return Number.isInteger(value) ? `$${index + 1}::BIGINT` : `$${index + 1}::DOUBLE PRECISION`;
      if (typeof value === "boolean") return `$${index + 1}::BOOLEAN`;
      if (value === null || value === undefined || typeof value === "string") return `$${index + 1}::TEXT`;
      return `$${index + 1}::JSONB`;
    };
    const content = strings.reduce((query, chunk, index) => {
      return query + chunk + (index < values.length ? placeholder(values[index], strings[index + 1], index) : "");
    }, comments ? `${comments}\n\n` : "");

    const run = () =>
      apiPost(`/w/${workspace}/jobs/run_inline/preview`, {
        language: "postgresql",
        content,
        args: {
          ...args,
          database: "datatable://main",
        },
      });

    return {
      fetch: run,
      async fetchOne() {
        const rows = await run();
        return Array.isArray(rows) ? rows[0] : rows;
      },
    };
  };
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function arr(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function projectKey(project: unknown, resource: unknown) {
  return `${str(project, "unknown-project")}::${str(resource, "unknown-resource")}`;
}

function identityFromContainer(container: Record<string, any>) {
  const identity = asRecord(container.project_identity);
  const labels = asRecord(container.coolify_labels);
  return {
    project: str(identity.coolify_project || labels["coolify.projectName"] || container.compose_project, "unknown-project"),
    resource: str(identity.coolify_resource || labels["coolify.resourceName"], "unknown-resource"),
    service: str(identity.coolify_service || labels["coolify.serviceName"] || identity.compose_service || container.name, "unknown-service"),
    type: str(identity.coolify_type || labels["coolify.type"], "unknown"),
    environment: str(identity.coolify_environment || labels["coolify.environmentName"], "unknown"),
    domains: arr(identity.public_domains),
  };
}

function normalizeContainers(rawPayload: Record<string, any>, projectRows: any[]) {
  const containers = arr(asRecord(rawPayload.docker).containers);
  const projectByContainer = new Map<string, any>();
  for (const project of projectRows) {
    for (const container of arr(project.containers)) {
      if (container?.name) projectByContainer.set(String(container.name), project);
    }
  }

  return containers.map((container) => {
    const item = asRecord(container);
    const group = projectByContainer.get(String(item.name)) || {};
    const identity = identityFromContainer(item);
    const project = group.project || identity.project;
    const resource = group.resource || identity.resource;
    const service = identity.service || group.service || item.name;
    const domains = arr(group.public_domains).length ? arr(group.public_domains) : identity.domains;
    return {
      name: str(item.name, "unknown-container"),
      project_key: projectKey(project, resource),
      project_name: str(project, "unknown-project"),
      resource_name: str(resource, "unknown-resource"),
      service_name: str(service, "unknown-service"),
      coolify_type: str(group.type || identity.type, "unknown"),
      environment_name: str(group.environment || identity.environment, "unknown"),
      image: str(item.image),
      status: str(item.status),
      running: Boolean(item.running),
      cpu_percent: num(item.cpu_percent),
      memory_percent: num(item.memory_percent),
      memory_usage: str(item.memory_usage, "-"),
      network_io: str(item.network_io, "-"),
      block_io: str(item.block_io, "-"),
      pids: str(item.pids, "-"),
      restart_count: num(item.restart_count),
      network_mode: str(item.network_mode, "-"),
      privileged: Boolean(item.privileged),
      coolify_labelled: Boolean(item.coolify_labelled),
      public_domains: domains,
      suspicious_reasons: arr(item.suspicious_reasons),
      risky_mounts: arr(item.risky_mounts),
    };
  });
}

function normalizeProjects(rawPayload: Record<string, any>, containers: any[]) {
  const docker = asRecord(rawPayload.docker);
  const projectUsage = arr(docker.project_usage);
  if (projectUsage.length) {
    return projectUsage.map((project) => {
      const item = asRecord(project);
      const key = projectKey(item.project, item.resource);
      const projectContainers = containers.filter((container) => container.project_key === key);
      return {
        project_key: key,
        project_name: str(item.project, "unknown-project"),
        resource_name: str(item.resource, "unknown-resource"),
        display: str(item.display, `${str(item.project, "unknown-project")} / ${str(item.resource, "unknown-resource")}`),
        coolify_type: str(item.type, "unknown"),
        environment_name: str(item.environment, "unknown"),
        public_domains: arr(item.public_domains),
        container_count: num(item.container_count, projectContainers.length),
        cpu_percent_sum: num(item.cpu_percent_sum, projectContainers.reduce((sum, row) => sum + num(row.cpu_percent), 0)),
        memory_percent_max: num(item.memory_percent_max, Math.max(0, ...projectContainers.map((row) => num(row.memory_percent)))),
        suspicious_count: num(item.suspicious_count, projectContainers.filter((row) => row.suspicious_reasons.length).length),
        suspicious_reasons: arr(item.suspicious_reasons),
      };
    });
  }

  const grouped = new Map<string, any>();
  for (const container of containers) {
    const current = grouped.get(container.project_key) || {
      project_key: container.project_key,
      project_name: container.project_name,
      resource_name: container.resource_name,
      display: `${container.project_name} / ${container.resource_name}`,
      coolify_type: container.coolify_type,
      environment_name: container.environment_name,
      public_domains: container.public_domains,
      container_count: 0,
      cpu_percent_sum: 0,
      memory_percent_max: 0,
      suspicious_count: 0,
      suspicious_reasons: [],
    };
    current.container_count += 1;
    current.cpu_percent_sum += num(container.cpu_percent);
    current.memory_percent_max = Math.max(current.memory_percent_max, num(container.memory_percent));
    if (container.suspicious_reasons.length) current.suspicious_count += 1;
    current.suspicious_reasons = Array.from(new Set([...current.suspicious_reasons, ...container.suspicious_reasons]));
    grouped.set(container.project_key, current);
  }
  return Array.from(grouped.values());
}

function healthStatus(summary: Record<string, any>, projects: any[], containers: any[]) {
  const staleMinutes = summary.received_at
    ? Math.round((Date.now() - new Date(summary.received_at).getTime()) / 60000)
    : null;
  const watchCount = containers.filter((row) => row.suspicious_reasons.length || row.privileged).length;
  const highMemory = projects.filter((row) => num(row.memory_percent_max) >= 70);
  const highCpu = projects.filter((row) => num(row.cpu_percent_sum) >= 70);
  const warnings = [
    ...(staleMinutes !== null && staleMinutes > 30 ? [`No fresh payload for ${staleMinutes} minutes`] : []),
    ...(watchCount ? [`${watchCount} container${watchCount === 1 ? "" : "s"} need review`] : []),
    ...(highMemory.length ? [`${highMemory.length} project${highMemory.length === 1 ? "" : "s"} over 70% memory`] : []),
    ...(highCpu.length ? [`${highCpu.length} project${highCpu.length === 1 ? "" : "s"} over 70% CPU`] : []),
  ];
  return {
    level: warnings.length ? "watch" : "ok",
    stale_minutes: staleMinutes,
    warnings,
  };
}

export async function main(days = 2, project_key = "all") {
  const workspace = process.env.WM_WORKSPACE || process.env.WM_WORKSPACE_ID || "beforest-automations";
  const sql = datatable(workspace);

  const latest = await sql`
    SELECT
      snapshot_id,
      received_at,
      monitor_timestamp,
      server,
      hostname,
      load_1m,
      load_5m,
      load_15m,
      memory_used_percent,
      root_disk_used_percent,
      docker_disk_used_percent,
      docker_container_count,
      suspicious_count,
      raw_payload
    FROM hetzner_windmill_monitor_snapshots
    ORDER BY received_at DESC
    LIMIT 1
  `.fetchOne();

  if (!latest?.snapshot_id) {
    return {
      ready: false,
      message: "No Hetzner monitor snapshots received yet.",
      projects: [],
      containers: [],
      history: [],
    };
  }

  const history = await sql`
    SELECT
      received_at,
      monitor_timestamp,
      server,
      load_1m,
      memory_used_percent,
      root_disk_used_percent,
      docker_disk_used_percent,
      docker_container_count,
      suspicious_count
    FROM hetzner_windmill_monitor_snapshots
    WHERE received_at >= NOW() - (${Math.max(1, Math.min(30, days))}::TEXT || ' days')::INTERVAL
    ORDER BY received_at DESC
    LIMIT 200
  `.fetch();

  const rawPayload = asRecord(latest.raw_payload);
  const rawProjects = arr(asRecord(rawPayload.docker).project_usage);
  const containers = normalizeContainers(rawPayload, rawProjects).sort((a, b) => b.cpu_percent - a.cpu_percent);
  const projects = normalizeProjects(rawPayload, containers).sort((a, b) => {
    if (b.suspicious_count !== a.suspicious_count) return b.suspicious_count - a.suspicious_count;
    if (b.cpu_percent_sum !== a.cpu_percent_sum) return b.cpu_percent_sum - a.cpu_percent_sum;
    return b.memory_percent_max - a.memory_percent_max;
  });
  const selectedContainers = project_key && project_key !== "all"
    ? containers.filter((container) => container.project_key === project_key)
    : containers;
  const selectedProject = projects.find((project) => project.project_key === project_key) || null;

  return {
    ready: true,
    snapshot: {
      snapshot_id: latest.snapshot_id,
      received_at: latest.received_at,
      monitor_timestamp: latest.monitor_timestamp,
      server: latest.server,
      hostname: latest.hostname,
      loadavg: [latest.load_1m, latest.load_5m, latest.load_15m],
      memory_used_percent: num(latest.memory_used_percent),
      root_disk_used_percent: num(latest.root_disk_used_percent),
      docker_disk_used_percent: num(latest.docker_disk_used_percent),
      docker_container_count: num(latest.docker_container_count),
      suspicious_count: num(latest.suspicious_count),
    },
    host: {
      memory: asRecord(asRecord(rawPayload.host).memory),
      disk: arr(asRecord(rawPayload.host).disk),
      auth: asRecord(asRecord(rawPayload.host).auth),
      top_processes: arr(asRecord(rawPayload.host).top_processes),
      open_ports: str(asRecord(rawPayload.host).open_ports),
    },
    health: healthStatus(latest, projects, containers),
    projects,
    containers: selectedContainers,
    selected_project: selectedProject,
    all_container_count: containers.length,
    history: Array.isArray(history) ? history : [],
  };
}
