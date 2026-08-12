/**
 * takamol-proxy
 *
 * Passthrough proxy in front of the live Takamol Playwright-MCP backend
 * (`humorous-respect` on Railway, https://takamol-api.up.railway.app).
 *
 * The frontend used to call this backend directly through a Vercel
 * `vercel.json` rewrite (`/takamol-api/*`). That worked, but meant the
 * Railway URL was hardcoded into the frontend's build/deploy config and
 * every project (Vercel + Railway) had to stay in sync independently.
 *
 * Routing this through Supabase instead means:
 *  - The frontend only ever talks to Supabase (same as every other
 *    `access-*` / `svp-*` function), one less moving part to keep wired up
 *    correctly across Vercel + Railway + Supabase.
 *  - The upstream Railway URL becomes a single env var here
 *    (`TAKAMOL_API_URL`) instead of being duplicated in vercel.json.
 *  - CORS is handled here, matching the rest of the API surface, instead of
 *    relying on same-origin rewrites.
 *
 * This function does NOT reshape requests/responses — it forwards method,
 * path, query string, and JSON body as-is and relays the upstream response
 * body and status code back unchanged. The upstream backend already returns
 * the `{ success, data, error? }` envelope the frontend expects.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const TAKAMOL_API_URL =
  Deno.env.get("TAKAMOL_API_URL") || "https://takamol-api.up.railway.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Strip the Supabase function prefix so `/takamol-proxy/api/auth/status`
  // forwards to `${TAKAMOL_API_URL}/api/auth/status`.
  const path = url.pathname.replace(/^\/takamol-proxy/, "") || "/";
  const upstreamUrl = `${TAKAMOL_API_URL}${path}${url.search}`;

  let body: string | undefined;
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    body = await req.text();
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });

    const text = await upstreamRes.text();

    return new Response(text, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Failed to reach Takamol backend",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
