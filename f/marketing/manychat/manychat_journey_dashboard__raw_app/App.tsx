import React, { useEffect, useMemo, useState } from "react";
import { backend } from "./wmill";
import "./index.css";

type ClickRow = {
  event_key: string;
  automation_name: string;
  flow_name?: string;
  message_name: string;
  button_text: string;
  next_step: string;
  subscriber_id?: string;
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  instagram_username?: string;
  phone?: string;
  email?: string;
  follows_your_account?: string;
  opted_in?: string;
  click_count: number;
  contact_name: string;
  contact_key: string;
  last_seen_at: string;
  event_type?: string;
  button_type?: string;
  destination?: string;
};

type DashboardData = {
  generated_at_ist: string;
  rows: ClickRow[];
};

type PathKey = "live" | "stay" | "buy";
type IntentScore = "Low" | "Medium" | "High";

type Journey = {
  key: string;
  name: string;
  instagram: string;
  rows: ClickRow[];
  firstInterest?: PathKey;
  firstInterestLabel: string;
  firstInterestAt?: Date;
  pathEntered: boolean;
  websiteIntent: boolean;
  goBack: boolean;
  recovered: boolean;
  recoveredTo?: PathKey;
  switchedInterest: boolean;
  depth: number;
  intentScore: IntentScore;
  lastAction: string;
  clicks: number;
};

const periodOptions = ["Last 30 days", "Last 7 days", "Last 90 days", "Custom"] as const;
const allFilter = "All";

const pathConfig: Record<PathKey, {
  label: string;
  contentPath: string;
  interestButtons: string[];
  websiteButtons: string[];
}> = {
  live: {
    label: "Live Here",
    contentPath: "Beforest Collectives",
    interestButtons: ["live here"],
    websiteButtons: ["explore collectives", "faqs"],
  },
  stay: {
    label: "Stay With Us",
    contentPath: "Belong & 10percent",
    interestButtons: ["stay with us"],
    websiteButtons: ["explore belong", "explore 10percent"],
  },
  buy: {
    label: "Buy Our Produce",
    contentPath: "Bewild Produce",
    interestButtons: ["buy our produce"],
    websiteButtons: ["shop bewild", "follow bewild"],
  },
};

const pathOrder: PathKey[] = ["live", "stay", "buy"];
const firstInterestByButton = new Map<string, PathKey>(
  pathOrder.flatMap((key) => pathConfig[key].interestButtons.map((button) => [button, key])),
);
const websiteButtons = new Set(pathOrder.flatMap((key) => pathConfig[key].websiteButtons));
const startEventTypes = new Set(["welcome_message_sent", "new_follower_entered", "message_sent"]);

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function websitePathForButton(buttonText: unknown) {
  const normalized = norm(buttonText);
  return pathOrder.find((key) => pathConfig[key].websiteButtons.includes(normalized));
}

function isWebsiteButton(buttonText: unknown) {
  return Boolean(websitePathForButton(buttonText));
}

function isPlaceholder(value: unknown) {
  const text = norm(value);
  return (
    !text ||
    text === "contact id" ||
    text === "subscriber id" ||
    text === "first name" ||
    text === "last name" ||
    text === "username" ||
    text === "email" ||
    text === "phone" ||
    text.startsWith("{{")
  );
}

function hasRealIdentity(row: ClickRow) {
  return [row.subscriber_id, row.contact_id, row.instagram_username, row.email, row.phone].some((value) => !isPlaceholder(value));
}

function isTestRow(row: ClickRow) {
  const text = [row.subscriber_id, row.contact_id, row.instagram_username, row.first_name, row.email]
    .map(norm)
    .join(" ");
  return text.includes("test_manychat") || text.includes("test route") || text.includes("test subscriber");
}

function isRealRow(row: ClickRow) {
  return hasRealIdentity(row) && !isTestRow(row);
}

