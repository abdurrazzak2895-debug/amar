import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { getReservationBillingOperation } from "./billing-utils.ts";
import {
  buildReservationCollectionQuery,
  filterReservationRows,
  getReservationLookupId,
  reshapeReservationPayload,
} from "./reservation-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-access-token, x-request-id, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── SVP API helper ──────────────────────────────────────────────────
const SVP_BASE = Deno.env.get("SVP_BASE_URL") || "https://svp-international-api.pacc.sa";
const SVP_LOCALE = "en";
const SVP_ORIGIN = "https://svp-international.pacc.sa";
const SVP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const T2HUB_BASE = "https://t2hub.app";
const T2HUB_APP_PATH = "/takamol";
const ACCESS_JWT_SECRET = Deno.env.get("JWT_ACCESS_SECRET");
if (!ACCESS_JWT_SECRET) throw new Error("JWT_ACCESS_SECRET is required");

async function getAccessJwtKey() {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(ACCESS_JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
}

type SvpErrorCode = "CANDIDATE_ACCOUNT_REQUIRED" | "CANDIDATE_LABOR_ID_EXISTS" | "SVP_VALIDATION_ERROR" | "SVP_UPSTREAM_ERROR";

function firstNestedError(data: any): string {
  const laborId = data?.errors?.temporaryseat?.labor_id;
  if (Array.isArray(laborId) && laborId[0]) return String(laborId[0]);
  for (const value of Object.values(data?.errors || {})) {
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (value && typeof value === "object") {
      for (const item of Object.values(value as Record<string, unknown>)) {
        if (Array.isArray(item) && item[0]) return String(item[0]);
      }
    }
  }
  return "";
}

function normalizeSvpError(statusCode: number, data: any) {
  const rawMessage = String(data?.message || data?.error || firstNestedError(data) || "");
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes("active candidate account is required") || (normalized.includes("candidate account") && normalized.includes("required"))) {
    return { statusCode, code: "CANDIDATE_ACCOUNT_REQUIRED" as SvpErrorCode, message: "Active candidate account is required", details: { upstreamStatus: statusCode } };
  }
  if (normalized.includes("labor_id") && normalized.includes("already been taken")) {
    return { statusCode: 409, code: "CANDIDATE_LABOR_ID_EXISTS" as SvpErrorCode, message: "This candidate labor ID is already registered. Use the existing candidate account.", details: { upstreamStatus: statusCode } };
  }
  return { statusCode, code: (statusCode === 422 ? "SVP_VALIDATION_ERROR" : "SVP_UPSTREAM_ERROR") as SvpErrorCode, message: rawMessage || `SVP request failed: ${statusCode}`, details: { upstreamStatus: statusCode } };
}

async function requireAccessPermission(req: Request, permissionKey: string) {
  const token = req.headers.get("x-access-token")?.trim();
  if (!token) throw { statusCode: 401, message: "Access Portal login is required" };
  let payload: { sub?: string };
  try {
    payload = await verify(token, await getAccessJwtKey()) as { sub?: string };
  } catch {
    throw { statusCode: 401, code: "ACCESS_ACCOUNT_REQUIRED", message: "Access Portal session expired" };
  }
  const supabase = getSupabase();
  const { data: account } = await supabase
    .from("accounts")
    .select("id,role,status,permission_mode,agency_id")
    .eq("id", payload.sub || "")
    .single();
  if (!account || account.status !== "ACTIVE" || account.role !== "USER") {
    throw { statusCode: 403, code: "ACCESS_ACCOUNT_REQUIRED", message: "An active access-portal account with booking permission is required" };
  }
  if (account.permission_mode === "MANAGED") {
    const { data: permission } = await supabase.from("account_permissions")
      .select("allowed").eq("account_id", account.id).eq("permission_key", permissionKey).single();
    if (permission?.allowed !== true) {
      throw { statusCode: 403, message: `${permissionKey} permission is required` };
    }
  }
  return { supabase, account };
}

async function getBookingCreditCost(supabase: ReturnType<typeof getSupabase>, agencyId?: string | null): Promise<number> {
  if (agencyId) {
    const { data: agencySettings, error: agencyError } = await supabase
      .from("agency_billing_settings")
      .select("booking_credit_cost")
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (agencyError) throw { statusCode: 500, message: "Could not load agency booking credit cost", details: agencyError.message };
    if (agencySettings) {
      const agencyAmount = Number(agencySettings.booking_credit_cost);
      if (!Number.isFinite(agencyAmount) || agencyAmount < 0) {
        throw { statusCode: 500, message: "Invalid agency booking credit cost configuration" };
      }
      return agencyAmount;
    }
  }
  const { data, error } = await supabase
    .from("access_billing_settings")
    .select("booking_credit_cost")
    .eq("singleton", true)
    .single();
  if (error) throw { statusCode: 500, message: "Could not load booking credit cost", details: error.message };
  const amount = Number(data?.booking_credit_cost);
  if (!Number.isFinite(amount) || amount < 0) {
    throw { statusCode: 500, message: "Invalid booking credit cost configuration" };
  }
  return amount;
}

