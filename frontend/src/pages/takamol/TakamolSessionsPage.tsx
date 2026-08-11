import { useCallback, useState } from "react";
import { Ticket, RefreshCw, RotateCcw, XCircle, ExternalLink } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import {
  getExamSessions,
  rescheduleExam,
  rebookExam,
  cancelExamBooking,
  getTakamolBaseUrl,
} from "@/lib/takamol-api";

function pretty(data: any): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function TakamolSessionsPage() {
  const { loggedIn } = useTakamolAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");

  const baseUrl = getTakamolBaseUrl();

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    setOk(null);
    try {
      const res = await getExamSessions();
      const data = res?.data ?? res;
      const list = Array.isArray(data) ? data : data?.sessions || data?.results || [];
      setSessions(list);
      if (!list.length) setOk("No sessions returned (200 OK, empty list).");
    } catch (err: any) {
      setError(err?.message || "Failed to load exam sessions");
    } finally {
      setBusy(null);
    }
  }, []);

  async function runAction(label: string, fn: (body: Record<string, unknown>) => Promise<any>) {
    if (!sessionId) {
      setError("Enter a session / booking ID first.");
      return;
    }
    setBusy(label);
    setError(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = {
        session_id: sessionId,
        booking_id: sessionId,
      };
      const res = await fn(body);
      setOk(`${label}: ${typeof res === "string" ? res : pretty(res)}`);
      load();
    } catch (err: any) {
      setError(`${label}: ${err?.message || "Request failed"}`);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="tk-container" style={{ padding: 0 }}>
      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Exam Sessions</h1>
            <p>
              <code>GET /api/exam/sessions</code> — requires a logged-in portal session.
            </p>
          </div>
          <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
            {loggedIn ? "Logged in" : "Needs login"}
          </span>
        </div>
        <div className="tk-hero-actions">
          <button type="button" className="tk-btn tk-btn--teal" onClick={load} disabled={busy !== null}>
            {busy === "load" ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={15} />}
            {busy === "load" ? "Loading…" : "Load sessions"}
          </button>
          {!loggedIn && (
            <a className="tk-btn tk-btn--sm tk-btn--gold" href="/takamol/login">
              <ExternalLink size={14} /> Login first
            </a>
          )}
        </div>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}
      {ok && <div className="tk-msg tk-msg--ok">{ok}</div>}

      <div className="tk-card">
        <h2><Ticket size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />Session / booking actions</h2>
        <div className="tk-grid tk-grid-2">
          <div className="tk-field">
            <label>Session / booking ID</label>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="e.g. SESSION-12345"
            />
          </div>
          <div className="tk-field">
            <label>&nbsp;</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="tk-btn tk-btn--sm tk-btn--gold"
                disabled={busy !== null}
                onClick={() => runAction("Reschedule", (b) => rescheduleExam(b))}
              >
                {busy === "Reschedule" ? <span className="tk-spinner" style={{ width: 13, height: 13 }} /> : <RotateCcw size={14} />}
                Reschedule
              </button>
              <button
                type="button"
                className="tk-btn tk-btn--sm tk-btn--teal"
                disabled={busy !== null}
                onClick={() => runAction("Rebook", (b) => rebookExam(b))}
              >
                {busy === "Rebook" ? <span className="tk-spinner" style={{ width: 13, height: 13 }} /> : <RefreshCw size={14} />}
                Rebook
              </button>
              <button
                type="button"
                className="tk-btn tk-btn--sm tk-btn--danger"
                disabled={busy !== null}
                onClick={() => runAction("Cancel", (b) => cancelExamBooking(b))}
              >
                {busy === "Cancel" ? <span className="tk-spinner" style={{ width: 13, height: 13 }} /> : <XCircle size={14} />}
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="tk-card">
        <div className="tk-card-header">
          <h2>Sessions</h2>
          <span className="tk-badge">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className="tk-empty">Press “Load sessions”. Requires an active portal login.</div>
        ) : (
          <table className="tk-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Category</th>
                <th>Date</th>
                <th>Center</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.slice(0, 100).map((s: any, i: number) => (
                <tr key={s?.id ?? i}>
                  <td><code>{String(s?.id ?? i)}</code></td>
                  <td>{s?.category?.english_name || s?.category?.name || s?.category_id || "—"}</td>
                  <td>{s?.start_date_in_browser_time_zone || s?.start_date || s?.exam_date || s?.date || "—"}</td>
                  <td>{s?.test_center?.name || s?.test_center?.city || s?.center || "—"}</td>
                  <td><span className="tk-badge">{s?.status || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="tk-card">
        <div className="tk-row" style={{ marginBottom: 0 }}>
          <div className="tk-row-main">
            <div className="tk-row-title">Console</div>
            <div className="tk-row-sub">{baseUrl}</div>
          </div>
          <a className="tk-btn tk-btn--sm" href={baseUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open
          </a>
        </div>
      </div>
    </div>
  );
}