function fmt(value: number) {
  return new Intl.NumberFormat("en-IN").format(Math.round(value || 0));
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function parseDate(value: string) {
  const normalized = value?.replace(" ", "T");
  const date = normalized ? new Date(normalized) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next;
}

function niceTime(value: string) {
  const date = parseDate(value);
  if (!date) return value || "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function latestRow(rows: ClickRow[]) {
  return rows[rows.length - 1];
}

function stageText(row: ClickRow) {
  return `${row.button_text || "-"} -> ${row.next_step || "-"}`;
}

function displayPerson(row: ClickRow) {
  if (!isPlaceholder(row.contact_name)) return row.contact_name;
  if (!isPlaceholder(row.instagram_username)) return row.instagram_username || "Unknown";
  if (!isPlaceholder(row.subscriber_id)) return row.subscriber_id || "Unknown";
  return row.contact_key || "Unknown";
}

function MetricCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Donut({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = total
    ? segments
        .map((item) => {
          const start = (cursor / total) * 100;
          cursor += item.value;
          const end = (cursor / total) * 100;
          return `${item.color} ${start}% ${end}%`;
        })
        .join(", ")
      : "#e8e0d4 0% 100%";
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="donut-center">
          <strong>{fmt(total)}</strong>
          <span>interested</span>
        </div>
      </div>
      <div className="donut-legend">
        {segments.map((item) => (
          <article key={item.label}>
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
            <b>{fmt(item.value)}</b>
          </article>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [data, setData] = useState<DashboardData>({ generated_at_ist: "", rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<(typeof periodOptions)[number]>("Last 30 days");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [automationFilter, setAutomationFilter] = useState(allFilter);
  const [interestFilter, setInterestFilter] = useState(allFilter);
  const [messageFilter, setMessageFilter] = useState(allFilter);
  const [buttonFilter, setButtonFilter] = useState(allFilter);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [selectedJourney, setSelectedJourney] = useState<string>("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      setData((await backend.fetch_manychat_dashboard()) as DashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ManyChat data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const realRows = useMemo(() => data.rows.filter(isRealRow), [data.rows]);

  const dateWindow = useMemo(() => {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;

    if (period === "Last 7 days") {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
      to = endOfDay(now);
    } else if (period === "Last 30 days") {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
      to = endOfDay(now);
    } else if (period === "Last 90 days") {
      from = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89));
      to = endOfDay(now);
    } else {
      from = fromDate ? startOfDay(new Date(`${fromDate}T00:00:00`)) : null;
      to = toDate ? endOfDay(new Date(`${toDate}T00:00:00`)) : null;
    }

    return { from, to };
  }, [fromDate, period, toDate]);

  const rowsInDateWindow = useMemo(() => {
    return data.rows.filter((row) => {
      const rowDate = parseDate(row.last_seen_at);
      return (!dateWindow.from || (rowDate && rowDate >= dateWindow.from)) && (!dateWindow.to || (rowDate && rowDate <= dateWindow.to));
    });
  }, [data.rows, dateWindow]);

  const dateFilteredRows = useMemo(() => rowsInDateWindow.filter(isRealRow), [rowsInDateWindow]);

  const options = useMemo(() => {
    const uniq = (values: string[]) => [allFilter, ...Array.from(new Set(values.filter(Boolean))).sort()];
    return {
      automations: uniq(dateFilteredRows.map((row) => row.automation_name || row.flow_name || "")),
      messages: uniq(dateFilteredRows.map((row) => row.message_name || "")),
      buttons: uniq(dateFilteredRows.map((row) => row.button_text || "")),
    };
  }, [dateFilteredRows]);

  const filteredRows = useMemo(() => {
    return dateFilteredRows.filter((row) => {
      const firstInterest = firstInterestByButton.get(norm(row.button_text));
      const websitePath = websitePathForButton(row.button_text);
      const matchesInterest = interestFilter === allFilter || firstInterest === interestFilter || websitePath === interestFilter;
      return (
        (automationFilter === allFilter || row.automation_name === automationFilter || row.flow_name === automationFilter) &&
        (messageFilter === allFilter || row.message_name === messageFilter) &&
        (buttonFilter === allFilter || row.button_text === buttonFilter) &&
        matchesInterest
      );
    });
  }, [automationFilter, buttonFilter, dateFilteredRows, interestFilter, messageFilter]);

  const trackedFilteredRows = useMemo(() => {
    return rowsInDateWindow.filter((row) => {
      const firstInterest = firstInterestByButton.get(norm(row.button_text));
      const websitePath = websitePathForButton(row.button_text);
      const matchesInterest = interestFilter === allFilter || firstInterest === interestFilter || websitePath === interestFilter;
      return (
        (automationFilter === allFilter || row.automation_name === automationFilter || row.flow_name === automationFilter) &&
        (messageFilter === allFilter || row.message_name === messageFilter) &&
        (buttonFilter === allFilter || row.button_text === buttonFilter) &&
        matchesInterest
      );
    });
  }, [automationFilter, buttonFilter, interestFilter, messageFilter, rowsInDateWindow]);

  const journeys = useMemo<Journey[]>(() => {
    const grouped = new Map<string, ClickRow[]>();
    for (const row of filteredRows) {
      const rows = grouped.get(row.contact_key) || [];
      rows.push(row);
      grouped.set(row.contact_key, rows);
    }

    return Array.from(grouped.entries()).map(([key, rows]) => {
      const sorted = rows
        .slice()
        .sort((a, b) => (parseDate(a.last_seen_at)?.getTime() || 0) - (parseDate(b.last_seen_at)?.getTime() || 0));
      const firstInterestRow = sorted.find((row) => firstInterestByButton.get(norm(row.button_text)));
      const firstInterest = firstInterestRow ? firstInterestByButton.get(norm(firstInterestRow.button_text)) : undefined;
      const firstInterestAt = firstInterestRow ? parseDate(firstInterestRow.last_seen_at) || undefined : undefined;
      const afterFirst = firstInterestAt
        ? sorted.filter((row) => (parseDate(row.last_seen_at)?.getTime() || 0) >= firstInterestAt.getTime())
        : sorted;
      const allowedWebsiteButtons = firstInterest ? new Set(pathConfig[firstInterest].websiteButtons) : websiteButtons;
      const selectedInterests = new Set(sorted.map((row) => firstInterestByButton.get(norm(row.button_text))).filter(Boolean));
      const firstGoBack = afterFirst.find((row) => norm(row.button_text) === "go back");
      const firstGoBackAt = firstGoBack ? parseDate(firstGoBack.last_seen_at) : null;
      const postGoBackInterest = firstGoBackAt
        ? sorted.find((row) => {
            const when = parseDate(row.last_seen_at);
            const nextInterest = firstInterestByButton.get(norm(row.button_text));
            return when && when.getTime() > firstGoBackAt.getTime() && nextInterest && nextInterest !== firstInterest;
          })
        : undefined;
      const websiteIntent = afterFirst.some((row) => isWebsiteButton(row.button_text)) || sorted.some((row) => isWebsiteButton(row.button_text));
      const pathEntered = firstInterest ? afterFirst.some((row) => allowedWebsiteButtons.has(norm(row.button_text))) : false;
      const depth = sorted.filter((row) => norm(row.button_text)).length;
      const intentScore: IntentScore = websiteIntent ? "High" : depth >= 2 || selectedInterests.size > 1 ? "Medium" : "Low";
      const last = latestRow(sorted);

      return {
        key,
        name: displayPerson(sorted[0]),
        instagram: sorted.find((row) => !isPlaceholder(row.instagram_username))?.instagram_username || "",
        rows: sorted,
        firstInterest,
        firstInterestLabel: firstInterest ? pathConfig[firstInterest].label : "-",
        firstInterestAt,
        pathEntered: Boolean(pathEntered),
        websiteIntent,
        goBack: afterFirst.some((row) => norm(row.button_text) === "go back"),
        recovered: Boolean(postGoBackInterest),
        recoveredTo: postGoBackInterest ? firstInterestByButton.get(norm(postGoBackInterest.button_text)) : undefined,
        switchedInterest: selectedInterests.size > 1,
        depth,
        intentScore,
        lastAction: last ? stageText(last) : "-",
        clicks: sorted.reduce((sum, row) => sum + Number(row.click_count || 0), 0),
      };
    });
  }, [filteredRows]);

  const metrics = useMemo(() => {
    const newFollowerRows = filteredRows.filter((row) => startEventTypes.has(norm(row.event_type)));
    const newFollowers = new Set(newFollowerRows.map((row) => row.contact_key)).size;
    const websiteRows = trackedFilteredRows.filter((row) => isWebsiteButton(row.button_text));
    const websiteRealRows = websiteRows.filter(isRealRow);
    const websiteRealUserKeys = new Set(websiteRealRows.map((row) => row.contact_key));
    const engagedUsers = journeys.length;
    const interestedUsers = journeys.filter((journey) => journey.firstInterest).length;
    const firstInterestUsers = journeys.filter((journey) => journey.firstInterest).length;
    const followerBase = newFollowers >= firstInterestUsers ? newFollowers : firstInterestUsers || engagedUsers;
    const websiteClicks = websiteRows.reduce((sum, row) => sum + Number(row.click_count || 0), 0);
    const websiteVisitors = websiteRealUserKeys.size || websiteClicks;
    const totalClicks = trackedFilteredRows.reduce((sum, row) => sum + Number(row.click_count || 0), 0);
    const averageDepth = journeys.length ? journeys.reduce((sum, journey) => sum + journey.depth, 0) / journeys.length : 0;
    const goBackPeople = journeys.filter((journey) => journey.goBack).length;
    const switchers = journeys.filter((journey) => journey.switchedInterest).length;
    const highIntentUsers = websiteVisitors;
    const pathExploredUsers = websiteVisitors;
    const placeholderRows = data.rows.length - realRows.length;
    const interestCounts = Object.fromEntries(
      pathOrder.map((key) => [key, journeys.filter((journey) => journey.firstInterest === key).length]),
    ) as Record<PathKey, number>;
    const topInterest = pathOrder
      .slice()
      .sort((a, b) => interestCounts[b] - interestCounts[a])
      .find((key) => interestCounts[key] > 0);

    return {
      newFollowers,
      engagedUsers,
      interestedUsers,
      websiteVisitors,
      totalClicks,
      averageDepth,
      goBackPeople,
      switchers,
      highIntentUsers,
      pathExploredUsers,
      websiteClickRows: websiteRows.length,
      websiteClicks: websiteRows.reduce((sum, row) => sum + Number(row.click_count || 0), 0),
      placeholderRows,
      interestCounts,
      topInterest,
      interestRateBase: followerBase,
      newFollowerTracked: newFollowers >= firstInterestUsers && newFollowers > 0,
      followerBase,
      followerBaseLabel: newFollowers >= firstInterestUsers && newFollowers > 0 ? "welcome/start events" : "fallback: unique first-interest users",
      websiteIdentityTracked: websiteRealUserKeys.size > 0,
    };
  }, [data.rows.length, filteredRows, journeys, realRows.length, trackedFilteredRows]);

  const interestSegments = pathOrder.map((key, index) => ({
    key,
    label: pathConfig[key].label,
    value: metrics.interestCounts[key],
    color: ["#d9ecff", "#e2f4d9", "#ffe9ad"][index],
  }));

  const funnelStages = [
    {
      label: "New Followers",
      count: metrics.followerBase,
      note: metrics.followerBaseLabel,
    },
    { label: "Initial Interest", count: metrics.interestedUsers, note: "Live / Stay / Buy" },
    { label: "Path Explored", count: metrics.pathExploredUsers, note: "CTA inside selected path" },
    { label: "Website Intent", count: metrics.websiteVisitors, note: "external website/social CTA" },
  ];

  const buttonPerformance = useMemo(() => {
    const byButton = new Map<string, { message: string; button: string; next: string; users: Set<string>; clicks: number; hasRealUsers: boolean }>();
    for (const row of trackedFilteredRows) {
      const key = `${row.message_name}|${row.button_text}|${row.next_step}`;
      const item = byButton.get(key) || {
        message: row.message_name || "-",
        button: row.button_text || "-",
        next: row.next_step || "-",
        users: new Set<string>(),
        clicks: 0,
        hasRealUsers: false,
      };
      if (isRealRow(row)) {
        item.users.add(row.contact_key);
        item.hasRealUsers = true;
      }
      item.clicks += Number(row.click_count || 0);
      byButton.set(key, item);
    }
    const totalClicks = trackedFilteredRows.reduce((sum, row) => sum + Number(row.click_count || 0), 0);
    return Array.from(byButton.values())
      .map((item) => {
        const normalizedButton = norm(item.button);
        const firstInterest = firstInterestByButton.get(normalizedButton);
        const isWebsite = isWebsiteButton(normalizedButton);
        const parentPath = websitePathForButton(normalizedButton);
        const entered = firstInterest
          ? metrics.engagedUsers
          : parentPath
            ? metrics.interestCounts[parentPath] || metrics.engagedUsers
            : metrics.engagedUsers;
        const displayUsers = item.hasRealUsers ? item.users.size : item.clicks;
        const websiteVisits = isWebsite ? displayUsers : 0;
        return {
          ...item,
          uniqueUsers: displayUsers,
          clickShare: pct(item.clicks, totalClicks),
          nextStepRate: pct(displayUsers, entered),
          websiteVisits,
          websiteVisitRate: isWebsite ? pct(websiteVisits, entered) : "-",
          dropOff: isWebsite || firstInterest ? pct(Math.max(0, entered - displayUsers), entered) : "-",
        };
      })
      .sort((a, b) => b.clicks - a.clicks);
  }, [trackedFilteredRows, journeys, metrics.engagedUsers]);

  const pathPerformance = useMemo(() => {
    return pathOrder.map((key) => {
      const entered = journeys.filter((journey) => journey.firstInterest === key).length;
      const continued = new Set(
        filteredRows
          .filter((row) => websitePathForButton(row.button_text) === key)
          .map((row) => row.contact_key),
      ).size;
      const conversion = entered ? continued / entered : 0;
      const dropOff = entered ? 1 - conversion : 0;
      const status = conversion >= 0.65 ? "Strong" : conversion >= 0.4 ? "Average" : "Needs Attention";
      return {
        key,
        path: `${pathConfig[key].label} -> ${pathConfig[key].contentPath}`,
        entered,
        continued,
        conversion,
        dropOff,
        status,
      };
    });
  }, [filteredRows, journeys]);

  const topPaths = useMemo(() => {
    const byPath = new Map<string, { path: string; users: number; highIntent: number }>();
    for (const journey of journeys) {
      const path = journey.rows.map((row) => row.button_text).filter(Boolean).join(" -> ");
      if (!path) continue;
      const current = byPath.get(path) || { path, users: 0, highIntent: 0 };
      current.users += 1;
      if (journey.websiteIntent) current.highIntent += 1;
      byPath.set(path, current);
    }
    return Array.from(byPath.values()).sort((a, b) => b.users - a.users).slice(0, 8);
  }, [journeys]);

  const visibleJourneys = useMemo(() => {
    const query = peopleSearch.trim().toLowerCase();
    return journeys
      .filter((journey) => {
        const text = [journey.name, journey.instagram, journey.key, journey.firstInterestLabel, journey.lastAction].join(" ").toLowerCase();
        return !query || text.includes(query);
      })
      .sort((a, b) => b.depth - a.depth || b.clicks - a.clicks);
  }, [journeys, peopleSearch]);

  const activeJourney = visibleJourneys.find((journey) => journey.key === selectedJourney) || visibleJourneys[0];

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">MANYCHAT FOLLOWER JOURNEY</span>
          <h1>Beforest ManyChat Follower Journey Dashboard</h1>
          <p>
            Track what new Instagram followers are interested in, where they explore next, who reaches website CTAs,
            and which journey paths need improvement.
          </p>
        </div>
        <div className="hero-actions">
          <button onClick={loadData}>{loading ? "Loading" : "Refresh"}</button>
          <span>Last updated: {data.generated_at_ist || "-"}</span>
        </div>
      </header>

      <section className="scope-note">
        <strong>Scope</strong>
        <span>
          Based on ManyChat external-request events stored in Windmill. Website visitors means people who clicked an
          outbound website/social CTA, not confirmed website sessions.
        </span>
      </section>

      <Panel title="Filters" meta="Default: last 30 days">
        <section className="filters">
          <label>
            Period
            <select value={period} onChange={(event) => setPeriod(event.target.value as (typeof periodOptions)[number])}>
              {periodOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => {
                setFromDate(event.target.value);
                if (event.target.value) setPeriod("Custom");
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              max={toDate || toDateInput(new Date())}
              onChange={(event) => {
                setToDate(event.target.value);
                if (event.target.value) setPeriod("Custom");
              }}
            />
          </label>
          <label>
            Automation
            <select value={automationFilter} onChange={(event) => setAutomationFilter(event.target.value)}>
              {options.automations.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Initial Interest
            <select value={interestFilter} onChange={(event) => setInterestFilter(event.target.value)}>
              <option>{allFilter}</option>
              {pathOrder.map((key) => <option key={key} value={key}>{pathConfig[key].label}</option>)}
            </select>
          </label>
          <label>
            Message
            <select value={messageFilter} onChange={(event) => setMessageFilter(event.target.value)}>
              {options.messages.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            Button
            <select value={buttonFilter} onChange={(event) => setButtonFilter(event.target.value)}>
              {options.buttons.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </section>
      </Panel>

      {error ? <div className="error">{error}</div> : null}

      <section className="metrics seven">
        <MetricCard
          label="New Followers"
          value={fmt(metrics.followerBase)}
          note={metrics.followerBaseLabel}
          tone="green"
        />
        <MetricCard label="Unique Engaged Users" value={fmt(metrics.engagedUsers)} note="People with tracked button clicks" tone="blue" />
        <MetricCard label="Total Button Clicks" value={fmt(metrics.totalClicks)} note="Sum of captured click_count" tone="yellow" />
        <MetricCard
          label="Interest Rate"
          value={pct(metrics.interestedUsers, metrics.interestRateBase)}
          note={metrics.newFollowerTracked ? "Interested users / new followers" : "Interested users / fallback follower base"}
          tone="pink"
        />
        <MetricCard label="Website Visitors" value={fmt(metrics.websiteVisitors)} note={`${fmt(metrics.websiteClicks)} captured website/social CTA clicks`} tone="lavender" />
        <MetricCard label="Website Visit Rate" value={pct(metrics.websiteVisitors, metrics.interestedUsers)} note="CTA contacts / interested users" tone="green" />
        <MetricCard
          label="Top Interest"
          value={metrics.topInterest ? pathConfig[metrics.topInterest].label : "-"}
          note="Highest first-choice interest"
          tone="blue"
        />
      </section>

      <section className="dashboard-grid">
        <Panel title="Interest Distribution" meta="Unique users by first interest">
          <Donut segments={interestSegments} />
          <div className="bar-list">
            {interestSegments.map((item) => (
              <article key={item.key}>
                <div><strong>{item.label}</strong><span>{pct(item.value, metrics.interestedUsers)}</span></div>
                <em><i style={{ width: pct(item.value, metrics.interestedUsers), background: item.color }} /></em>
                <b>{fmt(item.value)} users</b>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Journey Funnel" meta="Users, conversion, drop-off">
          <div className="funnel">
            {funnelStages.map((stage, index) => {
              const previous = index === 0 ? stage.count : funnelStages[index - 1].count;
              const lost = index === 0 ? 0 : Math.max(0, previous - stage.count);
              return (
                <article key={stage.label}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <strong>{stage.label}</strong>
                  <b>{fmt(stage.count)}</b>
                  <span>{index === 0 ? "100.0%" : pct(stage.count, previous)} from previous</span>
                  <span>{index === 0 ? stage.note : `${fmt(lost)} drop-off`}</span>
                </article>
              );
            })}
          </div>
        </Panel>
      </section>

      <Panel title="Button Performance" meta="Every tracked button, users, clicks, step rate and drop-off">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Message</th>
                <th>Button</th>
                <th>Unique Users</th>
                <th>Clicks</th>
                <th>Click Share</th>
                <th>Next Step Rate</th>
                <th>Website Visits</th>
                <th>Website Visit Rate</th>
                <th>Drop-off</th>
              </tr>
            </thead>
            <tbody>
              {buttonPerformance.map((row) => (
                <tr key={`${row.message}-${row.button}-${row.next}`}>
                  <td>{row.message}<small>{row.next}</small></td>
                  <td>{row.button}</td>
                  <td>{fmt(row.uniqueUsers)}</td>
                  <td>{fmt(row.clicks)}</td>
                  <td>{row.clickShare}</td>
                  <td>{row.nextStepRate}</td>
                  <td>{row.websiteVisits === 0 ? "-" : fmt(row.websiteVisits)}</td>
                  <td>{row.websiteVisitRate}</td>
                  <td>{row.dropOff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="dashboard-grid">
        <Panel title="Top Journey Paths" meta="Most common chronological paths">
          <div className="path-list">
            {topPaths.map((row, index) => (
              <article key={row.path}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{row.path}</strong>
                <span>{fmt(row.users)} users | {fmt(row.highIntent)} high-intent</span>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Optimization Opportunities" meta="Sorted by path drop-off">
          <div className="opportunity-list">
            {pathPerformance
              .slice()
              .sort((a, b) => b.dropOff - a.dropOff)
              .map((row) => (
                <article key={row.key} className={row.status === "Strong" ? "good" : row.status === "Average" ? "average" : "attention"}>
                  <div>
                    <strong>{row.path}</strong>
                    <span>Entered {fmt(row.entered)} | Continued {fmt(row.continued)}</span>
                  </div>
                  <b>{pct(row.continued, row.entered)}</b>
                  <small>{row.status} | {pct(row.entered - row.continued, row.entered)} drop-off</small>
                </article>
              ))}
          </div>
        </Panel>
      </section>

      <Panel title="User Journey Explorer" meta="Search a user and inspect their actual path">
        <div className="journey-tools">
          <input value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} placeholder="Search name, Instagram username, subscriber id, last action..." />
          <span>{fmt(visibleJourneys.length)} journeys</span>
        </div>
        <div className="journey-grid">
          <div className="journey-list">
            {visibleJourneys.slice(0, 24).map((journey) => (
              <button
                key={journey.key}
                className={activeJourney?.key === journey.key ? "active" : ""}
                onClick={() => setSelectedJourney(journey.key)}
              >
                <strong>{journey.name}</strong>
                <span>{journey.firstInterestLabel} | {journey.intentScore} intent</span>
              </button>
            ))}
          </div>
          <div className="journey-detail">
            {activeJourney ? (
              <>
                <div className="journey-summary">
                  <article><span>Initial Interest</span><strong>{activeJourney.firstInterestLabel}</strong></article>
                  <article><span>Website Visit</span><strong>{activeJourney.websiteIntent ? "Yes" : "No"}</strong></article>
                  <article><span>Journey Depth</span><strong>{fmt(activeJourney.depth)}</strong></article>
                  <article><span>Intent Score</span><strong>{activeJourney.intentScore}</strong></article>
                  <article><span>Last Action</span><strong>{activeJourney.lastAction}</strong></article>
                </div>
                <div className="timeline">
                  {activeJourney.rows.map((row) => (
                    <article key={row.event_key}>
                      <time>{niceTime(row.last_seen_at)}</time>
                      <strong>{row.button_text}</strong>
                      <span>{row.message_name} {"->"} {row.next_step}</span>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">No journey available for this filter.</div>
            )}
          </div>
        </div>
      </Panel>

      <section className="metrics support">
        <MetricCard label="Average Journey Depth" value={metrics.averageDepth.toFixed(1)} note="Meaningful steps per user" tone="green" />
        <MetricCard label="Go Back Rate" value={pct(metrics.goBackPeople, metrics.interestedUsers)} note="Go Back users / interested users" tone="yellow" />
        <MetricCard label="Interest Switching Rate" value={pct(metrics.switchers, metrics.interestedUsers)} note="Users selecting 2+ interests" tone="blue" />
        <MetricCard label="High Intent Users" value={fmt(metrics.highIntentUsers)} note="Contacts clicking website/social CTA" tone="pink" />
        <MetricCard label="Placeholder Rows Filtered" value={fmt(metrics.placeholderRows)} note="Rows excluded from real-user metrics" tone="lavender" />
      </section>
    </main>
  );
}

export default App;