function findReservationId(value: any): string {
  const direct = value?.exam_reservation?.id || value?.reservation?.id || value?.data?.exam_reservation?.id || value?.data?.reservation?.id;
  if (direct !== undefined && direct !== null && direct !== "") return String(direct);
  const queue = [value];
  const seen = new Set<any>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    for (const key of ["reservation_id", "exam_reservation_id", "reservationId"]) {
      if (current[key] !== undefined && current[key] !== null && current[key] !== "") return String(current[key]);
    }
    if (current.id !== undefined && current.id !== null && /reservation/i.test(String(current.type || current.resource || ""))) return String(current.id);
    queue.push(...Object.values(current));
  }
  return "";
}

let t2hubSession:
  | { keyRaw: string; cookie: string; appPath: string; expiresAt: number }
  | null = null;

async function svpFetch(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const url = `${SVP_BASE}${path}${path.includes("?") ? "&" : "?"}locale=${SVP_LOCALE}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Origin: SVP_ORIGIN,
    Referer: `${SVP_ORIGIN}/`,
    "User-Agent": SVP_UA,
  };
  if (opts.body) headers["Content-Type"] = "application/json;charset=UTF-8";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw normalizeSvpError(res.status, data);
  }
  return data;
}

async function svpFetchRaw(
  path: string,
  token: string
) {
  const url = `${SVP_BASE}${path}${path.includes("?") ? "&" : "?"}locale=${SVP_LOCALE}`;
  return fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${token}`,
      Origin: SVP_ORIGIN,
      Referer: `${SVP_ORIGIN}/`,
      "User-Agent": SVP_UA,
    },
  });
}

