import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-access-token, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GATEWAY_URL = (Deno.env.get("PORTAL_AVAILABILITY_GATEWAY_URL") || "https://takamol-production.up.railway.app").replace(/\/+$/, "");
const GATEWAY_KEY = (Deno.env.get("PORTAL_AVAILABILITY_API_KEY") || "").trim();
const ACCESS_JWT_SECRET = Deno.env.get("JWT_ACCESS_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function error(statusCode: number, message: string, details?: unknown) {
  return json({ success: false, message, ...(details === undefined ? {} : { details }) }, statusCode);
}

function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw { statusCode: 422, message: `${field} must be a positive integer` };
  return number;
}

function isoDate(value: unknown, field: string): string {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw { statusCode: 422, message: `${field} must use YYYY-MM-DD format` };
  return date;
}

function requiredText(value: unknown, field: string, maxLength = 120): string {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) throw { statusCode: 422, message: `${field} is required` };
  return text;
}

function normalizeSearchDatesPayload(input: any) {
  return {
    category_id: positiveInteger(input?.category_id, "category_id"),
    start_from: isoDate(input?.start_from, "start_from"),
  };
}

function normalizeCentersPayload(input: any) {
  const languageCode = requiredText(input?.language_code, "language_code", 32);
  if (/^[a-z]{2,3}$/i.test(languageCode)) {
    throw { statusCode: 422, message: "language_code must be the Prometric code, not an ISO language code" };
  }
  return {
    category_id: positiveInteger(input?.category_id, "category_id"),
    city: requiredText(input?.city, "city"),
    date: isoDate(input?.date, "date"),
    occupation_id: positiveInteger(input?.occupation_id, "occupation_id"),
    language_code: languageCode,
  };
}

async function requireAccessPermission(req: Request, permissionKey: string) {
  if (!ACCESS_JWT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw { statusCode: 503, message: "Access authorization is not configured" };
  }

  const token = req.headers.get("x-access-token")?.trim();
  if (!token) throw { statusCode: 401, message: "Access Portal login is required" };

  let payload: { sub?: string };
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(ACCESS_JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    payload = await verify(token, key) as { sub?: string };
  } catch {
    throw { statusCode: 401, message: "Access Portal session expired" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,role,status,permission_mode")
    .eq("id", payload.sub || "")
    .single();
  if (accountError || !account || account.status !== "ACTIVE" || !["USER", "AGENCY", "ADMIN"].includes(account.role)) {
    throw { statusCode: 403, message: "An active Access Portal account is required" };
  }

  if (account.permission_mode === "MANAGED" && account.role !== "ADMIN") {
    const { data: permission } = await supabase
      .from("account_permissions")
      .select("allowed")
      .eq("account_id", account.id)
      .eq("permission_key", permissionKey)
      .single();
    if (permission?.allowed !== true) throw { statusCode: 403, message: `${permissionKey} permission is required` };
  }
}

async function gatewayRequest(path: string, method: "GET" | "POST", payload?: unknown) {
  if (!GATEWAY_KEY) throw { statusCode: 503, message: "PORTAL_AVAILABILITY_API_KEY is not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(`${GATEWAY_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "X-Portal-API-Key": GATEWAY_KEY,
        ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      redirect: "manual",
    });
    const text = await upstream.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!upstream.ok || data?.success !== true) {
      return { response: json(data || { success: false, message: "Portal gateway request failed" }, upstream.ok ? 502 : upstream.status) };
    }
    return { response: json(data, 200) };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/portal-availability-proxy/, "") || "/";

  try {
    await requireAccessPermission(req, "booking.create");

    if (req.method === "GET" && path === "/occupations") {
      return (await gatewayRequest("/api/external/portal-availability/v1/occupations", "GET")).response;
    }

    if (req.method === "POST" && path === "/search_dates") {
      const body = normalizeSearchDatesPayload(await req.json().catch(() => ({})));
      return (await gatewayRequest("/api/external/portal-availability/v1/search_dates", "POST", body)).response;
    }

    if (req.method === "POST" && path === "/centers") {
      const body = normalizeCentersPayload(await req.json().catch(() => ({})));
      return (await gatewayRequest("/api/external/portal-availability/v1/centers", "POST", body)).response;
    }

    return error(404, "Portal Availability route not found");
  } catch (err: any) {
    return error(Number(err?.statusCode) || 500, String(err?.message || "Portal Availability request failed"));
  }
});
