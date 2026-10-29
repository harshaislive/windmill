import * as wmill from "windmill-client";
import { Buffer } from "node:buffer";

type Row = Record<string, any>;
const DASHBOARD_PASSCODE_PATH = "f/bodakonda_water_monitoring/dashboard_passcode";
const IMD_RAINFALL_URL = "https://mausam.imd.gov.in/hyderabad/mcdata/ghmc_hyd.gif";

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await wmill.getVariable(DASHBOARD_PASSCODE_PATH)).trim();
  if (!configured) throw new Error(`Dashboard passcode is not configured: ${DASHBOARD_PASSCODE_PATH}`);
  if (!input || input.trim() !== configured) throw new Error("Invalid dashboard passcode.");
}

function apiCandidates(path: string) {
  const base = (process.env.BASE_INTERNAL_URL || process.env.BASE_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("BASE_INTERNAL_URL or BASE_URL is required for datatable access.");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (base.endsWith("/api")) return [`${base}${normalized}`];
  return [`${base}/api${normalized}`, `${base}${normalized}`];
}

async function apiPost(path: string, body: unknown) {
  const token = process.env.WM_TOKEN;
  if (!token) throw new Error("WM_TOKEN is required for datatable access.");
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
      if (nextChunk.trimStart().startsWith("::date") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `'${value}'`;
      }
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
      execute: run,
      fetch: run,
      async fetchOne() {
        const rows = await run();
        return Array.isArray(rows) ? rows[0] : rows;
      },
    };
  };
}

function toNumber(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function sum(rows: Row[], key: string) {
  return rows.reduce((total, row) => total + toNumber(row[key]), 0);
}

function compactDate(value: unknown) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function monthLabel(month: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return month || "Unknown";
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    map.set(key, [...(map.get(key) || []), row]);
  }
  return map;
}

function dateRange(rows: Row[]) {
  const dates = rows.map((row) => compactDate(row.date)).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
}