function extractT2HubCookie(headers: Headers): string {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = anyHeaders.getSetCookie?.() || [];
  const raw = setCookies.length ? setCookies : [headers.get("set-cookie") || ""];
  return raw
    .flatMap((item) => item.split(/,(?=\s*[^;,]+=)/))
    .map((item) => item.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function extractT2HubKey(html: string): string {
  return html.match(/window\.__sk\s*=\s*['"]([^'"]+)['"]/)?.[1] || "";
}

function extractT2HubCsrf(html: string): string {
  return html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/)?.[1] || "";
}

async function fetchT2HubSessionPage(appPath: string) {
  const res = await fetch(`${T2HUB_BASE}${appPath}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": SVP_UA,
    },
  });
  const html = await res.text();
  return { res, html, keyRaw: extractT2HubKey(html) };
}

async function getT2HubSession() {
  if (t2hubSession && t2hubSession.expiresAt > Date.now()) return t2hubSession;

  const appPaths = [T2HUB_APP_PATH, `${T2HUB_APP_PATH}/`, `${T2HUB_APP_PATH}/agent/login`];
  let lastStatus = 0;
  for (const appPath of appPaths) {
    const { res, html, keyRaw } = await fetchT2HubSessionPage(appPath);
    lastStatus = res.status;
    if (!res.ok || !keyRaw) continue;

    t2hubSession = {
      keyRaw,
      csrfToken: extractT2HubCsrf(html),
      cookie: extractT2HubCookie(res.headers),
      appPath,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    return t2hubSession;
  }

  throw {
    statusCode: 502,
    message: "Failed to initialize t2hub session",
    details: { status: lastStatus || undefined },
  };
}

async function decryptT2HubEnvelope(envelope: any, keyRaw: string) {
  if (!envelope?.p || !envelope?.iv) return envelope;
  const keyBytes = Uint8Array.from(atob(keyRaw), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
  const iv = Uint8Array.from(atob(envelope.iv), (c) => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(envelope.p), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function fetchT2HubJson(path: string, session: NonNullable<typeof t2hubSession>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${T2HUB_BASE}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, */*",
        Referer: `${T2HUB_BASE}${session.appPath}`,
        "User-Agent": SVP_UA,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw { statusCode: res.status, message: `t2hub request failed: ${res.status}`, details: data };
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchT2HubJsonPost(path: string, body: unknown, session: NonNullable<typeof t2hubSession>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${T2HUB_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json, */*",
        "Content-Type": "application/json",
        Referer: `${T2HUB_BASE}${session.appPath}`,
        "User-Agent": SVP_UA,
        // Confirmed from live traffic: this endpoint is Laravel-CSRF-protected —
        // POSTing without a matching X-CSRF-TOKEN (bound to the session cookie)
        // fails with 419. GET endpoints don't need this.
        ...(session.csrfToken ? { "X-CSRF-TOKEN": session.csrfToken } : {}),
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      throw { statusCode: res.status, message: `t2hub request failed: ${res.status}`, details: data };
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function t2hubFetch(path: string) {
  const session = await getT2HubSession();
  const data = await fetchT2HubJson(path, session);

  try {
    return await decryptT2HubEnvelope(data, session.keyRaw);
  } catch {
    t2hubSession = null;
    const fresh = await getT2HubSession();
    const freshData = await fetchT2HubJson(path, fresh);
    return await decryptT2HubEnvelope(freshData, fresh.keyRaw);
  }
}

async function t2hubPost(path: string, body: unknown) {
  const session = await getT2HubSession();
  const data = await fetchT2HubJsonPost(path, body, session);

  try {
    return await decryptT2HubEnvelope(data, session.keyRaw);
  } catch {
    t2hubSession = null;
    const fresh = await getT2HubSession();
    const freshData = await fetchT2HubJsonPost(path, body, fresh);
    return await decryptT2HubEnvelope(freshData, fresh.keyRaw);
  }
}

function t2hubQuery(path: string, params: URLSearchParams) {
  const queryString = params.toString();
  return `${T2HUB_APP_PATH}/api${path}${queryString ? `?${queryString}` : ""}`;
}

function normalizeT2HubSession(item: any, centerByName: Map<string, any>) {
  const centerName = String(item?.center_name || item?.test_center_name || "").trim();
  const center = centerByName.get(centerName.toLowerCase());
  const siteId = String(center?.id || center?.center || item?.site_id || item?.test_center_id || "");
  const encryptedId = String(item?.encrypted_session_id || item?.id || item?.exam_session_id || "");
  return {
    ...item,
    id: encryptedId || String(item?.session_id || ""),
    exam_session_id: encryptedId || String(item?.session_id || ""),
    numeric_session_id: item?.session_id ?? null,
    site_id: siteId || undefined,
    site_city: item?.center_city || center?.raw_city || center?.division || "",
    test_center: {
      ...(item?.test_center || {}),
      ...(siteId ? { id: siteId, site_id: siteId, test_center_id: siteId } : {}),
      ...(centerName ? { name: centerName, test_center_name: centerName } : {}),
      test_center_city: item?.center_city || center?.raw_city || center?.division || "",
      city: item?.center_city || center?.raw_city || center?.division || "",
    },
  };
}

// ── Crypto ──────────────────────────────────────────────────────────
async function getEncKey(): Promise<Uint8Array> {
  const raw = Deno.env.get("SESSION_ENC_KEY_BASE64") || "";
  if (raw) {
    try {
      const decoded = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      if (decoded.length === 32) return decoded;
    } catch { /* fall through */ }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return new Uint8Array(hash);
  }
  const fallback = Deno.env.get("JWT_REFRESH_SECRET") || "dev";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fallback));
  return new Uint8Array(hash);
}

async function decryptString(b64: string): Promise<string> {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = buf.slice(0, 12);
  const data = buf.slice(12);
  const key = await crypto.subtle.importKey("raw", await getEncKey(), "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ── JWT verify ──────────────────────────────────────────────────────
async function verifyJwt(token: string): Promise<Record<string, unknown>> {
  const secret = Deno.env.get("JWT_ACCESS_SECRET")!;
  const parts = token.split(".");
  if (parts.length !== 3) throw { statusCode: 401, message: "Invalid token" };

  const keyData = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const input = `${parts[0]}.${parts[1]}`;

  const sigB64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
  const padded = sigB64 + "=".repeat((4 - (sigB64.length % 4)) % 4);
  const sig = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  const valid = await crypto.subtle.verify("HMAC", cryptoKey, sig, new TextEncoder().encode(input));
  if (!valid) throw { statusCode: 401, message: "Invalid signature" };

  const claimsB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const claimsPadded = claimsB64 + "=".repeat((4 - (claimsB64.length % 4)) % 4);
  const claims = JSON.parse(atob(claimsPadded));

  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    throw { statusCode: 401, message: "Token expired" };
  }

  return claims;
}

// ── Auth middleware ─────────────────────────────────────────────────
async function requireAuth(req: Request): Promise<{ user: Record<string, unknown>; svpToken: string }> {
  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) throw { statusCode: 401, code: "CANDIDATE_ACCOUNT_REQUIRED", message: "An active candidate SVP session is required" };

  let user: Record<string, unknown>;
  try {
    user = await verifyJwt(token);
  } catch {
    throw { statusCode: 401, code: "CANDIDATE_ACCOUNT_REQUIRED", message: "Candidate SVP session expired" };
  }
  const sessionId = user.sid as string;
  if (!sessionId) throw { statusCode: 401, code: "CANDIDATE_ACCOUNT_REQUIRED", message: "Candidate SVP session is invalid" };

  const supabase = getSupabase();
  const { data: session } = await supabase.from("svp_sessions").select("*").eq("id", sessionId).single();
  if (!session || session.revoked_at || (session.refresh_expires_at && new Date(session.refresh_expires_at).getTime() <= Date.now())) {
    throw { statusCode: 401, code: "CANDIDATE_ACCOUNT_REQUIRED", message: "Candidate SVP session is inactive or expired" };
  }
  if (!session.svp_access_enc) throw { statusCode: 401, code: "CANDIDATE_ACCOUNT_REQUIRED", message: "Candidate SVP token is unavailable" };

  const svpToken = await decryptString(session.svp_access_enc);
  return { user, svpToken };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// ── Route definitions ───────────────────────────────────────────────
interface RouteEntry {
  method: string;
  pattern: RegExp;
  svpPath: string | ((match: RegExpMatchArray, query: string) => string);
  bodyForward?: boolean;
}

const routes: RouteEntry[] = [
  { method: "GET", pattern: /^\/permissions$/, svpPath: "/api/v1/individual_labor_space/permissions" },
  { method: "GET", pattern: /^\/occupations$/, svpPath: "/api/v1/individual_labor_space/occupations" },
  { method: "GET", pattern: /^\/exam-constraints$/, svpPath: "/api/v1/individual_labor_space/exam_constraints" },
  // exam-sessions list is handled as a custom route below (to enrich with available_seats)
  { method: "GET", pattern: /^\/exam-session\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_sessions/${m[1]}` },
  { method: "GET", pattern: /^\/exam-sessions\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_sessions/${m[1]}` },
  { method: "GET", pattern: /^\/exam-reservations$/, svpPath: "/api/v1/individual_labor_space/exam_reservations" },
  { method: "GET", pattern: /^\/exam-reservations\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}` },
  { method: "POST", pattern: /^\/temporary-seats$/, svpPath: "/api/v1/individual_labor_space/temporary_seats", bodyForward: true },
  { method: "POST", pattern: /^\/exam-reservations$/, svpPath: "/api/v1/individual_labor_space/exam_reservations", bodyForward: true },
  { method: "POST", pattern: /^\/reservation-credits\/use$/, svpPath: "/api/v1/individual_labor_space/reservation_credits/use", bodyForward: true },
  { method: "GET", pattern: /^\/certificate-price$/, svpPath: "/api/v1/individual_labor_space/certificate_price" },
  { method: "GET", pattern: /^\/payments-validate-pending$/, svpPath: "/api/v1/individual_labor_space/payments/validate_pending" },
  { method: "GET", pattern: /^\/payments$/, svpPath: "/api/v1/individual_labor_space/payments" },
  { method: "POST", pattern: /^\/payments$/, svpPath: "/api/v1/individual_labor_space/payments", bodyForward: true },
  { method: "GET", pattern: /^\/payments\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/payments/${m[1]}` },
  { method: "PUT", pattern: /^\/payments\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/payments/${m[1]}`, bodyForward: true },
  { method: "GET", pattern: /^\/feature-flags$/, svpPath: "/api/v1/individual_labor_space/feature_flags" },
  { method: "GET", pattern: /^\/notifications$/, svpPath: "/api/v1/individual_labor_space/notifications" },
  { method: "GET", pattern: /^\/user-balance\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/user_balance/${m[1]}` },
  { method: "DELETE", pattern: /^\/exam-reservations\/([^/]+)$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}` },
  { method: "POST", pattern: /^\/exam-reservations\/([^/]+)\/reschedule$/, svpPath: (m) => `/api/v1/individual_labor_space/exam_reservations/${m[1]}/reschedule`, bodyForward: true },
];

function buildPath(basePath: string, queryString: string): string {
  const params = new URLSearchParams(queryString);
  params.delete("locale");
  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

const SVP_COUNTRY_ID = "78";

function normalizeCityName(value: unknown): string {
  return String(value || "").trim();
}

function normalizeTestCenter(center: any) {
  const id = center?.test_center_id ?? center?.id ?? center?.site_id ?? center?.site?.id ?? "";
  const name = center?.test_center_name || center?.name || center?.site?.name || "";
  const city = normalizeCityName(
    center?.city || center?.test_center_city || center?.address?.locality || center?.address?.city
  );
  return {
    ...center,
    id: id === "" ? "" : String(id),
    test_center_id: id === "" ? "" : String(id),
    name: String(name || "").trim(),
    test_center_name: String(name || "").trim(),
    city,
    test_center_city: city,
  };
}

function extractTestCenters(payload: any): any[] {
  const values = payload?.test_centers || payload?.centers || payload?.data?.test_centers || payload?.data?.centers || payload?.data;
  return Array.isArray(values) ? values : [];
}

function extractCities(payload: any): string[] {
  const values = payload?.cities || payload?.data?.cities || payload?.data || [];
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item: any) => normalizeCityName(
    typeof item === "string" ? item : item?.city || item?.name || item?.english_name
  )).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function extractSessions(payload: any): any[] {
  const values = payload?.exam_sessions || payload?.sessions || payload?.data?.exam_sessions || payload?.data?.sessions || payload?.data;
  return Array.isArray(values) ? values : [];
}

function enrichSessionsForCenter(sessions: any[], center: any, testCenterId: string, city: string) {
  const normalizedCenter = normalizeTestCenter(center || { id: testCenterId, city });
  return sessions.map((session: any) => ({
    ...session,
    site_id: normalizedCenter.test_center_id || testCenterId,
    test_center_id: normalizedCenter.test_center_id || testCenterId,
    test_center_name: normalizedCenter.test_center_name || session?.test_center_name || "",
    site_city: normalizedCenter.city || session?.site_city || city,
    test_center: {
      ...(session?.test_center || {}),
      id: normalizedCenter.id || session?.test_center?.id || testCenterId,
      test_center_id: normalizedCenter.test_center_id || session?.test_center?.test_center_id || testCenterId,
      name: normalizedCenter.name || session?.test_center?.name || session?.test_center?.test_center_name || "",
      test_center_name: normalizedCenter.test_center_name || session?.test_center?.test_center_name || session?.test_center?.name || "",
      city: normalizedCenter.city || session?.test_center?.city || session?.test_center?.test_center_city || city,
      test_center_city: normalizedCenter.city || session?.test_center?.test_center_city || session?.test_center?.city || city,
    },
  }));
}

function rawSessionMatchesCenter(session: any, testCenterId: string): boolean {
  const sessionCenterId = session?.test_center_id ?? session?.test_center?.test_center_id ??
    session?.test_center?.id ?? session?.site_id ?? session?.site?.id;
  return sessionCenterId == null || String(sessionCenterId) === String(testCenterId);
}

async function fetchOfficialCenterSessions(
  categoryId: string,
  city: string,
  examDate: string,
  testCenterId: string,
  token: string,
): Promise<any[]> {
  const params = new URLSearchParams({
    category_id: categoryId,
    city,
    exam_date: examDate,
    test_center_id: testCenterId,
    country_id: SVP_COUNTRY_ID,
    available_seats: "greater_than::0",
    status: "scheduled",
    per_page: "10000",
  });
  const payload = await svpFetch(
    buildPath("/api/v1/individual_labor_space/exam_sessions", params.toString()),
    { method: "GET", token },
  );
  return extractSessions(payload).filter((session: any) => rawSessionMatchesCenter(session, testCenterId));
}

// ── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/svp-proxy/, "");
  const query = url.search.replace(/^\?/, "");

  try {
    const { user, svpToken } = await requireAuth(req);

    // ── Available dates (with fallbacks) ──────────────────────
    if (req.method === "GET" && path === "/available-dates") {
      const paths = [
        "/api/v1/individual_labor_space/exam_sessions/available_dates",
        "/api/v1/individual_labor_space/available_dates",
        "/api/v1/individual_labor_space/available-dates",
      ];
      const params = new URLSearchParams(query);
      params.delete("locale");
      params.set("country_id", params.get("country_id") || SVP_COUNTRY_ID);
      params.set("per_page", params.get("per_page") || "10000");
      for (let i = 0; i < paths.length; i++) {
        try {
          const data = await svpFetch(buildPath(paths[i], params.toString()), { method: "GET", token: svpToken });
          return json(data);
        } catch (err: any) {
          if (err?.statusCode !== 404) throw err;
        }
      }

      // The official SVP date routes are not consistently available. Use the
      // corresponding t2hub calendar endpoint when all of them return 404.
      return json(await t2hubFetch(t2hubQuery("/exam-available-dates", params)));
    }

    // Keep the existing `/occupations` client contract, while using t2hub's
    // PACC list when the equivalent SVP route has been removed upstream.
    if (req.method === "GET" && path === "/occupations") {
      try {
        return json(await svpFetch(
          buildPath("/api/v1/individual_labor_space/occupations", query),
          { method: "GET", token: svpToken },
        ));
      } catch (err: any) {
        if (err?.statusCode !== 404) throw err;
        const params = new URLSearchParams(query);
        params.delete("locale");
        return json(await t2hubFetch(t2hubQuery("/pacc/occupations", params)));
      }
    }

    // ── Live SVP cities and test centers ─────────────────────
    if (req.method === "GET" && path === "/cities") {
      const params = new URLSearchParams(query);
      params.delete("locale");
      params.set("country_id", params.get("country_id") || SVP_COUNTRY_ID);
      params.set("per_page", params.get("per_page") || "10000");
      const data = await svpFetch(buildPath("/api/v1/individual_labor_space/test_centers/cities", params.toString()), {
        method: "GET",
        token: svpToken,
      });
      const cities = extractCities(data);
      return json({ cities, data: cities });
    }

    if (req.method === "GET" && path === "/test-centers") {
      const params = new URLSearchParams(query);
      params.delete("locale");
      // A test-centre roster is city/country scoped. Occupation/category
      // filtering belongs to exam-session availability, not centre discovery;
      // forwarding category_id here can incorrectly hide valid centres.
      params.delete("category_id");
      params.set("country_id", params.get("country_id") || SVP_COUNTRY_ID);
      params.set("per_page", params.get("per_page") || "10000");
      const requestedCity = normalizeCityName(params.get("city"));
      params.delete("city");
      const data = await svpFetch(buildPath("/api/v1/visitor_space/test_centers", params.toString()), {
        method: "GET",
        token: svpToken,
      });
      const centers = extractTestCenters(data)
        .map(normalizeTestCenter)
        .filter((center: any) => !requestedCity || String(center.city).toLowerCase() === requestedCity.toLowerCase())
        .filter((center: any) => center.test_center_id && center.test_center_name);
      return json({ test_centers: centers, centers, city: requestedCity });
    }

    // ── Date-scoped centre availability ───────────────────────
    // The SVP available-dates endpoint is city-level. This route deliberately
    // checks every real centre for the selected date so the UI never offers a
    // centre that has no scheduled session on that date.
    if (req.method === "GET" && path === "/center-session-availability") {
      const params = new URLSearchParams(query);
      const categoryId = params.get("category_id") || "";
      const requestedCity = normalizeCityName(params.get("city"));
      const examDate = params.get("exam_date") || params.get("test_date") || "";
      if (!categoryId || !requestedCity || !examDate) {
        throw { statusCode: 400, message: "Missing category_id, city, or exam_date" };
      }

      const centerPayload = await svpFetch(buildPath("/api/v1/visitor_space/test_centers", new URLSearchParams({
        category_id: categoryId,
        country_id: SVP_COUNTRY_ID,
        per_page: "10000",
      }).toString()), { method: "GET", token: svpToken });
      const centers = extractTestCenters(centerPayload)
        .map(normalizeTestCenter)
        .filter((center: any) => String(center.city).toLowerCase() === requestedCity.toLowerCase())
        .filter((center: any) => center.test_center_id && center.test_center_name);

      const availability = await Promise.all(centers.map(async (center: any) => {
        const siteId = String(center.test_center_id);
        try {
          const sessions = await fetchOfficialCenterSessions(categoryId, requestedCity, examDate, siteId, svpToken);
          return {
            ...center,
            session_count: sessions.length,
            lookup_status: "ok",
          };
        } catch {
          // An unverified centre is not offered for booking. Returning zero
          // keeps the UI safe instead of guessing that the city has a session.
          return {
            ...center,
            session_count: 0,
            lookup_status: "error",
          };
        }
      }));

      return json({
        city: requestedCity,
        category_id: categoryId,
        exam_date: examDate,
        centers: availability,
        available_centers: availability.filter((center: any) => center.session_count > 0 && center.lookup_status === "ok"),
      });
    }

    // ── t2hub city test centers ──────────────────────────────
    if (req.method === "GET" && path === "/t2hub/test-centers") {
      const params = new URLSearchParams(query);
      params.delete("locale");
      // t2hub names this filter `division`, while the booking UI uses `city`.
      // Convert at the boundary so callers can consistently use `city`.
      const city = params.get("city") || params.get("division") || "";
      if (!city) throw { statusCode: 400, message: "Missing city or division" };
      params.delete("city");
      params.set("division", city);
      const data = await t2hubFetch(t2hubQuery("/test-centers", params));
      return json(data);
    }

    // These routes are intentionally proxied: t2hub responses are encrypted
    // (`x-encrypted: 1`) and browser callers are subject to cross-origin rules.
    if (req.method === "GET" && path === "/t2hub/occupations") {
      return json(await t2hubFetch(t2hubQuery("/pacc/occupations", new URLSearchParams(query))));
    }

    if (req.method === "GET" && path === "/t2hub/exam-available-dates") {
      return json(await t2hubFetch(t2hubQuery("/exam-available-dates", new URLSearchParams(query))));
    }

    if (req.method === "GET" && path === "/t2hub/exam-sessions-bulk") {
      return json(await t2hubFetch(t2hubQuery("/exam-sessions-bulk", new URLSearchParams(query))));
    }

    // ── t2hub bulk exam sessions (CSRF-protected POST) ─────────
    // Batches multiple {category_id, city, exam_date, center_token, center}
    // lookups into a single request — more efficient than repeated single-city
    // calls to /pacc-exam-sessions when checking several centers/dates at once.
    if (req.method === "POST" && path === "/t2hub/exam-sessions-bulk") {
      const body = await req.json().catch(() => ({}));
      const requests = body?.requests;
      if (!Array.isArray(requests) || !requests.length) {
        throw { statusCode: 400, message: "Missing requests array" };
      }
      const data = await t2hubPost(`${T2HUB_APP_PATH}/api/exam-sessions-bulk`, { requests });
      return json(data);
    }

    // ── t2hub city-wide PACC sessions ────────────────────────
    if (req.method === "GET" && path === "/t2hub/pacc-exam-sessions") {
      const params = new URLSearchParams(query);
      params.delete("locale");
      const city = params.get("city") || "";
      const categoryId = params.get("category_id") || "";
      const examDate = params.get("exam_date") || "";
      if (!city || !categoryId || !examDate) {
        throw { statusCode: 400, message: "Missing city, category_id, or exam_date" };
      }

      const [centersData, sessionsData] = await Promise.all([
        t2hubFetch(t2hubQuery("/test-centers", new URLSearchParams({ division: city }))),
        t2hubFetch(t2hubQuery("/exam-sessions-bulk", params)),
      ]);
      const centers: any[] = Array.isArray(centersData?.sites) ? centersData.sites : [];
      const centerByName = new Map(
        centers.map((center: any) => [String(center?.name || "").trim().toLowerCase(), center])
      );
      const sessions = (Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [])
        .map((item: any) => normalizeT2HubSession(item, centerByName));

      return json({ ...sessionsData, sessions, exam_sessions: sessions, sites: centers });
    }

    // ── Strict center-scoped live SVP exam sessions ───────────
    if (req.method === "GET" && path === "/exam-sessions") {
      const params = new URLSearchParams(query);
      const categoryId = params.get("category_id") || "";
      const city = normalizeCityName(params.get("city"));
      const examDate = params.get("exam_date") || params.get("test_date") || "";
      const testCenterId = params.get("test_center_id") || "";
      if (categoryId && city && examDate && testCenterId) {
        params.delete("locale");
        params.delete("test_date");
        params.set("exam_date", examDate);
        params.set("country_id", params.get("country_id") || SVP_COUNTRY_ID);
        params.set("available_seats", "greater_than::0");

        const [sessionPayload, centerPayload] = await Promise.all([
          svpFetch(buildPath("/api/v1/individual_labor_space/exam_sessions", params.toString()), {
            method: "GET",
            token: svpToken,
          }),
          svpFetch(buildPath("/api/v1/visitor_space/test_centers", new URLSearchParams({
            category_id: categoryId,
            country_id: SVP_COUNTRY_ID,
            per_page: "10000",
          }).toString()), { method: "GET", token: svpToken }),
        ]);

        const centers = extractTestCenters(centerPayload).map(normalizeTestCenter);
        const selectedCenter = centers.find((center: any) =>
          String(center.test_center_id) === String(testCenterId) &&
          (!center.city || center.city.toLowerCase() === city.toLowerCase())
        );
        const rawSessions = extractSessions(sessionPayload);
        const sessions = rawSessions
          .filter((session: any) => {
            const sessionCenterId = session?.test_center_id ?? session?.test_center?.test_center_id ?? session?.test_center?.id ?? session?.site_id;
            return sessionCenterId == null || String(sessionCenterId) === String(testCenterId);
          })
          .map((session: any) => enrichSessionsForCenter(rawSessions.length ? [session] : [], selectedCenter, testCenterId, city)[0]);

        return json({
          ...((sessionPayload && typeof sessionPayload === "object" && !Array.isArray(sessionPayload)) ? sessionPayload : {}),
          exam_sessions: sessions,
          sessions,
          test_center: selectedCenter || null,
          test_center_id: String(testCenterId),
          test_center_name: selectedCenter?.test_center_name || "",
          city,
          exam_date: examDate,
        });
      }
    }

    // ── Exam sessions (enriched with available_seats) ────────
    if (req.method === "GET" && path === "/exam-sessions") {
      const sessionParams = new URLSearchParams(query);
      const city = sessionParams.get("city") || "";
      const categoryId = sessionParams.get("category_id") || "";
      const examDate = sessionParams.get("exam_date") || "";
      if (city && categoryId && examDate) {
        try {
          sessionParams.delete("locale");
          const [centersData, sessionsData] = await Promise.all([
            t2hubFetch(t2hubQuery("/test-centers", new URLSearchParams({ division: city }))),
            t2hubFetch(t2hubQuery("/exam-sessions-bulk", sessionParams)),
          ]);
          const centers: any[] = Array.isArray(centersData?.sites) ? centersData.sites : [];
          const centerByName = new Map(
            centers.map((center: any) => [String(center?.name || "").trim().toLowerCase(), center])
          );
          const sessions = (Array.isArray(sessionsData?.sessions) ? sessionsData.sessions : [])
            .map((item: any) => normalizeT2HubSession(item, centerByName));
          return json({ ...sessionsData, sessions, exam_sessions: sessions, sites: centers });
        } catch {
          // Fall back to the official SVP endpoint below if t2hub is unavailable.
        }
      }

      const listData: any = await svpFetch(
        buildPath("/api/v1/individual_labor_space/exam_sessions", query),
        { method: "GET", token: svpToken }
      );
      const sessions: any[] = listData?.exam_sessions || [];

      // If list doesn't include available_seats, fetch each detail in parallel
      if (sessions.length > 0 && sessions[0]?.available_seats === undefined) {
        const enriched = await Promise.all(
          sessions.map(async (s: any) => {
            try {
              const detail: any = await svpFetch(
                `/api/v1/individual_labor_space/exam_sessions/${s.id}`,
                { method: "GET", token: svpToken }
              );
              const d = detail?.exam_session || detail;
              return {
                ...s,
                available_seats: d?.available_seats ?? d?.seats_available ?? null,
                total_seats: d?.total_seats ?? d?.seats_total ?? null,
              };
            } catch {
              return s;
            }
          })
        );
        listData.exam_sessions = enriched;
      }

      return json(listData);
    }

    // ── User balance (auto-detect SVP user ID) ───────────────
    if (req.method === "GET" && path === "/user-balance") {
      const supabase = getSupabase();
      const { data: session } = await supabase
        .from("svp_sessions")
        .select("*, svp_users(*)")
        .eq("id", user.sid as string)
        .single();

      const svpUser = (session as any)?.svp_users;
      const tokenPayload = decodeJwtPayload(svpToken);
      const svpUserId = Number(
        svpUser?.svp_user_id || tokenPayload?.user_id || tokenPayload?.userId || tokenPayload?.uid || 0
      );
      if (!svpUserId) throw { statusCode: 400, message: "Missing svpUserId" };

      try {
        return json(await svpFetch(buildPath(`/api/v1/users/${svpUserId}/balance`, query), { method: "GET", token: svpToken }));
      } catch (err: any) {
        if (err?.statusCode === 404) {
          return json(await svpFetch(buildPath(`/api/v1/individual_labor_space/user_balance/${svpUserId}`, query), { method: "GET", token: svpToken }));
        }
        throw err;
      }
    }

    // ── Ticket PDF ────────────────────────────────────────────
    const pdfMatch = path.match(/^\/tickets\/([^/]+)\/show-pdf$/);
    if (req.method === "GET" && pdfMatch) {
      await requireAccessPermission(req, "reservation.manage");
      const upstream = await svpFetchRaw(
        buildPath(`/api/v1/individual_labor_space/tickets/${pdfMatch[1]}/show_pdf`, query),
        svpToken
      );
      if (!upstream.ok) {
        const text = await upstream.text();
        let details;
        try { details = JSON.parse(text); } catch { details = { raw: text }; }
        throw { statusCode: upstream.status, message: `SVP request failed: ${upstream.status}`, details };
      }
      const contentType = upstream.headers.get("content-type") || "application/pdf";
      const disposition = upstream.headers.get("content-disposition");
      const headers: Record<string, string> = { ...corsHeaders, "Content-Type": contentType };
      if (disposition) headers["Content-Disposition"] = disposition;
      return new Response(await upstream.arrayBuffer(), { status: 200, headers });
    }

    // ── Center-bound temporary seat hold ─────────────────────
    if (req.method === "POST" && path === "/temporary-seats") {
      const body = await req.json().catch(() => ({}));
      const examSessionId = body?.exam_session_id;
      const testCenterId = body?.test_center_id;
      if (examSessionId === undefined || examSessionId === null || examSessionId === "") {
        throw { statusCode: 400, message: "Missing exam_session_id" };
      }
      if (testCenterId === undefined || testCenterId === null || testCenterId === "") {
        throw { statusCode: 400, message: "Missing test_center_id" };
      }
      const data = await svpFetch("/api/v1/individual_labor_space/temporary_seats", {
        method: "POST",
        token: svpToken,
        body: {
          exam_session_id: examSessionId,
          test_center_id: testCenterId,
        },
      });
      return json(data);
    }

    // ── Standard routes ──────────────────────────────────────
    for (const route of routes) {
      if (req.method !== route.method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      const svpPath = typeof route.svpPath === "function" ? route.svpPath(match, query) : route.svpPath;
      const body = route.bodyForward ? await req.json().catch(() => ({})) : undefined;

      const billingOperation = getReservationBillingOperation(req.method, path);
      const isBookingCreate = billingOperation === "booking";
      const isBookingReschedule = billingOperation === "reschedule";
      const isChargeableBooking = billingOperation !== null;
      const isBookingPreparation = req.method === "POST" && (path === "/temporary-seats" || path === "/reservation-credits/use");
      const isPaymentCreate = req.method === "POST" && path === "/payments";
      const isReservationManagement =
        (req.method === "GET" && /^\/exam-reservations(?:\/[^/]+)?$/.test(path)) ||
        (req.method === "DELETE" && /^\/exam-reservations\/[^/]+$/.test(path)) ||
        isBookingReschedule;
      let accessContext: Awaited<ReturnType<typeof requireAccessPermission>> | null = null;
      let walletHoldId = "";
      let bookingCreditCost = 0;

      if (isReservationManagement) {
        accessContext = await requireAccessPermission(req, "reservation.manage");
      } else if (isBookingCreate || isBookingPreparation) {
        accessContext = await requireAccessPermission(req, "booking.create");
      } else if (isPaymentCreate) {
        accessContext = await requireAccessPermission(req, "payment.create");
      }

      if (isChargeableBooking && accessContext?.account.permission_mode === "MANAGED") {
        bookingCreditCost = await getBookingCreditCost(accessContext.supabase, accessContext.account.agency_id);
        if (bookingCreditCost > 0) {
          const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
          const { data: holdId, error: holdError } = await accessContext.supabase.rpc("wallet_place_booking_hold", {
            p_account_id: accessContext.account.id,
            p_amount: bookingCreditCost,
            p_idempotency_key: `${billingOperation}-request:${accessContext.account.id}:${requestId}`,
          });
          if (holdError) throw { statusCode: 402, message: holdError.message || "Insufficient wallet balance" };
          walletHoldId = String(holdId || "");
        }
      }

      try {
        const reservationLookupId = route.method === "GET" && /^\/exam-reservations(?:\/[^/]+)?$/.test(path)
          ? getReservationLookupId(path, query)
          : "";
        let data: any;
        if (route.method === "GET" && /^\/exam-reservations(?:\/[^/]+)?$/.test(path) && reservationLookupId) {
          const collectionPayload = await svpFetch(
            buildPath(svpPath, buildReservationCollectionQuery(query)),
            { method: route.method, token: svpToken },
          );
          const matchingRows = filterReservationRows(collectionPayload, reservationLookupId);
          if (!matchingRows.length) {
            throw {
              statusCode: 404,
              message: "Reservation not found",
              details: { reservation_id: reservationLookupId },
            };
          }
          data = reshapeReservationPayload(collectionPayload, matchingRows);
        } else {
          data = await svpFetch(buildPath(svpPath, query), {
            method: route.method,
            token: svpToken,
            body,
          });
        }
        if (isChargeableBooking && accessContext?.account.permission_mode === "MANAGED") {
          const reservationId = findReservationId(data) ||
            (isBookingReschedule ? String(match[1]) : `svp-success:${req.headers.get("x-request-id") || walletHoldId}`);
          let walletTransaction: any = null;
          if (walletHoldId) {
            const { data: completedTransaction, error: completeError } = await accessContext.supabase.rpc("wallet_complete_booking_hold", {
              p_hold_id: walletHoldId,
              p_reservation_id: reservationId,
              p_metadata: {
                source: "svp-proxy",
                operation: billingOperation,
                svp_success: true,
                configured_credit_cost: bookingCreditCost,
              },
            });
            if (completeError) {
              throw { statusCode: 500, message: "Reservation completed but wallet finalization failed", details: { reservationId, reason: completeError.message } };
            }
            walletTransaction = completedTransaction;
          }
          if (data && typeof data === "object" && !Array.isArray(data)) {
            return json({ ...data, access_wallet: { charged: bookingCreditCost, balance_after: walletTransaction?.balance_after, transaction_id: walletTransaction?.id } });
          }
        }
        return json(data);
      } catch (error) {
        if (walletHoldId && accessContext) {
          await accessContext.supabase.rpc("wallet_release_booking_hold", { p_hold_id: walletHoldId });
        }
        throw error;
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err: any) {
    const status = Number(err?.statusCode || 500);
    return json({ error: { code: err?.code || (status === 401 ? "AUTH_REQUIRED" : "SVP_PROXY_ERROR"), message: err?.message || "Server error", request_id: req.headers.get("x-request-id") || null } }, status);
  }
});
