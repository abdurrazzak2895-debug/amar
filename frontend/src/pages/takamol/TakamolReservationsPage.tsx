import { useState } from "react";
import { Ticket, ListChecks, ExternalLink } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import { getReservation, getTicket, getTakamolBaseUrl } from "@/lib/takamol-api";

interface ApiCall {
  label: string;
  ok: boolean;
  body: string;
}

function pretty(data: any): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function TakamolReservationsPage() {
  const { loggedIn, refresh } = useTakamolAuth();
  const [passport, setPassport] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApiCall[]>([]);

  const baseUrl = getTakamolBaseUrl();

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError(null);
    try {
      const data = await fn();
      setResults((prev) => [{ label, ok: true, body: pretty(data) }, ...prev]);
    } catch (err: any) {
      setError(`${label}: ${err?.message || "Request failed"}`);
      setResults((prev) => [{ label, ok: false, body: pretty(err?.data || err?.message || "Error") }, ...prev]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tk-container" style={{ padding: 0 }}>
      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Reservations &amp; Ticket</h1>
            <p>Query the live portal for your current reservation and download the exam ticket.</p>
          </div>
          <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
            {loggedIn ? "Logged in" : "Needs login"}
          </span>
        </div>
        <div className="tk-hero-actions">
          <button type="button" className="tk-btn tk-btn--sm" onClick={() => refresh()}>Refresh status</button>
          {!loggedIn && (
            <a className="tk-btn tk-btn--sm tk-btn--gold" href="/takamol/login">
              <ExternalLink size={14} /> Login first
            </a>
          )}
        </div>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}

      <div className="tk-card">
        <h2><ListChecks size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />Query reservation</h2>
        <p className="tk-muted" style={{ marginTop: 0, fontSize: "0.88rem" }}>
          <code>POST /api/takamol/reservation</code> — pass a passport number when known.
        </p>
        <div className="tk-grid tk-grid-2">
          <div className="tk-field">
            <label>Passport number (optional)</label>
            <input
              value={passport}
              onChange={(e) => setPassport(e.target.value.toUpperCase())}
              placeholder="A01234567"
            />
          </div>
          <div className="tk-field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="tk-btn tk-btn--teal"
              disabled={busy !== null}
              onClick={() =>
                run("Reservation", () => getReservation(passport ? { passport_number: passport } : {}))
              }
            >
              {busy === "Reservation" ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <ListChecks size={16} />}
              Fetch reservation
            </button>
          </div>
        </div>
      </div>

      <div className="tk-card">
        <div className="tk-card-header">
          <h2><Ticket size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />Exam ticket</h2>
          <button
            type="button"
            className="tk-btn tk-btn--gold"
            disabled={busy !== null}
            onClick={() => run("Ticket", () => getTicket(passport ? { passport_number: passport } : {}))}
          >
            {busy === "Ticket" ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <Ticket size={16} />}
            {busy === "Ticket" ? "Fetching…" : "Fetch ticket"}
          </button>
        </div>
        <p className="tk-muted" style={{ marginTop: 0, fontSize: "0.88rem" }}>
          <code>POST /api/takamol/ticket</code> — requires a logged-in portal session (HTTP 401 otherwise).
        </p>
      </div>

      {results.length > 0 && (
        <div>
          <h3 style={{ margin: "4px 0 10px" }}>Responses</h3>
          {results.map((r, i) => (
            <div key={`${r.label}-${i}`} className="tk-card" style={{ marginBottom: 12 }}>
              <div className="tk-card-header">
                <strong>{r.label}</strong>
                <span className={r.ok ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--danger"}>
                  {r.ok ? "Success" : "Failed"}
                </span>
              </div>
              <pre style={{ margin: 0, fontSize: "0.8rem", overflowX: "auto", color: "var(--tk-muted)" }}>{r.body}</pre>
            </div>
          ))}
        </div>
      )}

      <div className="tk-card">
        <div className="tk-row" style={{ marginBottom: 0 }}>
          <div className="tk-row-main">
            <div className="tk-row-title">Console</div>
            <div className="tk-row-sub">Complete any portal interaction in the noVNC console: {baseUrl}</div>
          </div>
          <a className="tk-btn tk-btn--sm" href={baseUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open
          </a>
        </div>
      </div>
    </div>
  );
}