async function fetchImdRainfallImage() {
  try {
    const response = await fetch(IMD_RAINFALL_URL);
    if (!response.ok) return { url: IMD_RAINFALL_URL, dataUrl: "", error: `IMD image returned ${response.status}` };
    const contentType = response.headers.get("content-type") || "image/gif";
    const bytes = Buffer.from(await response.arrayBuffer());
    return { url: IMD_RAINFALL_URL, dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`, error: "" };
  } catch (error) {
    return { url: IMD_RAINFALL_URL, dataUrl: "", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function main(
  date_from = "",
  date_to = "",
  source = "All",
  purpose = "All",
  record_type = "All",
  trend_mode = "monthly",
  dashboard_passcode = "",
) {
  await requireDashboardPasscode(dashboard_passcode);
  const workspace = process.env.WM_WORKSPACE_ID || process.env.WM_WORKSPACE || "beforest-automations";
  const sql = datatable(workspace);

  const [waterRows, rainfallRows, imports] = await Promise.all([
    sql`SELECT * FROM water_usage_records ORDER BY date ASC, id ASC`.fetch(),
    sql`SELECT * FROM rainfall_records ORDER BY date ASC`.fetch(),
    sql`SELECT * FROM water_dashboard_import_log ORDER BY import_date DESC LIMIT 5`.fetch(),
  ]);
  const imdRainfall = await fetchImdRainfallImage();

  const allWater = waterRows as Row[];
  const allRain = rainfallRows as Row[];
  if (!allWater.length) {
    return { ready: false, message: "No Bodakonda water records are available yet.", totals: {}, filters: {}, rows: [] };
  }

  const availableRange = dateRange(allWater);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(date_from) ? date_from : availableRange.min;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(date_to) ? date_to : availableRange.max;

  const filtered = allWater.filter((row) => {
    const d = compactDate(row.date);
    return d >= from
      && d <= to
      && (source === "All" || row.borewell === source)
      && (purpose === "All" || row.purpose === purpose)
      && (record_type === "All" || row.record_type === record_type);
  });
  const rain = allRain.filter((row) => {
    const d = compactDate(row.date);
    return d >= from && d <= to;
  });

  const groundwater = sum(filtered.filter((row) => row.record_type !== "Pond Outflow"), "groundwater_extracted_l");
  const consumed = sum(filtered, "consumed_l");
  const pondIn = sum(filtered.filter((row) => row.record_type === "Pond Inflow"), "groundwater_extracted_l");
  const pondOut = sum(filtered.filter((row) => row.record_type === "Pond Outflow"), "consumed_l");
  const runtime = sum(filtered, "hours");
  const totalRainfall = sum(rain, "rainfall_mm");
  const peakRainfall = [...rain].sort((a, b) => toNumber(b.rainfall_mm) - toNumber(a.rainfall_mm))[0] || null;

  const trendKey = trend_mode === "daily" ? (row: Row) => compactDate(row.date) : (row: Row) => String(row.month || "").slice(0, 7);
  const trend = [...groupBy(filtered, trendKey).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      label: trend_mode === "daily" ? key : monthLabel(key),
      extracted: sum(rows.filter((row) => row.record_type !== "Pond Outflow"), "groundwater_extracted_l"),
      consumed: sum(rows, "consumed_l"),
    }));

  const usageMix = [...groupBy(filtered, (row) => row.purpose || "Unassigned").entries()]
    .map(([key, rows]) => ({ key, label: key, value: sum(rows, "consumed_l"), records: rows.length }))
    .sort((a, b) => b.value - a.value);

  const sourceExtraction = [...groupBy(filtered.filter((row) => row.record_type !== "Pond Outflow"), (row) => row.borewell || "Unknown").entries()]
    .map(([key, rows]) => ({ key, label: key, value: sum(rows, "groundwater_extracted_l"), records: rows.length }))
    .sort((a, b) => b.value - a.value);

  const pondMovement = [...groupBy(filtered.filter((row) => row.record_type !== "Direct Use"), (row) => String(row.month || "").slice(0, 7)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => {
      const inflow = sum(rows.filter((row) => row.record_type === "Pond Inflow"), "groundwater_extracted_l");
      const outflow = sum(rows.filter((row) => row.record_type === "Pond Outflow"), "consumed_l");
      return { key, label: monthLabel(key), inflow, outflow, net: inflow - outflow };
    });

  const rainfallEvents = rain
    .map((row) => ({ key: compactDate(row.date), label: compactDate(row.date), value: toNumber(row.rainfall_mm), cumulative: toNumber(row.cumulative_rainfall_mm) }))
    .sort((a, b) => b.value - a.value);

  const duplicateKeys = new Set<string>();
  let duplicateIntervals = 0;
  for (const row of filtered) {
    const key = `${compactDate(row.date)}|${row.borewell}|${row.start_reading}|${row.end_reading}|${row.groundwater_extracted_l}|${row.consumed_l}`;
    if (duplicateKeys.has(key)) duplicateIntervals += 1;
    duplicateKeys.add(key);
  }

  const topZonesCrops = [...groupBy(filtered, (row) => `${row.terrace_block || "Unassigned"}|||${row.crop || "Not specified"}|||${row.purpose || "Unassigned"}`).entries()]
    .map(([key, rows]) => {
      const [zone, crop, rowPurpose] = key.split("|||");
      return {
        zone,
        crop,
        purpose: rowPurpose,
        records: rows.length,
        consumed: sum(rows, "consumed_l"),
        extracted: sum(rows, "groundwater_extracted_l"),
      };
    })
    .sort((a, b) => b.consumed - a.consumed)
    .slice(0, 14);

  return {
    ready: true,
    source: "Windmill datatables",
    generatedAt: imports[0]?.import_date || null,
    dateRange: { from, to, availableFrom: availableRange.min, availableTo: availableRange.max },
    filters: {
      sources: ["All", ...[...new Set(allWater.map((row) => row.borewell || "Unknown"))].sort()],
      purposes: ["All", ...[...new Set(allWater.map((row) => row.purpose || "Unassigned"))].sort()],
      recordTypes: ["All", "Direct Use", "Pond Inflow", "Pond Outflow"],
      selected: { source, purpose, record_type, trend_mode },
    },
    totals: {
      groundwater,
      consumed,
      pondIn,
      pondOut,
      pondBalance: pondIn - pondOut,
      runtime,
      totalRainfall,
      rainyDays: rain.length,
      peakRainfallDay: peakRainfall ? compactDate(peakRainfall.date) : "",
      peakRainfallMm: peakRainfall ? toNumber(peakRainfall.rainfall_mm) : 0,
      filteredRecords: filtered.length,
      sourceRecords: filtered.filter((row) => row.record_type !== "Pond Outflow").length,
      averageLitresPerHour: runtime ? consumed / runtime : 0,
    },
    trend,
    usageMix,
    sourceExtraction,
    pondMovement,
    rainfallEvents,
    quality: {
      filteredRecords: filtered.length,
      totalRecords: allWater.length,
      missingRuntime: filtered.filter((row) => !toNumber(row.hours)).length,
      missingZoneBlock: filtered.filter((row) => !row.terrace_block || row.terrace_block === "Unassigned").length,
      duplicateIntervals,
      waterFiles: "2 CSV feeds",
      rainfallFile: `${allRain.length} events`,
    },
    topZonesCrops,
    importLog: imports,
    imdRainfall,
  };
}
