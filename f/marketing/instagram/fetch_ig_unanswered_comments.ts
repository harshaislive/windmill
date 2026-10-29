import * as wmill from "windmill-client";

type MediaItem = {
  id: string;
  caption?: string;
  timestamp: string;
  media_type: string;
  permalink?: string;
};

type CommentRow = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  replies?: { data?: CommentRow[] };
};

const GRAPH_BASE = "https://graph.facebook.com/v23.0";
const DEFAULT_TOKEN_PATH = "f/marketing/instagram/facebook_api_token";
const DASHBOARD_PASSCODE_PATH = "f/marketing/instagram/dashboard_passcode";

async function graphGet<T>(path: string, token: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("access_token", token);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `Graph API request failed: ${response.status}`);
  }
  return body as T;
}

async function graphGetUrl<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || `Graph API request failed: ${response.status}`);
  }
  return body as T;
}

async function getToken(variablePath: string): Promise<string> {
  const token = (await wmill.getVariable(variablePath)).trim();
  if (!token || token === "CHANGE_ME_FACEBOOK_LONG_LIVED_ACCESS_TOKEN") {
    throw new Error(`Facebook token variable is not configured: ${variablePath}`);
  }
  return token;
}

async function requireDashboardPasscode(input: string): Promise<void> {
  const configured = (await wmill.getVariable(DASHBOARD_PASSCODE_PATH)).trim();
  if (!configured) {
    throw new Error(`Dashboard passcode is not configured: ${DASHBOARD_PASSCODE_PATH}`);
  }
  if (input.trim() !== configured) {
    throw new Error("Invalid dashboard passcode.");
  }
}

async function findBeforestInstagram(token: string, pageName: string, igUsername?: string) {
  const accounts = await graphGet<{
    data: Array<{
      id: string;
      name: string;
      instagram_business_account?: { id: string; username: string; name?: string };
    }>;
  }>("/me/accounts", token, {
    fields: "id,name,instagram_business_account{id,username,name}",
  });

  const page = accounts.data.find((item) => {
    const ig = item.instagram_business_account;
    if (!ig) return false;
    if (igUsername) return ig.username.toLowerCase() === igUsername.toLowerCase();
    return item.name.toLowerCase() === pageName.toLowerCase();
  });

  if (!page?.instagram_business_account) {
    throw new Error(`Could not find connected Instagram business account for ${igUsername || pageName}`);
  }

  return {
    page_id: page.id,
    page_name: page.name,
    ig_id: page.instagram_business_account.id,
    ig_username: page.instagram_business_account.username,
  };
}

async function listRecentMedia(igId: string, token: string, lookbackDays: number, maxMedia: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const rows: MediaItem[] = [];
  let page = await graphGet<{ data: MediaItem[]; paging?: { next?: string } }>(`/${igId}/media`, token, {
    fields: "id,caption,timestamp,media_type,permalink",
    limit: Math.min(100, maxMedia),
  });

  while (true) {
    for (const item of page.data || []) {
      if (new Date(item.timestamp) >= cutoff) rows.push(item);
    }
    if (rows.length >= maxMedia) break;
    const oldest = page.data?.length ? new Date(page.data[page.data.length - 1].timestamp) : undefined;
    if (!page.paging?.next || (oldest && oldest < cutoff)) break;
    page = await graphGetUrl<{ data: MediaItem[]; paging?: { next?: string } }>(page.paging.next);
  }

  return rows.slice(0, maxMedia);
}

async function listComments(mediaId: string, token: string, maxComments: number) {
  const rows: CommentRow[] = [];
  let page = await graphGet<{ data: CommentRow[]; paging?: { next?: string } }>(`/${mediaId}/comments`, token, {
    fields: "id,text,username,timestamp,replies{id,text,username,timestamp}",
    limit: Math.min(100, maxComments),
  });

  while (true) {
    rows.push(...(page.data || []));
    if (rows.length >= maxComments || !page.paging?.next) break;
    page = await graphGetUrl<{ data: CommentRow[]; paging?: { next?: string } }>(page.paging.next);
  }

  return rows.slice(0, maxComments);
}

function isOwn(username: string | undefined, ownUsernames: string[]) {
  if (!username) return false;
  return ownUsernames.map((item) => item.toLowerCase()).includes(username.toLowerCase());
}

function hoursOld(timestamp?: string) {
  if (!timestamp) return 0;
  return Math.round((Date.now() - new Date(timestamp).getTime()) / 36_000) / 100;
}

export async function main(
  lookback_days = 30,
  max_media = 60,
  max_comments_per_media = 100,
  facebook_token_variable_path = DEFAULT_TOKEN_PATH,
  page_name = "Beforest",
  ig_username = "beforestfarming",
  dashboard_passcode = "",
) {
  await requireDashboardPasscode(dashboard_passcode);
  const token = await getToken(facebook_token_variable_path);
  const account = await findBeforestInstagram(token, page_name, ig_username);
  const ownUsernames = [account.ig_username, "beforest", "beforestfarming"];
  const media = await listRecentMedia(account.ig_id, token, lookback_days, max_media);
  const unanswered = [];
  let totalComments = 0;
  let answeredComments = 0;

  for (const item of media) {
    const comments = await listComments(item.id, token, max_comments_per_media).catch(() => []);
    for (const comment of comments) {
      if (isOwn(comment.username, ownUsernames)) continue;
      totalComments += 1;
      const replies = comment.replies?.data || [];
      const answered = replies.some((reply) => isOwn(reply.username, ownUsernames));
      if (answered) {
        answeredComments += 1;
        continue;
      }
      unanswered.push({
        comment_id: comment.id,
        username: comment.username || "unknown",
        text: comment.text || "",
        timestamp: comment.timestamp || "",
        age_hours: hoursOld(comment.timestamp),
        media_id: item.id,
        media_type: item.media_type,
        media_timestamp: item.timestamp,
        media_permalink: item.permalink,
        media_caption: (item.caption || "").slice(0, 180),
        suggested_owner: "Community / content team",
      });
    }
  }

  unanswered.sort((a, b) => b.age_hours - a.age_hours);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    account,
    lookback_days,
    scanned_media: media.length,
    total_comments: totalComments,
    answered_comments: answeredComments,
    unanswered_count: unanswered.length,
    unanswered,
  };
}
