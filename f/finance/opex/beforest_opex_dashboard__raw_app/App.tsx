import React, { FormEvent, useMemo, useState } from "react";
import { backend } from "./wmill";
import "./index.css";

type Collective = {
  id: string;
  label: string;
  members: string[];
  hasBudget: boolean;
  hasSnapshot: boolean;
};

type FiscalYearOption = {
  label: string;
  from: string;
  to: string;
};

type PeriodOption = {
  key: string;
  label: string;
  from: string;
  to: string;
};

type SnapshotOption = {
  runId: string;
  fiscalYear: string;
  from: string;
  to: string;
  refreshedAt: string;
  syncedAt: string;
  budgetStatus: string;
};

type Month = {
  key: string;
  label: string;
  budget: number;
  actual: number;
  variance: number;
  utilization: number | null;
};

type Category = {
  accountId: string;
  name: string;
  categoryKey: string;
  categoryGroup?: string;
  costCenterLabels: string[];
  budget: number;
  actual: number;
  share: number;
};

type DashboardData = {
  collective: string;
  budgetName: string | null;
  fiscalYear: string;
  from: string;
  to: string;
  refreshedAt: string;
  snapshot?: {
    syncedAt: string;
    ageMinutes: number | null;
    isStale: boolean;
    syncRunId: string;
  };
  metrics: {
    actual: number;
    budget: number;
    variance: number;
    utilization: number | null;
    activeCategories: number;
  };
  months: Month[];
  categories: Category[];
  quality: {
    candidateAccounts: number;
    includedAccounts: number;
    unavailableAccounts: number;
    status: string;
    budgetSource: string;
    budgetStatus?: "loading" | "complete" | "not_available";
    checkpointedAccounts?: number;
  };
  source: {
    organization: string;
    endpoint: string;
    mode: string;
  };
  refresh?: {
    status: "queued";
    jobId: string;
  };
  pendingInitialSnapshot?: boolean;
};

type SyncStatus = {
  runId: string;
  status: "running" | "retrying" | "success" | "failed";
  stage: string;
  itemsTotal: number;
  itemsCompleted: number;
  nextRetryAt: string | null;
  errorMessage: string | null;
};

type SyncStatusResponse = {
  data: DashboardData | null;
  sync: SyncStatus | null;
};

type Transaction = {
  id: string;
  date: string;
  detail: string;
  type: string;
  entityNumber: string;
  reference: string;
  branch: string;
  reportingTag: string;
  amount: number;
};

