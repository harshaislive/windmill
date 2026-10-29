import {
  ABSORBED_LABELS,
  COMBINED_COLLECTIVES,
  accessToken,
  cacheCollectives,
  config,
  dashboard,
  ensureSnapshotTables,
  getCostCenters,
  queueOpexSnapshotSync,
  reportRange,
  saveDashboardSnapshot,
  writeSyncRun,
} from "./opex_core.ts";

type Row = Record<string, any>;

function runId(collective: string) {
  const slug = collective.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `opex-${slug}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRateLimit(error: unknown) {
  const value = error as { status?: number; message?: string; retryAfter?: number };
  return value?.status === 429 || /rate limit|blocked for some time|maximum number of requests/i.test(String(value?.message || error));
}

function todayInKolkata(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentMonthRange() {
  const today = todayInKolkata();
  return {
    from: `${today.slice(0, 7)}-01`,
    to: today,
  };
}

function shouldQueueCurrentMonthSnapshot(
  from: string,
  to: string,
  fiscalYear: string,
  triggerMode: "scheduled" | "manual",
  resumeAttempt: number,
) {
  return triggerMode === "scheduled" && !from && !to && !fiscalYear && resumeAttempt === 0;
}

export async function main(
  collectives: string[] = [],
  from = "",
  to = "",
  fiscal_year = "",
  trigger_mode: "scheduled" | "manual" = "scheduled",
  resume_attempt = 0,
) {
  await ensureSnapshotTables();
  const range = reportRange(from, to, fiscal_year);
  const cfg = await config();
  const token = await accessToken(cfg);
  const costCenters = await getCostCenters(cfg, token);
  await cacheCollectives(costCenters);
  const available = costCenters
    .map((item: Row) => String(item.label || "").trim())
    .filter((label: string) => label && !ABSORBED_LABELS.has(label));
  const targets: string[] = (collectives.length ? collectives : available)
    .filter((label: string, index: number, rows: string[]) => rows.indexOf(label) === index)
    .filter((label: string) => available.includes(label) || Boolean(COMBINED_COLLECTIVES[label]));

  let succeeded = 0;
  let retrying = 0;
  const errors: Row[] = [];
  const runs: Row[] = [];

  for (const collective of targets) {
    const id = runId(collective);
    const startedAt = new Date().toISOString();
    await writeSyncRun({
      runId: id,
      startedAt,
      status: "running",
      collective,
      stage: "actuals",
      collectivesTotal: 1,
      collectivesSucceeded: 0,
      triggerMode: trigger_mode,
      resumeAttempt: resume_attempt,
      fiscalYear: range.fiscalYear.label,
      from: range.from,
      to: range.to,
    });

    try {
      const payload = await dashboard(cfg, token, collective, range.from, range.to, range.fiscalYear.label, {
        runId: id,
        startedAt,
        triggerMode: trigger_mode,
        resumeAttempt: resume_attempt,
        fiscalYear: range.fiscalYear.label,
        from: range.from,
        to: range.to,
      });
      await saveDashboardSnapshot(payload, id);
      const completedAt = new Date().toISOString();
      const itemsTotal = Number(payload.quality?.candidateAccounts || 0);
      await writeSyncRun({
        runId: id,
        startedAt,
        completedAt,
        status: "success",
        collective,
        stage: "complete",
        itemsTotal,
        itemsCompleted: itemsTotal,
        collectivesTotal: 1,
        collectivesSucceeded: 1,
        triggerMode: trigger_mode,
        resumeAttempt: resume_attempt,
        fiscalYear: range.fiscalYear.label,
        from: range.from,
        to: range.to,
      });
      succeeded += 1;
      runs.push({ runId: id, collective, status: "success", itemsTotal });
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimit(error) && resume_attempt < 8) {
        const retryAfter = Math.max(65, Math.min(180, Number(error?.retryAfter || 90)));
        const nextRetryAt = new Date(Date.now() + retryAfter * 1000).toISOString();
        const nextJobId = await queueOpexSnapshotSync(
          [collective],
          range.from,
          range.to,
          range.fiscalYear.label,
          trigger_mode,
          resume_attempt + 1,
          retryAfter,
        );
        await writeSyncRun({
          runId: id,
          startedAt,
          completedAt: new Date().toISOString(),
          status: "retrying",
          collective,
          stage: "rate_limited",
          nextRetryAt,
          collectivesTotal: 1,
          collectivesSucceeded: 0,
          errorMessage: `Zoho rate limit reached; checkpoint saved. Resume job ${nextJobId} is scheduled.`,
          triggerMode: trigger_mode,
          resumeAttempt: resume_attempt,
          fiscalYear: range.fiscalYear.label,
          from: range.from,
          to: range.to,
        });
        retrying += 1;
        runs.push({ runId: id, collective, status: "retrying", nextRetryAt, nextJobId });
      } else {
        await writeSyncRun({
          runId: id,
          startedAt,
          completedAt: new Date().toISOString(),
          status: "failed",
          collective,
          stage: "failed",
          collectivesTotal: 1,
          collectivesSucceeded: 0,
          errorMessage: message.slice(0, 8000),
          triggerMode: trigger_mode,
          resumeAttempt: resume_attempt,
          fiscalYear: range.fiscalYear.label,
          from: range.from,
          to: range.to,
        });
        errors.push({ collective, error: message });
        runs.push({ runId: id, collective, status: "failed" });
      }
    }
  }

  const status = errors.length === 0
    ? retrying > 0 ? "retrying" : "success"
    : succeeded > 0 || retrying > 0 ? "partial" : "failed";
  if (status === "failed") {
    const detail = errors.map((item) => `${item.collective}: ${item.error}`).join(" | ").slice(0, 2000);
    throw new Error(`OPEX snapshot sync failed for all ${targets.length || 1} target(s): ${detail}`);
  }
  let scheduledCurrentMonth: Row | null = null;
  if (shouldQueueCurrentMonthSnapshot(from, to, fiscal_year, trigger_mode, resume_attempt)) {
    const monthRange = currentMonthRange();
    const month = reportRange(monthRange.from, monthRange.to, range.fiscalYear.label);
    const jobId = await queueOpexSnapshotSync(
      collectives,
      month.from,
      month.to,
      month.fiscalYear.label,
      trigger_mode,
      0,
      10,
    );
    scheduledCurrentMonth = {
      jobId,
      fiscalYear: month.fiscalYear.label,
      from: month.from,
      to: month.to,
    };
  }
  return {
    status,
    fiscalYear: range.fiscalYear.label,
    from: range.from,
    to: range.to,
    collectivesTotal: targets.length,
    collectivesSucceeded: succeeded,
    collectivesRetrying: retrying,
    collectivesFailed: errors.length,
    runs,
    scheduledCurrentMonth,
    completedAt: new Date().toISOString(),
    sourceMode: "Zoho Books GET-only to resumable Windmill PostgreSQL checkpoints",
  };
}
