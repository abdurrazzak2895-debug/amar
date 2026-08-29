import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapT2HubSession,
  clearLiveSession,
  getLiveSession,
  loadT2HubSession,
  persistT2HubSession,
  T2HUB_SESSION_MISSING_CODE,
} from "../../supabase/functions/svp-proxy/t2hub-session";

const SUPABASE_URL = "https://example.supabase.co";
const SERVICE_KEY = "service-role-key";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  clearLiveSession();
});

describe("t2hub-session — loadT2HubSession", () => {
  it("throws T2HUB_SESSION_MISSING when the row has no cookies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      jsonResponse([{ cookie: "", key_raw: "", csrf_token: null, app_path: "/takamol" }]),
    ));
    await expect(loadT2HubSession(SUPABASE_URL, SERVICE_KEY)).rejects.toMatchObject({
      statusCode: 503,
      code: T2HUB_SESSION_MISSING_CODE,
    });
  });

  it("throws T2HUB_SESSION_MISSING when no row exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    await expect(loadT2HubSession(SUPABASE_URL, SERVICE_KEY)).rejects.toMatchObject({
      statusCode: 503,
      code: T2HUB_SESSION_MISSING_CODE,
    });
  });

  it("loads and caches a valid session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([
          {
            cookie: "t2hsess=abc",
            key_raw: "AAAA",
            csrf_token: "csrf",
            app_path: "/takamol",
            bootstrapped_at: "2026-08-29T00:00:00Z",
            last_used_at: "2026-08-29T00:00:00Z",
          },
        ]),
      ),
    );
    const session = await loadT2HubSession(SUPABASE_URL, SERVICE_KEY);
    expect(session.cookie).toBe("t2hsess=abc");
    expect(session.keyRaw).toBe("AAAA");
    expect(getLiveSession()?.cookie).toBe("t2hsess=abc");
  });

  it("re-uses the in-memory cache on a second call", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        {
          cookie: "t2hsess=abc",
          key_raw: "AAAA",
          csrf_token: "csrf",
          app_path: "/takamol",
          bootstrapped_at: "2026-08-29T00:00:00Z",
          last_used_at: "2026-08-29T00:00:00Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    await loadT2HubSession(SUPABASE_URL, SERVICE_KEY);
    await loadT2HubSession(SUPABASE_URL, SERVICE_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("t2hub-session — persistT2HubSession", () => {
  it("issues a PATCH to the singleton row", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await persistT2HubSession(SUPABASE_URL, SERVICE_KEY, {
      cookie: "t2hsess=new",
      keyRaw: "BBBB",
      csrfToken: "csrf",
      appPath: "/takamol",
      bootstrappedAt: "2026-08-29T00:00:00Z",
      lastUsedAt: "2026-08-29T00:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = call[0];
    const init = call[1];
    expect(String(url)).toContain("/rest/v1/t2hub_sessions?singleton=eq.true");
    expect(init?.method).toBe("PATCH");
    expect((init?.headers as Record<string, string>)?.Authorization).toBe(`Bearer ${SERVICE_KEY}`);
    const body = JSON.parse(String(init?.body));
    expect(body.cookie).toBe("t2hsess=new");
    expect(body.key_raw).toBe("BBBB");
    expect(body.app_path).toBe("/takamol");
  });

  it("throws 500 when Postgres rejects the upsert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("db down", { status: 500 })));
    await expect(
      persistT2HubSession(SUPABASE_URL, SERVICE_KEY, {
        cookie: "x",
        keyRaw: "y",
        csrfToken: "z",
        appPath: "/takamol",
        bootstrappedAt: "2026-08-29T00:00:00Z",
        lastUsedAt: "2026-08-29T00:00:00Z",
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe("t2hub-session — bootstrapT2HubSession", () => {
  it("returns session material when t2hub serves a landing page with __sk", async () => {
    const html = `<html><head><meta name="csrf-token" content="csrf-from-meta"/></head><body><script>window.__sk="BASE64KEY";</script></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Set-Cookie": "t2hsess=landing; Path=/, XSRF-TOKEN=xxx; Path=/",
          },
        }),
      ),
    );
    const result = await bootstrapT2HubSession();
    expect(result.keyRaw).toBe("BASE64KEY");
    expect(result.csrfToken).toBe("csrf-from-meta");
    expect(result.cookie).toContain("t2hsess=landing");
    expect(result.appPath).toMatch(/^\/takamol/);
  });

  it("throws 502 when t2hub never returns a __sk key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>no key</html>", { status: 200 })),
    );
    await expect(bootstrapT2HubSession()).rejects.toMatchObject({ statusCode: 502 });
  });
});
