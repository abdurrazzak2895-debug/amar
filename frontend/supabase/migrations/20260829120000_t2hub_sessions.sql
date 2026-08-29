-- Shared t2hub.app session storage for the svp-proxy edge function.
--
-- t2hub.app is a stateful Laravel app. The proxy needs logged-in t2hub cookies
-- (and the AES-GCM key exposed in `window.__sk`) to call the read-only API
-- on behalf of all users. We keep one row of session material in Postgres
-- so the session survives cold starts and is shared by every booking caller.
--
-- The proxy writes to this table only via SUPABASE_SERVICE_ROLE_KEY (server
-- side). The anon role has no policy and no granted access.
--
-- The RLS auto-enable trigger will turn on RLS on this table automatically.

CREATE TABLE public.t2hub_sessions (
  singleton       boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  cookie          text NOT NULL DEFAULT '',
  key_raw         text NOT NULL DEFAULT '',
  csrf_token      text,
  app_path        text NOT NULL DEFAULT '/takamol',
  bootstrapped_at timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  notes           text
);

-- Only the service role (used by the edge function) can read or write.
CREATE POLICY "Service role full access on t2hub_sessions"
  ON public.t2hub_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Single-row seed. UPDATE in place from the proxy /t2hub/bootstrap endpoint.
INSERT INTO public.t2hub_sessions (singleton, cookie, key_raw, csrf_token)
VALUES (true, '', '', '')
ON CONFLICT (singleton) DO NOTHING;
