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
    invokeSecretVariable: "invoke_secret_beforest_audience",
    edgeFunctionName: "metrics_layer_3_fetch",
  },
  {
    key: "experiences",
    label: "Experiences",
    ref: "isdbyvwocudnlwzghphw",
    url: "https://isdbyvwocudnlwzghphw.supabase.co",
    anonVariable: "anon_key_experiences",
    invokeSecretVariable: "invoke_secret_experiences",
  },
  {
    key: "dropbox",
    label: "Dropbox",
    ref: "mtzcvknnkeepgyyfntod",
    url: "https://mtzcvknnkeepgyyfntod.supabase.co",
    anonVariable: "anon_key_dropbox",
    invokeSecretVariable: "invoke_secret_dropbox",
    edgeFunctionName: "metrics_layer_3_fetch",
  },
  {
    key: "n8n_workflows",
    label: "N8N Workflows",
    ref: "fjnkpphjtlaeijjcbejb",
    url: "https://fjnkpphjtlaeijjcbejb.supabase.co",
    anonVariable: "anon_key_n8n_workflows",
    invokeSecretVariable: "invoke_secret_n8n_workflows",
    edgeFunctionName: "metrics_layer_3_fetch",
  },
  {
    key: "snippets_spaces",
    label: "Snippets & Spaces",
    ref: "zacboxnjmvhbeaxfunmi",
    url: "https://zacboxnjmvhbeaxfunmi.supabase.co",
    anonVariable: "anon_key_snippets_spaces",
    invokeSecretVariable: "invoke_secret_snippets_spaces",
    edgeFunctionName: "metrics_layer_3_fetch-",
  },
] as const;

type InvokeResult = {
  ok: boolean;
  status: number;
  statusText: string;
  data?: unknown;
  text?: string;
};

type ProjectConfig = (typeof PROJECTS)[number];
type ProjectInvokeResult = InvokeResult & {
  project_key: string;
  project_label: string;
  project_ref: string;
  target_url: string;
};

async function getVariable(name: string): Promise<string> {
  return (await wmill.getVariable(`${BASE}/${name}`)).trim();
}

async function getOptionalVariable(name: string): Promise<string> {
  return getVariable(name).catch(() => "");
}

async function getProjectInvokeSecret(project: ProjectConfig, fallbackSecret: string): Promise<string> {
  if ("invokeSecretVariable" in project && project.invokeSecretVariable) {
    return getVariable(project.invokeSecretVariable);
  }
  return fallbackSecret;
}

async function getOptionalProjectInvokeSecret(project: ProjectConfig, fallbackSecret: string): Promise<string> {
  return getProjectInvokeSecret(project, fallbackSecret).catch(() => "");
}

function joinEdgeFunctionUrl(projectUrl: string, edgeFunctionName: string): string {
  const base = projectUrl.replace(/\/+$/, "");
  const name = edgeFunctionName.replace(/^\/+/, "");
  return `${base}/functions/v1/${name}`;
}

function projectEdgeFunctionName(project: ProjectConfig, fallbackName: string): string {
  return "edgeFunctionName" in project && project.edgeFunctionName
    ? project.edgeFunctionName
    : fallbackName;
}

function projectTargetUrl(project: ProjectConfig, configuredUrl: string, configuredName: string): string {
  return configuredUrl || joinEdgeFunctionUrl(project.url, projectEdgeFunctionName(project, configuredName));
}

function selectedProjects(projectKey: string): ProjectConfig[] {
  const normalized = projectKey.trim();
  if (!normalized || normalized === "all") return [...PROJECTS];

  const wanted = new Set(normalized.split(",").map((item) => item.trim()).filter(Boolean));
  const projects = PROJECTS.filter((project) => wanted.has(project.key));
  if (projects.length !== wanted.size) {
    const known = new Set(PROJECTS.map((project) => project.key));
    const unknown = [...wanted].filter((key) => !known.has(key));
    throw new Error(`Unknown Supabase project key(s): ${unknown.join(", ")}`);
  }
  return projects;
}

async function readTextOrJson(response: Response): Promise<Pick<InvokeResult, "data" | "text">> {
  const text = await response.text();
  if (!text) return {};
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { text };
  }
}

export async function main(
  dry_run = false,
  project_key = "all",
  edge_function_url = "",
  edge_function_name = "",
  timeout_seconds = 45,
  fail_on_error = true,
) {
  const invokeSecret = await getVariable("invoke_secret");
  const projects = selectedProjects(project_key);
  const configuredUrl = edge_function_url.trim() || (await getOptionalVariable("edge_function_url"));
  const configuredName =
    edge_function_name.trim() ||
    (await getOptionalVariable("edge_function_name"));

  if (configuredUrl && projects.length > 1) {
    throw new Error(
      "edge_function_url can only be used with a single project_key. Use edge_function_name for multi-project runs.",
    );
  }

  if (dry_run) {
    const targets = await Promise.all(projects.map(async (project) => {
      const anonKey = await getOptionalVariable(project.anonVariable);
      const projectInvokeSecret = await getOptionalProjectInvokeSecret(project, invokeSecret);
      const targetUrl = projectTargetUrl(project, configuredUrl, configuredName);
      return {
        project_key: project.key,
        project_label: project.label,
        project_ref: project.ref,
        would_post_to: targetUrl,
        headers: {
          "content-type": "application/json",
          "x-invoke-secret": projectInvokeSecret ? "[configured]" : "[missing]",
          authorization: anonKey ? "Bearer [configured]" : "[missing]",
        },
      };
    }));

    return {
      dry_run: true,
      project_count: targets.length,
      targets,
    };
  }

  if (!configuredUrl && !configuredName) {
    const missingProjectKeys = projects
      .filter((project) => !projectEdgeFunctionName(project, ""))
      .map((project) => project.key);
    if (missingProjectKeys.length) {
      throw new Error(
        `Missing Edge Function name for ${missingProjectKeys.join(", ")}. Set ${BASE}/edge_function_name or add a per-project edgeFunctionName.`,
      );
    }
  }

  const results = await Promise.all(projects.map(async (project): Promise<ProjectInvokeResult> => {
    const targetUrl = projectTargetUrl(project, configuredUrl, configuredName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, timeout_seconds) * 1000);

    try {
      const anonKey = await getVariable(project.anonVariable);
      const projectInvokeSecret = await getProjectInvokeSecret(project, invokeSecret);
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
          "x-invoke-secret": projectInvokeSecret,
        },
        body: "{}",
        signal: controller.signal,
      });

      const body = await readTextOrJson(response);
      return {
        project_key: project.key,
        project_label: project.label,
        project_ref: project.ref,
        target_url: targetUrl,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        ...body,
      };
    } catch (error) {
      return {
        project_key: project.key,
        project_label: project.label,
        project_ref: project.ref,
        target_url: targetUrl,
        ok: false,
        status: 0,
        statusText: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }));

  const failures = results.filter((result) => !result.ok);
  if (failures.length && fail_on_error) {
    throw new Error(
      `Supabase metrics snapshot failed for ${failures.map((item) => item.project_key).join(", ")}: ${
        JSON.stringify(failures.map(({ project_key, status, statusText }) => ({ project_key, status, statusText })))
      }`,
    );
  }

  return {
    ok: failures.length === 0,
    project_count: results.length,
    success_count: results.length - failures.length,
    failure_count: failures.length,
    results,
  };
}