type TransactionData = {
  transactions: Transaction[];
  transactionActual: number;
  from: string;
  to: string;
  pagesFetched: number;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function compact(value: number) {
  const lakh = Number(value || 0) / 100_000;
  return `₹${lakh.toFixed(Math.abs(lakh) >= 10 ? 1 : 2)}L`;
}

function lakh(value: number) {
  return (Number(value || 0) / 100_000).toFixed(2);
}

function percent(value: number | null | undefined) {
  return value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error:\s*/i, "")
    .replace(/\s+at\s+(?:async\s+)?[\s\S]*$/i, "")
    .trim() || "The dashboard request failed.";
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return formatLocalDate(new Date());
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function periodOptionsForFiscalYear(fiscalYear: FiscalYearOption | undefined): PeriodOption[] {
  if (!fiscalYear) return [];
  const today = todayIso();
  const cappedTo = fiscalYear.to < today ? fiscalYear.to : today;
  const options: PeriodOption[] = [
    {
      key: "ytd",
      label: "YTD",
      from: fiscalYear.from,
      to: cappedTo,
    },
  ];
  const cursor = new Date(`${fiscalYear.from}T00:00:00`);
  const fiscalEnd = new Date(`${cappedTo}T00:00:00`);
  while (cursor <= fiscalEnd) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const monthEnd = formatLocalDate(new Date(year, month + 1, 0));
    const to = monthEnd < cappedTo
      ? monthEnd
      : cappedTo;
    options.push({
      key: from.slice(0, 7),
      label: monthLabel(cursor),
      from,
      to,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return options;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20V10h4v10M11 20V4h4v16M17 20v-7h3v7" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 17 6-6 4 4 8-9" />
      <path d="M16 6h5v5" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 9v5M12 18h.01" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="cal" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="chev" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LoadingBlock({ message }: { message: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" />
      <strong>{message}</strong>
      <small>Please keep this dashboard open while the request completes.</small>
    </div>
  );
}

function BudgetChart({ months }: { months: Month[] }) {
  const width = 760;
  const height = 270;
  const left = 48;
  const right = 18;
  const top = 28;
  const bottom = 50;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const maxValue = Math.max(100_000, ...months.flatMap((month) => [month.budget, month.actual]));
  const axisMax = Math.max(1, Math.ceil(maxValue / 100_000));
  const slot = plotWidth / Math.max(months.length, 1);
  const barWidth = Math.min(28, slot * 0.3);
  const scaleY = (value: number) =>
    top + plotHeight - (Number(value || 0) / (axisMax * 100_000)) * plotHeight;
  return (
    <div className="chart" aria-label="Monthly OPEX budget and actual chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 1, 2, 3, 4].map((index) => {
          const ratio = index / 4;
          const y = top + plotHeight - ratio * plotHeight;
          return (
            <g key={index}>
              <line className="grid-line" x1={left} y1={y} x2={width - right} y2={y} />
              <text className="axis-label" x={left - 10} y={y + 4} textAnchor="end">
                {(axisMax * ratio).toFixed(axisMax < 4 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        <line
          className="axis"
          x1={left}
          y1={top + plotHeight}
          x2={width - right}
          y2={top + plotHeight}
        />
        {months.map((month, index) => {
          const center = left + slot * index + slot / 2;
          const budgetY = scaleY(month.budget);
          const actualY = scaleY(month.actual);
          return (
            <g key={month.key}>
              <rect
                className="bar budget-bar"
                x={center - barWidth - 3}
                y={budgetY}
                width={barWidth}
                height={Math.max(0, top + plotHeight - budgetY)}
                rx="3"
              >
                <title>{`${month.label} budget: ${money.format(month.budget)}`}</title>
              </rect>
              <rect
                className="bar actual-bar"
                x={center + 3}
                y={actualY}
                width={barWidth}
                height={Math.max(0, top + plotHeight - actualY)}
                rx="3"
              >
                <title>{`${month.label} actual: ${money.format(month.actual)}`}</title>
              </rect>
              <text className="axis-label" x={center} y={height - 18} textAnchor="middle">
                {month.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function UtilizationChart({ months }: { months: Month[] }) {
  const width = 500;
  const height = 270;
  const left = 48;
  const right = 20;
  const top = 30;
  const bottom = 58;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const value = (month: Month) => (month.utilization == null ? 0 : month.utilization * 100);
  const points = months.map((month, index) => ({
    x: left + (months.length === 1 ? plotWidth / 2 : (plotWidth * index) / (months.length - 1)),
    y: top + plotHeight - (Math.min(120, value(month)) / 120) * plotHeight,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  return (
    <div className="chart" aria-label="Monthly OPEX utilization chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 30, 60, 90, 120].map((tick) => {
          const y = top + plotHeight - (tick / 120) * plotHeight;
          return (
            <g key={tick}>
              <line className="grid-line" x1={left} y1={y} x2={width - right} y2={y} />
              <text className="axis-label" x={left - 9} y={y + 4} textAnchor="end">
                {tick}%
              </text>
            </g>
          );
        })}
        <line
          className="axis"
          x1={left}
          y1={top + plotHeight}
          x2={width - right}
          y2={top + plotHeight}
        />
        <path className="trend-area" d={`${path} L${points.at(-1)?.x || left} ${top + plotHeight} L${points[0]?.x || left} ${top + plotHeight} Z`} />
        <path className="trend-line" d={path} />
        {months.map((month, index) => (
          <g key={month.key}>
            <circle className="point" cx={points[index].x} cy={points[index].y} r="6">
              <title>{`${month.label}: ${percent(month.utilization)}`}</title>
            </circle>
            <text
              className="value-label"
              x={points[index].x}
              y={Math.max(16, points[index].y - 12)}
              textAnchor="middle"
            >
              {percent(month.utilization)}
            </text>
            <text className="axis-label" x={points[index].x} y={height - 20} textAnchor="middle">
              {month.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function AccessGate({
  passcode,
  setPasscode,
  onSubmit,
  loading,
  error,
}: {
  passcode: string;
  setPasscode: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
  error: string;
}) {
  return (
    <main className="access-page">
      <section className="access-card">
        <div className="wordmark">Beforest</div>
        <p className="eyebrow">Finance · Private dashboard</p>
        <h1>Collective OPEX</h1>
        <p className="access-copy">
          Enter the private test passcode to view the latest successful OPEX snapshot.
        </p>
        <form onSubmit={onSubmit}>
          <label htmlFor="passcode">Dashboard passcode</label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            autoFocus
          />
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" type="submit" disabled={loading || !passcode}>
            {loading ? "Checking…" : "Open dashboard"}
          </button>
        </form>
        <small className="private-note">Private test only · read-only Zoho Books access</small>
      </section>
    </main>
  );
}

export default function App() {
  const [passcode, setPasscode] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [collectives, setCollectives] = useState<Collective[]>([]);
  const [collective, setCollective] = useState("");
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);
  const [fiscalYear, setFiscalYear] = useState("");
  const [periodKey, setPeriodKey] = useState("ytd");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [snapshotRunId, setSnapshotRunId] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [view, setView] = useState<"budget" | "utilization">("budget");
  const [loading, setLoading] = useState<"access" | "dashboard" | "transactions" | "">("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [error, setError] = useState("");
  const [openCategory, setOpenCategory] = useState("");
  const [transactionData, setTransactionData] = useState<TransactionData | null>(null);
  const [transactionError, setTransactionError] = useState("");
  const [sort, setSort] = useState<{ field: "name" | "budget" | "actual" | "share"; direction: 1 | -1 }>({
    field: "actual",
    direction: -1,
  });

  const sortedCategories = useMemo(() => {
    if (!data) return [];
    return [...data.categories].sort((a, b) => {
      if (sort.field === "name") return sort.direction * a.name.localeCompare(b.name);
      return sort.direction * (Number(a[sort.field]) - Number(b[sort.field]));
    });
  }, [data, sort]);

  const periodOptions = useMemo(
    () => periodOptionsForFiscalYear(fiscalYears.find((item) => item.label === fiscalYear)),
    [fiscalYears, fiscalYear],
  );

  const selectedPeriod = useMemo(
    () => periodOptions.find((item) => item.key === periodKey) || periodOptions[0],
    [periodOptions, periodKey],
  );

  async function callBackend(args: Record<string, unknown>) {
    return backend.get_opex_data({
      action: "collectives",
      dashboard_passcode: passcode,
      collective: "",
      from: "",
      to: "",
      fiscal_year: "",
      snapshot_run_id: "",
      account_id: "",
      category_key: "",
      cost_center_labels: [],
      expected_actual: Number.NaN,
      ...args,
    });
  }

  async function loadSnapshots(nextCollective: string, nextFiscalYear: string) {
    if (!nextCollective || !nextFiscalYear) return [] as SnapshotOption[];
    const payload = (await callBackend({
      action: "snapshots",
      collective: nextCollective,
      fiscal_year: nextFiscalYear,
    })) as { snapshots: SnapshotOption[] };
    setSnapshots(payload.snapshots);
    return payload.snapshots;
  }

  async function loadDashboard(
    nextCollective = collective,
    refreshZoho = false,
    nextSnapshotRunId = snapshotRunId,
    range = {
      fiscalYear,
      from: selectedPeriod?.from || dateFrom,
      to: selectedPeriod?.to || dateTo,
    },
  ) {
    if (!nextCollective) return;
    if (refreshZoho) {
      setSyncing(true);
      setSyncMessage("Starting read-only Zoho sync…");
    } else {
      setLoading("dashboard");
    }
    setError("");
    setOpenCategory("");
    setTransactionData(null);
    try {
      const previousSyncRunId = data?.snapshot?.syncRunId || "";
      const payload = (await callBackend({
        action: refreshZoho ? "refresh" : "dashboard",
        collective: nextCollective,
        from: range.from,
        to: range.to,
        fiscal_year: range.fiscalYear,
        snapshot_run_id: refreshZoho ? "" : nextSnapshotRunId,
      })) as DashboardData;
      if (!refreshZoho) {
        setData(payload);
        void loadSnapshots(nextCollective, range.fiscalYear).catch(() => undefined);
        return;
      }

      if (!payload.pendingInitialSnapshot) setData(payload);
      setSyncMessage("Syncing in the background · current snapshot remains available");
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 8_000));
        const latest = (await callBackend({
          action: "status",
          collective: nextCollective,
          from: range.from,
          to: range.to,
          fiscal_year: range.fiscalYear,
        })) as SyncStatusResponse;
        if (latest.data) setData(latest.data);
        const sync = latest.sync;
        if (sync?.status === "running") {
          const progress = sync.itemsTotal
            ? ` · ${sync.itemsCompleted} of ${sync.itemsTotal} accounts`
            : "";
          setSyncMessage(
            sync.stage === "actuals"
              ? "Loading fresh actuals from Zoho…"
              : `Loading budget checkpoints${progress}`,
          );
        } else if (sync?.status === "retrying") {
          const retry = sync.nextRetryAt
            ? new Date(sync.nextRetryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
            : "shortly";
          setSyncMessage(`Zoho paused the sync · resuming automatically at ${retry}`);
        } else if (sync?.status === "failed") {
          setError(sync.errorMessage || "The background refresh failed. The last snapshot remains available.");
          setSyncMessage("");
          return;
        }
        if (
          sync?.status === "success" &&
          latest.data &&
          (!previousSyncRunId || latest.data.snapshot?.syncRunId !== previousSyncRunId)
        ) {
          setCollectives((current) =>
            current.map((item) =>
              item.label === nextCollective
                ? { ...item, hasSnapshot: true, hasBudget: Boolean(latest.data?.budgetName) }
                : item,
            ),
          );
          setSyncMessage("Snapshot refreshed successfully");
          const latestRun = latest.data.snapshot?.syncRunId || "";
          void loadSnapshots(nextCollective, range.fiscalYear).catch(() => undefined);
          setSnapshotRunId(latestRun);
          window.setTimeout(() => setSyncMessage(""), 4_000);
          return;
        }
      }
      setSyncMessage("Sync continues in the background · the latest checkpoint remains available");
    } catch (requestError) {
      if (!refreshZoho) setData(null);
      setError(readableError(requestError));
    } finally {
      if (refreshZoho) setSyncing(false);
      else setLoading("");
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setLoading("access");
    setError("");
    try {
      const payload = (await callBackend({ action: "collectives" })) as {
        collectives: Collective[];
        fiscalYear: FiscalYearOption;
        fiscalYears: FiscalYearOption[];
      };
      const next = payload.collectives.find((item) => item.label === "Bhopal")?.label ||
        payload.collectives[0]?.label ||
        "";
      setCollectives(payload.collectives);
      setCollective(next);
      setFiscalYears(payload.fiscalYears);
      setFiscalYear(payload.fiscalYear.label);
      setPeriodKey("ytd");
      setDateFrom(payload.fiscalYear.from);
      setDateTo(payload.fiscalYear.to < todayIso()
        ? payload.fiscalYear.to
        : todayIso());
      setAuthorized(true);
      if (next) {
        const to = payload.fiscalYear.to < todayIso() ? payload.fiscalYear.to : todayIso();
        await loadDashboard(next, false, "", {
          fiscalYear: payload.fiscalYear.label,
          from: payload.fiscalYear.from,
          to,
        });
      }
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setLoading("");
    }
  }

  async function toggleTransactions(category: Category) {
    if (openCategory === category.categoryKey) {
      setOpenCategory("");
      setTransactionData(null);
      return;
    }
    setOpenCategory(category.categoryKey);
    setTransactionData(null);
    setTransactionError("");
    setLoading("transactions");
    try {
      const payload = (await callBackend({
        action: "transactions",
        collective: data?.collective || collective,
        from: data?.from || dateFrom,
        to: data?.to || "",
        fiscal_year: data?.fiscalYear || fiscalYear,
        account_id: category.accountId,
        category_key: category.categoryKey,
        cost_center_labels: category.costCenterLabels,
        expected_actual: category.actual,
      })) as TransactionData;
      setTransactionData(payload);
    } catch (requestError) {
      setTransactionError(readableError(requestError));
    } finally {
      setLoading("");
    }
  }

  function updateSort(field: "name" | "budget" | "actual" | "share") {
    setSort((current) => ({
      field,
      direction: current.field === field ? (current.direction === 1 ? -1 : 1) : field === "name" ? 1 : -1,
    }));
  }

  if (!authorized) {
    return (
      <AccessGate
        passcode={passcode}
        setPasscode={setPasscode}
        onSubmit={unlock}
        loading={loading === "access"}
        error={error}
      />
    );
  }

  const warnings = data
    ? [
        {
          title: data.quality.budgetStatus === "loading"
            ? "Budget sync in progress"
            : data.quality.unavailableAccounts
            ? "Some OPEX has no budget"
            : "Budget coverage complete",
          detail: data.quality.budgetStatus === "loading"
            ? `${data.quality.checkpointedAccounts || 0} budget accounts checkpointed. Actuals are already available.`
            : data.quality.unavailableAccounts
            ? `${data.quality.unavailableAccounts} Cost Center OPEX accounts have actuals but no matching budget allocation.`
            : data.budgetName
              ? "Every Cost Center OPEX actual has a matching budget allocation."
              : `Zoho Books has no matching ${data.fiscalYear} budget for this Cost Center.`,
        },
        {
          title: data.snapshot?.isStale ? "Snapshot needs refresh" : "Snapshot is current",
          detail: data.snapshot?.syncedAt
            ? `Last successful read-only Zoho sync: ${new Date(data.snapshot.syncedAt).toLocaleString("en-IN")}.`
            : "Snapshot freshness metadata is unavailable.",
        },
        {
          title: "Read-only reconciliation",
          detail: `${data.quality.includedAccounts} OPEX accounts from the selected Cost Center P&L are included in the headline actual.`,
        },
      ]
    : [];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="wordmark">Beforest</div>
        <div className="top-actions">
          <span className={error ? "snapshot error-text" : "snapshot"}>
            {syncing
              ? syncMessage || "Syncing in the background"
              : loading === "dashboard"
              ? "Loading OPEX data"
              : error
                ? "Snapshot unavailable"
                : data
                  ? data.snapshot?.isStale
                    ? `Snapshot stale · ${data.snapshot.ageMinutes ?? "?"} min old`
                    : `Snapshot · ${data.snapshot?.ageMinutes ?? 0} min old`
                  : "Select a collective"}
          </span>
          <button
            className="button"
            type="button"
            onClick={() => loadDashboard(collective, true, "", {
              fiscalYear,
              from: selectedPeriod?.from || dateFrom,
              to: selectedPeriod?.to || dateTo,
            })}
            disabled={loading !== "" || syncing || !collective}
          >
            <RefreshIcon />
            {syncing ? "Syncing…" : "Sync from Zoho"}
          </button>
        </div>
      </header>

      <section className="heading-row">
        <div>
          <h1>{data ? `${data.collective} OPEX` : "Collective OPEX"}</h1>
          <div className="subtitle">
            {data
              ? `${data.fiscalYear} · ${data.from} to ${data.to} · saved Windmill snapshot`
              : "Live financial overview"}
          </div>
        </div>
        <div className="controls">
          <label className="fy-wrap">
            <span className="sr-only">Collective</span>
            <CalendarIcon />
            <select
              value={collective}
              onChange={(event) => {
                const next = event.target.value;
                setCollective(next);
                setData(null);
                setSnapshotRunId("");
                void loadDashboard(next, false, "", {
                  fiscalYear,
                  from: selectedPeriod?.from || dateFrom,
                  to: selectedPeriod?.to || dateTo,
                }).catch((requestError) => setError(readableError(requestError)));
              }}
              disabled={loading !== "" || syncing}
            >
              {collectives.map((item) => (
                <option key={item.id} value={item.label}>
                  {item.label}{item.hasSnapshot ? "" : " · Not synced"}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </label>
          <label className="fy-wrap">
            <span className="sr-only">Fiscal year</span>
            <CalendarIcon />
            <select
              value={fiscalYear}
              onChange={(event) => {
                const nextLabel = event.target.value;
                const option = fiscalYears.find((item) => item.label === nextLabel);
                if (!option) return;
                const nextPeriod = periodOptionsForFiscalYear(option)[0];
                if (!nextPeriod) return;
                setFiscalYear(nextLabel);
                setPeriodKey("ytd");
                setDateFrom(nextPeriod.from);
                setDateTo(nextPeriod.to);
                setData(null);
                setSnapshotRunId("");
                void loadDashboard(collective, false, "", {
                  fiscalYear: nextLabel,
                  from: nextPeriod.from,
                  to: nextPeriod.to,
                }).catch((requestError) => setError(readableError(requestError)));
              }}
              disabled={loading !== "" || syncing}
            >
              {fiscalYears.map((item) => <option key={item.label}>{item.label}</option>)}
            </select>
            <ChevronIcon />
          </label>
          <label className="fy-wrap period-wrap">
            <span className="sr-only">Period</span>
            <CalendarIcon />
            <select
              value={periodKey}
              onChange={(event) => {
                const key = event.target.value;
                const selected = periodOptions.find((item) => item.key === key);
                if (selected) {
                  setPeriodKey(key);
                  setDateFrom(selected.from);
                  setDateTo(selected.to);
                  setSnapshotRunId("");
                  setData(null);
                  void loadDashboard(collective, false, "", {
                    fiscalYear,
                    from: selected.from,
                    to: selected.to,
                  });
                }
              }}
              disabled={loading !== "" || syncing || periodOptions.length === 0}
            >
              {periodOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </label>
          <div className="segmented" role="group" aria-label="Dashboard view">
            <button
              type="button"
              className={view === "budget" ? "active" : ""}
              aria-pressed={view === "budget"}
              onClick={() => setView("budget")}
            >
              <BudgetIcon />
              Budget View
            </button>
            <button
              type="button"
              className={view === "utilization" ? "active" : ""}
              aria-pressed={view === "utilization"}
              onClick={() => setView("utilization")}
            >
              <TrendIcon />
              Utilization
            </button>
          </div>
        </div>
      </section>

      {error && (
        <section className="error-banner" role="alert">
          <strong>Could not load the OPEX snapshot.</strong>
          <span>{error}</span>
          <button type="button" onClick={() => loadDashboard(collective, true, "", {
            fiscalYear,
            from: selectedPeriod?.from || dateFrom,
            to: selectedPeriod?.to || dateTo,
          })} disabled={loading !== ""}>
            Try again
          </button>
        </section>
      )}

      {loading === "dashboard" ? (
        <LoadingBlock message="Loading OPEX dashboard" />
      ) : data ? (
        <>
          <section className="kpi-band" aria-label="Headline metrics">
            {[
              ["OPEX Actual", compact(data.metrics.actual), ""],
              ["OPEX Budget", compact(data.metrics.budget), ""],
              ["Budget Used", percent(data.metrics.utilization), "green"],
              ["Under / (Over)", compact(data.metrics.variance), data.metrics.variance >= 0 ? "green" : "negative"],
              ["Active Categories", String(data.metrics.activeCategories), ""],
            ].map(([label, value, className]) => (
              <article className="kpi" key={label}>
                <div className="kpi-label">{label}</div>
                <div className={`kpi-value ${className}`}>{value}</div>
              </article>
            ))}
          </section>

          <section className={`chart-grid ${view === "utilization" ? "utilization-active" : ""}`}>
            <article className={`panel ${view === "budget" ? "focused" : "dimmed"}`}>
              <div className="panel-head">
                <div>
                  <h2>OPEX: Budget vs Actual</h2>
                  <div className="unit">₹ lakh</div>
                </div>
                <div className="legend">
                  <span><i className="budget-swatch" />Budget</span>
                  <span><i className="actual-swatch" />Actual</span>
                </div>
              </div>
              <BudgetChart months={data.months} />
            </article>

            <article className={`panel utilization-panel ${view === "utilization" ? "focused" : "dimmed"}`}>
              <div className="panel-head">
                <div>
                  <h2>OPEX Utilization Trend</h2>
                  <div className="unit">Monthly actual ÷ budget</div>
                </div>
              </div>
              <div className="insights" aria-label="OPEX highlights">
                <div><span>OPEX actual</span><strong>{compact(data.metrics.actual)}</strong></div>
                <div><span>OPEX budget</span><strong>{compact(data.metrics.budget)}</strong></div>
                <div><span>Under / (over)</span><strong>{compact(data.metrics.variance)}</strong></div>
              </div>
              <UtilizationChart months={data.months} />
            </article>
          </section>

          <section className="middle-grid">
            <article className="drivers">
              <div className="section-head">
                <h2>OPEX Categories <small>(Zoho account labels)</small></h2>
                <span className="sort-hint">Select a category for transactions</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th><button className="sort-button" onClick={() => updateSort("name")}>Category</button></th>
                      <th className="num"><button className="sort-button" onClick={() => updateSort("budget")}>Budget</button></th>
                      <th className="num"><button className="sort-button" onClick={() => updateSort("actual")}>Actual</button></th>
                      <th className="num"><button className="sort-button" onClick={() => updateSort("share")}>Share</button></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCategories.map((category) => (
                      <React.Fragment key={category.categoryKey}>
                        <tr>
                          <td>
                            <button
                              className="category-drill"
                              type="button"
                              aria-expanded={openCategory === category.categoryKey}
                              onClick={() => void toggleTransactions(category)}
                            >
                              <span>{category.name}</span>
                              <span className="drill-label">Transactions <ChevronIcon /></span>
                            </button>
                          </td>
                          <td className="num">{money.format(category.budget)}</td>
                          <td className="num">{money.format(category.actual)}</td>
                          <td className="num">{percent(category.share)}</td>
                        </tr>
                        {openCategory === category.categoryKey && (
                          <tr className="transaction-detail-row">
                            <td colSpan={4}>
                              <div className="transaction-drill">
                                <div className="transaction-drill-head">
                                  <div>
                                    <strong>{category.name}</strong>
                                    <span>Read-only Zoho Books transactions</span>
                                  </div>
                                  <button type="button" onClick={() => setOpenCategory("")}>Close</button>
                                </div>
                                {loading === "transactions" ? (
                                  <LoadingBlock message="Reconciling transaction detail" />
                                ) : transactionError ? (
                                  <div className="transaction-state error-text">
                                    <strong>Transaction details unavailable.</strong>
                                    <span>{transactionError}</span>
                                  </div>
                                ) : transactionData ? (
                                  <>
                                    <div className="transaction-table-wrap">
                                      <table className="transaction-table">
                                        <thead>
                                          <tr>
                                            <th>Date</th>
                                            <th>Payee / detail</th>
                                            <th>Type</th>
                                            <th>Reference</th>
                                            <th>Branch / tag</th>
                                            <th className="num">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {transactionData.transactions.map((row) => (
                                            <tr key={`${row.id}:${row.date}:${row.amount}`}>
                                              <td>{row.date}</td>
                                              <td>{row.detail || "—"}</td>
                                              <td>{row.type || "—"}</td>
                                              <td>{[row.entityNumber, row.reference].filter(Boolean).join(" · ") || "—"}</td>
                                              <td>{[row.branch, row.reportingTag].filter(Boolean).join(" · ") || "—"}</td>
                                              <td className="num">{money.format(row.amount)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="transaction-reconcile">
                                      <span>{transactionData.transactions.length} Zoho rows · {transactionData.from} to {transactionData.to}</span>
                                      <strong>Reconciled: {money.format(transactionData.transactionActual)}</strong>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total OPEX</td>
                      <td className="num">{money.format(data.metrics.budget)}</td>
                      <td className="num">{money.format(data.metrics.actual)}</td>
                      <td className="num">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>

            <article className="warnings">
              <h2>Reconciliation &amp; Warnings</h2>
              {warnings.map((warning) => (
                <div className="warning" key={warning.title}>
                  <div className="warning-icon"><WarningIcon /></div>
                  <div className="warning-title">{warning.title}</div>
                  <div className="warning-detail">{warning.detail}</div>
                </div>
              ))}
            </article>
          </section>

          <section className="details">
            <div className="section-head">
              <h2>Monthly Detail</h2>
              <span className="sort-hint">Cost Center P&amp;L actuals</span>
            </div>
            <div className="details-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Budget (₹L)</th>
                    <th className="num">Actual (₹L)</th>
                    <th className="num">Variance (₹L)</th>
                    <th className="num">Utilization</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((month) => (
                    <tr key={month.key}>
                      <td>{month.label}</td>
                      <td className="num">{lakh(month.budget)}</td>
                      <td className="num">{lakh(month.actual)}</td>
                      <td className="num">{lakh(month.variance)}</td>
                      <td className="num">
                        {percent(month.utilization)}
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, (month.utilization || 0) * 100)}%` }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="num">{lakh(data.metrics.budget)}</td>
                    <td className="num">{lakh(data.metrics.actual)}</td>
                    <td className="num">{lakh(data.metrics.variance)}</td>
                    <td className="num">{percent(data.metrics.utilization)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <footer className="source-note">
            <span><strong>Source:</strong> {data.source.organization} · {data.source.endpoint}</span>
            <span>{data.source.mode} · refreshed {new Date(data.refreshedAt).toLocaleString("en-IN")}</span>
          </footer>
        </>
      ) : syncing ? (
        <LoadingBlock
          message={syncMessage || `Preparing the first ${collective || "collective"} OPEX snapshot`}
        />
      ) : (
        <div className="empty-state">
          No saved snapshot matches this period. Choose another month or click Sync from Zoho.
        </div>
      )}
    </main>
  );
}
