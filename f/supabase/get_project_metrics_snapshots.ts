import * as wmill from "windmill-client";

const BASE = "f/supabase";
const PROJECTS = [
  {
    key: "10cent",
    label: "10Cent",
    ref: "nsrndpwoohjylxgknghr",
    url: "https://nsrndpwoohjylxgknghr.supabase.co",
    anonVariable: "anon_key",
  },
  {
    key: "beforest_audience",
    label: "Beforest Audience",
    ref: "gvmlbkfmumywwlwsesqp",
    url: "https://gvmlbkfmumywwlwsesqp.supabase.co",
    anonVariable: "anon_key_beforest_audience",
  },
  {
    key: "experiences",
    label: "Experiences",
    ref: "isdbyvwocudnlwzghphw",
    url: "https://isdbyvwocudnlwzghphw.supabase.co",
    anonVariable: "anon_key_experiences",
  },
  {
    key: "dropbox",
    label: "Dropbox",
    ref: "mtzcvknnkeepgyyfntod",
    url: "https://mtzcvknnkeepgyyfntod.supabase.co",
    anonVariable: "anon_key_dropbox",
  },
  {
    key: "n8n_workflows",
    label: "N8N Workflows",
    ref: "fjnkpphjtlaeijjcbejb",
    url: "https://fjnkpphjtlaeijjcbejb.supabase.co",
    anonVariable: "anon_key_n8n_workflows",
  },
  {
    key: "snippets_spaces",
    label: "Snippets & Spaces",
    ref: "zacboxnjmvhbeaxfunmi",
    url: "https://zacboxnjmvhbeaxfunmi.supabase.co",
    anonVariable: "anon_key_snippets_spaces",
  },
] as const;

const METRIC_FIELDS = [
  "egress_gb",
  "active_connections",
  "cpu_percent",
  "disk_usage_percent",
  "api_requests_count",
  "tables_without_rls_count",
  "db_storage_size",
  "failed_auth_attempts_24h",
  "total_logins_24h",
  "password_resets_24h",
  "otp_requests_24h",
  "new_signups_24h",
] as const;

type SnapshotRow = {
  id: number;
  timestamp: string;
  created_at?: string;
  [key: string]: unknown;
};

type ProjectConfig = (typeof PROJECTS)[number];

function isPresent(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function titleize(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function getVariable(name: string): Promise<string> {
  return (await wmill.getVariable(`${BASE}/${name}`)).trim();
}

function getProject(projectKey = ""): ProjectConfig {
  const normalized = projectKey.trim() || PROJECTS[0].key;
  const project = PROJECTS.find((item) => item.key === normalized);
  if (!project) {
    throw new Error(`Unknown Supabase project: ${projectKey}`);
  }
  return project;
}

async function getAnonKey(project: ProjectConfig): Promise<string> {
  const key = await getVariable(project.anonVariable).catch(() => "");
  if (key) return key;

  if (project.key === "10cent") {
    return getVariable("anon_key");
  }

  throw new Error(`Missing ${BASE}/${project.anonVariable} for ${project.label}.`);
}

async function fetchRows(project: ProjectConfig, limit: number): Promise<SnapshotRow[]> {
  const projectUrl = project.url.replace(/\/+$/, "");
  const anonKey = await getAnonKey(project);
  const safeLimit = Math.max(1, Math.min(Number(limit || 30), 200));
  const url = `${projectUrl}/rest/v1/project_metrics_snapshots?select=*&order=timestamp.desc&limit=${safeLimit}`;

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase returned ${response.status}: ${text}`);
  }

  return JSON.parse(text) as SnapshotRow[];
}

export async function main(limit = 60, project_key = "10cent") {
  const project = getProject(project_key);
  const rows = await fetchRows(project, limit);
  const chronological = [...rows].reverse();
  const availableMetrics = METRIC_FIELDS.filter((field) =>
    rows.some((row) => isPresent(row[field])),
  ).map((field) => ({
    key: field,
    label: titleize(field),
  }));

  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    project: {
      key: project.key,
      label: project.label,
      ref: project.ref,
      url: project.url,
    },
    projects: PROJECTS.map(({ key, label, ref, url }) => ({ key, label, ref, url })),
    row_count: rows.length,
    available_metrics: availableMetrics,
    latest,
    previous,
    rows: chronological.map((row) => {
      const clean: SnapshotRow = {
        id: row.id,
        timestamp: row.timestamp,
        created_at: row.created_at,
      };
      for (const metric of availableMetrics) {
        clean[metric.key] = row[metric.key];
      }
      return clean;
    }),
  };
}
