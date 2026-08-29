// t2hub-session.ts
// ---------------------------------------------------------------------------
// Persistent t2hub.app session management for the svp-proxy edge function.
//
// t2hub.app is a stateful Laravel app. The proxy needs logged-in t2hub cookies
// (and the AES-GCM key exposed in `window.__sk`) to call the read-only API
// on behalf of all users. We bootstrap a single shared session and store it
// in the `public.t2hub_sessions` table so the session survives cold starts
// and is shared by every booking caller.
//
// Admin-only endpoints on svp-proxy:
//   POST /t2hub/bootstrap   — fetch the t2hub landing page and persist creds
//   GET  /t2hub/status      — report session age + health
//
// Per-request session material is also accepted from the client (existing
// behaviour, see t2HubHeadersFromRequest in index.ts) — when a caller sends
// its own x-t2hub-cookie + x-t2hub-key, that takes precedence. The DB-backed
// session is the fallback for everyone else.
// ---------------------------------------------------------------------------

const T2HUB_BASE = "https://t2hub.app";
const T2HUB_APP_PATH = "/takamol";
const SESSION_TTL_MS = 10 * 60 * 1000;

export const T2HUB_SESSION_MISSING_CODE = "T2HUB_SESSION_MISSING";

export type T2HubSessionRow = {
  cookie: string;
  keyRaw: string;
  csrfToken: string | null;
  appPath: string;
  bootstrappedAt: string;
  lastUsedAt: string;
};

export type T2HubSessionLive = T2HubSessionRow & {
  expiresAt: number;
};

// The shape the per-request session object must conform to (whether supplied
// by the caller via headers or loaded from the DB). Exported so the index.ts
// file can type-check its helper signatures.
export type T2HubSessionLike = {
  keyRaw: string;
  cookie: string;
  csrfToken: string;
  appPath: string;
  expiresAt: number;
};

// In-memory cache so we don't hit Postgres on every API call.
let liveSession: T2HubSessionLive | null = null;

// The most recent cookies seen on a t2hub response, echoed back to the
// caller in the `x-t2hub-cookie` response header. This is for client-supplied
// sessions where the caller maintains its own copy of the cookies; for the
// shared DB-backed session we don't need to leak anything back.
let lastT2HubCookie = "";

export function getLastT2HubCookie(): string {
  return lastT2HubCookie;
}

export function setLastT2HubCookie(value: string): void {
  lastT2HubCookie = value;
}

export const T2HUB_PUBLIC = {
  base: T2HUB_BASE,
  appPath: T2HUB_APP_PATH,
  sessionTtlMs: SESSION_TTL_MS,
} as const;

export function clearLiveSession(): void {
  liveSession = null;
}

export function getLiveSession(): T2HubSessionLive | null {
  if (liveSession && liveSession.expiresAt > Date.now()) return liveSession;
  return null;
}

function makeClient(supabaseUrl: string, serviceRoleKey: string) {
  // We deliberately do not import @supabase/supabase-js here: this module is
  // exercised by tests under vitest with a Node-style fetch, and creating a
  // Supabase client adds a network roundtrip per call. Use fetch directly.
  return {
    async select(): Promise<T2HubSessionRow | null> {
      const url = `${supabaseUrl}/rest/v1/t2hub_sessions?select=cookie,key_raw,csrf_token,app_path,bootstrapped_at,last_used_at&singleton=eq.true&limit=1`;
      const res = await fetch(url, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (!res.ok) {
        throw {
          statusCode: 500,
          message: `Failed to load t2hub session: ${res.status}`,
        };
      }
      const rows = (await res.json()) as Array<Record<string, unknown>>;
      if (!rows.length) return null;
      const row = rows[0];
      return {
        cookie: String(row.cookie || ""),
        keyRaw: String(row.key_raw || ""),
        csrfToken: row.csrf_token ? String(row.csrf_token) : null,
        appPath: String(row.app_path || T2HUB_APP_PATH),
        bootstrappedAt: String(row.bootstrapped_at || ""),
        lastUsedAt: String(row.last_used_at || ""),
      };
    },
    async upsert(row: T2HubSessionRow): Promise<void> {
      const url = `${supabaseUrl}/rest/v1/t2hub_sessions?singleton=eq.true`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          cookie: row.cookie,
          key_raw: row.keyRaw,
          csrf_token: row.csrfToken,
          app_path: row.appPath,
          last_used_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw {
          statusCode: 500,
          message: `Failed to persist t2hub session: ${res.status}`,
          details: text,
        };
      }
    },
  };
}

export async function loadT2HubSession(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<T2HubSessionLive> {
  if (liveSession && liveSession.expiresAt > Date.now()) return liveSession;

  const client = makeClient(supabaseUrl, serviceRoleKey);
  const row = await client.select();
  if (!row || !row.cookie || !row.keyRaw) {
    throw {
      statusCode: 503,
      code: T2HUB_SESSION_MISSING_CODE,
      message:
        "t2hub session has not been bootstrapped. Ask an administrator to call POST /t2hub/bootstrap on the svp-proxy edge function.",
    };
  }

  liveSession = {
    ...row,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  return liveSession;
}

export async function persistT2HubSession(
  supabaseUrl: string,
  serviceRoleKey: string,
  row: T2HubSessionRow,
): Promise<void> {
  const client = makeClient(supabaseUrl, serviceRoleKey);
  await client.upsert(row);
  liveSession = {
    ...row,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap helpers (used by the admin /t2hub/bootstrap endpoint).
// ---------------------------------------------------------------------------

const SVP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";

function extractKey(html: string): string {
  return html.match(/window\.__sk\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
}

function extractCsrf(html: string): string {
  const match = html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
  return match ? match[1] : "";
}

function extractCookie(headers: Headers): string {
  const setCookies = headers.getSetCookie?.() || [];
  if (setCookies.length) {
    return setCookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
  }
  const single = headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

export type BootstrapResult = {
  appPath: string;
  cookie: string;
  keyRaw: string;
  csrfToken: string;
  bootstrappedAt: string;
};

export async function bootstrapT2HubSession(): Promise<BootstrapResult> {
  const candidates = [T2HUB_APP_PATH, `${T2HUB_APP_PATH}/`, `${T2HUB_APP_PATH}/agent/login`];
  let lastStatus = 0;
  let lastError = "";
  for (const appPath of candidates) {
    const res = await fetch(`${T2HUB_BASE}${appPath}`, {
      headers: { "User-Agent": SVP_UA, Accept: "text/html,*/*" },
    });
    lastStatus = res.status;
    if (!res.ok) {
      lastError = `t2hub responded ${res.status} for ${appPath}`;
      continue;
    }
    const html = await res.text();
    const keyRaw = extractKey(html);
    if (!keyRaw) {
      lastError = `t2hub ${appPath} returned no window.__sk key`;
      continue;
    }
    const cookie = extractCookie(res.headers);
    if (!cookie) {
      lastError = `t2hub ${appPath} returned no session cookies`;
      continue;
    }
    return {
      appPath,
      cookie,
      keyRaw,
      csrfToken: extractCsrf(html),
      bootstrappedAt: new Date().toISOString(),
    };
  }
  throw {
    statusCode: 502,
    message: "Failed to bootstrap t2hub session",
    details: { status: lastStatus || undefined, reason: lastError || undefined },
  };
}
