import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { MonitorPlay, LogIn, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import { getTakamolBaseUrl } from "@/lib/takamol-api";

export default function TakamolLoginPage() {
  const { loggedIn, loading, error, login, profile, refresh } = useTakamolAuth();
  const navigate = useNavigate();

  // Once the Playwright login completes, move to the dashboard.
  useEffect(() => {
    if (loggedIn) navigate("/takamol/dashboard", { replace: true });
  }, [loggedIn, navigate]);

  const baseUrl = getTakamolBaseUrl();

  return (
    <div className="tk-hero">
      <div className="tk-card-header">
        <div>
          <h1>Takamol Login</h1>
          <p className="tk-muted">
            The backend drives a real browser (Playwright). Start the login, then finish it inside the
            noVNC console — credentials are typed there, never in this app.
          </p>
        </div>
        <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
          {loggedIn ? <CheckCircle2 size={13} /> : <span className="tk-dot tk-dot--off" />}
          {loggedIn ? "Logged in" : "Not logged in"}
        </span>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}
      {loggedIn && profile && (
        <div className="tk-msg tk-msg--ok">
          Signed in as <strong>{profile.name || profile.login || profile.email || "User"}</strong>.
        </div>
      )}

      <div className="tk-grid tk-grid-3">
        <div className="tk-card">
          <h3>Step 1 — Start the session</h3>
          <p className="tk-muted" style={{ fontSize: "0.88rem", marginTop: 0 }}>
            Triggers <code>POST /api/auth/login</code> on the live backend. This spins up a headless
            Playwright browser and returns once the session is ready.
          </p>
          <button type="button" className="tk-btn tk-btn--gold" onClick={() => login()} disabled={loading || loggedIn}>
            {loading ? <Loader2 size={16} className="tk-spinner" style={{ width: 14, height: 14 }} /> : <LogIn size={16} />}
            {loading ? "Starting login…" : "Start Login"}
          </button>
        </div>

        <div className="tk-card">
          <h3>Step 2 — Complete login in noVNC</h3>
          <p className="tk-muted" style={{ fontSize: "0.88rem", marginTop: 0 }}>
            Open the console (new tab) and enter your portal credentials directly in the virtual screen.
          </p>
          <a className="tk-btn tk-btn--teal" href={baseUrl} target="_blank" rel="noopener noreferrer">
            <MonitorPlay size={16} />
            Open noVNC Console
            <ExternalLink size={13} />
          </a>
        </div>

        <div className="tk-card">
          <h3>Step 3 — Verify</h3>
          <p className="tk-muted" style={{ fontSize: "0.88rem", marginTop: 0 }}>
            This page polls <code>GET /api/auth/status</code> every 8 seconds and auto-redirects once
            <code> loggedIn = true</code>. You can also refresh manually.
          </p>
          <button type="button" className="tk-btn" onClick={() => refresh()}>
            Refresh status
          </button>
        </div>
      </div>

      <div className="tk-card" style={{ marginTop: 4 }}>
        <div className="tk-row" style={{ marginBottom: 0 }}>
          <div className="tk-row-main">
            <div className="tk-row-title">Backend health</div>
            <div className="tk-row-sub">
              {baseUrl} · <Link to="/takamol/dashboard" style={{ color: "var(--tk-gold)" }}>Go to dashboard</Link> when ready
            </div>
          </div>
          <span className="tk-badge tk-badge--info">Live</span>
        </div>
      </div>
    </div>
  );
}
