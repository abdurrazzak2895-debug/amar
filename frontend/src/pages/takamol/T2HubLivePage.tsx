import { useCallback, useState } from "react";
import { MapPin, CalendarDays, Clock3, RefreshCw, Search, ChevronDown, Building2, Users } from "lucide-react";
import "@/styles/takamol.css";

const DIVISIONS = ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh", "Sylhet"];

const CATEGORIES = [
  { id: 159, name: "Load and unload workers" },
  { id: 158, name: "Cleaners" },
  { id: 160, name: "Offices and Facilities Cleaning" },
  { id: 162, name: "Street Clean Workers" },
  { id: 6, name: "Painting" },
  { id: 18, name: "Machine repair" },
  { id: 48, name: "Stone mason" },
  { id: 58, name: "Sellers" },
  { id: 59, name: "Tailoring" },
  { id: 61, name: "Bakery and Pastries" },
  { id: 72, name: "Taxi Driver" },
];

const API_BASE = "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/svp-proxy";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbHd6a3Jhb2J4ZXR4ZGN5c3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNTI4ODAsImV4cCI6MjA3MTcyODg4MH0.ZfB5qzYtKjNNoGmzLkNnYKJwZ5oGJ8mL5oY0XqZ6X4";

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { apikey: API_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function jsonPreview(obj: unknown, maxLen = 2000): string {
  const str = JSON.stringify(obj, null, 2);
  return str.length > maxLen ? str.substring(0, maxLen) + "\n... (truncated)" : str;
}

export default function T2HubLivePage() {
  const [division, setDivision] = useState("Rajshahi");
  const [categoryId, setCategoryId] = useState(159);
  const [examDate, setExamDate] = useState("2026-09-12");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);

  const fetchTestCenters = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/test-centers?city=${encodeURIComponent(division)}`);
      setResult({ type: "test-centers", data });
      setRawJson(jsonPreview(data));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [division]);

  const fetchPaccSessions = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/pacc-exam-sessions?category_id=${categoryId}&city=${encodeURIComponent(division)}&exam_date=${examDate}`);
      setResult({ type: "pacc-sessions", data });
      setRawJson(jsonPreview(data));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [division, categoryId, examDate]);

  const fetchOccupations = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/occupations`);
      setResult({ type: "occupations", data });
      setRawJson(jsonPreview(data));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchSessionStatus = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/session-status`);
      setResult({ type: "session-status", data });
      setRawJson(jsonPreview(data));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  return (
    <div className="tk-shell" style={{ padding: 0 }}>
      <header className="tk-topbar">
        <div className="tk-brand">
          <span className="tk-logo">T2</span>
          <span>T2Hub Live Check</span>
        </div>
        <span className="tk-badge tk-badge--ok" style={{ fontSize: 11 }}>
          <span className="tk-dot tk-dot--ok" />
          No auth required
        </span>
      </header>

      <main className="tk-container">
        {error && <div className="tk-msg tk-msg--error">{error}</div>}

        {/* Controls */}
        <section className="tk-card tk-booking-card">
          <div className="tk-step-heading"><span>01</span><div><p className="tk-eyebrow">QUERY</p><strong>Live t2hub data</strong></div></div>

          <div className="tk-grid tk-grid-3">
            <div className="tk-field">
              <label><MapPin size={14} /> Division / City</label>
              <select value={division} onChange={e => setDivision(e.target.value)}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="tk-field">
              <label><Building2 size={14} /> Category</label>
              <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="tk-field">
              <label><CalendarDays size={14} /> Exam Date</label>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button className="tk-btn tk-btn--gold" onClick={fetchTestCenters} disabled={loading}>
              <MapPin size={14} /> Test Centers
            </button>
            <button className="tk-btn tk-btn--gold" onClick={fetchPaccSessions} disabled={loading}>
              <Users size={14} /> PACC Sessions
            </button>
            <button className="tk-btn" onClick={fetchOccupations} disabled={loading}>
              <Search size={14} /> Occupations
            </button>
            <button className="tk-btn" onClick={fetchSessionStatus} disabled={loading}>
              <RefreshCw size={14} /> Session Status
            </button>
          </div>
        </section>

        {/* Results */}
        {loading && (
          <div className="tk-card tk-booking-card" style={{ textAlign: "center", padding: 40 }}>
            <span className="tk-spinner" style={{ width: 24, height: 24 }} />
            <p style={{ marginTop: 8, color: "var(--tk-muted)" }}>Loading...</p>
          </div>
        )}

        {result && !loading && (
          <section className="tk-card tk-booking-card">
            <div className="tk-step-heading"><span>02</span><div><p className="tk-eyebrow">RESULT</p><strong>{result.type}</strong></div></div>

            {result.type === "test-centers" && result.data?.sites && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--tk-glass-border)" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>ID</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Name</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>City</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Division</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.sites.map((s: any) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--tk-glass-border)" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{s.id}</td>
                        <td style={{ padding: "8px 12px" }}>{s.name}</td>
                        <td style={{ padding: "8px 12px" }}>{s.city}</td>
                        <td style={{ padding: "8px 12px", color: "var(--tk-muted)" }}>{s.division}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.type === "pacc-sessions" && result.data?.sessions && (
              <div style={{ overflowX: "auto" }}>
                <p style={{ color: "var(--tk-muted)", fontSize: 13, marginBottom: 8 }}>
                  {result.data.sessions.length} session(s) found · {result.data.sites?.length || 0} center(s) in {division}
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--tk-glass-border)" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Center</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>City</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Seats</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--tk-muted)" }}>Session ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.sessions.map((s: any) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--tk-glass-border)" }}>
                        <td style={{ padding: "8px 12px" }}>{s.center_name || s.test_center_name}</td>
                        <td style={{ padding: "8px 12px" }}>{s.center_city || s.site_city}</td>
                        <td style={{ padding: "8px 12px" }}>{s.exam_date || s.start_date_in_browser_time_zone}</td>
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: s.available_seats > 0 ? "var(--tk-success)" : "var(--tk-danger)" }}>
                          {s.available_seats ?? "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>{s.status}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.session_id || s.id}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.type === "session-status" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
                <div>
                  <p style={{ color: "var(--tk-muted)", marginBottom: 4 }}>Env vars</p>
                  <p>Key: <strong style={{ color: result.data?.env?.hasKey ? "var(--tk-success)" : "var(--tk-danger)" }}>{result.data?.env?.hasKey ? `${result.data.env.keyLen} chars` : "missing"}</strong></p>
                  <p>Cookie: <strong style={{ color: result.data?.env?.hasCookie ? "var(--tk-success)" : "var(--tk-danger)" }}>{result.data?.env?.hasCookie ? `${result.data.env.cookieLen} chars` : "missing"}</strong></p>
                </div>
                <div>
                  <p style={{ color: "var(--tk-muted)", marginBottom: 4 }}>Status</p>
                  <p><strong style={{ color: result.data?.status === "ok" ? "var(--tk-success)" : "var(--tk-danger)" }}>{result.data?.status}</strong></p>
                </div>
              </div>
            )}

            {result.type === "occupations" && (
              <p style={{ color: "var(--tk-muted)", fontSize: 13 }}>
                {Array.isArray(result.data) ? result.data.length : "—"} occupations loaded. See raw JSON below.
              </p>
            )}
          </section>
        )}

        {/* Raw JSON */}
        {rawJson && (
          <section className="tk-card tk-booking-card">
            <div className="tk-step-heading"><span>03</span><div><p className="tk-eyebrow">RAW</p><strong>JSON response</strong></div></div>
            <pre style={{
              background: "rgba(0,0,0,0.3)",
              border: "1px solid var(--tk-glass-border)",
              borderRadius: 8,
              padding: 16,
              fontSize: 12,
              fontFamily: "monospace",
              overflow: "auto",
              maxHeight: 500,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              color: "var(--tk-text)",
            }}>
              {rawJson}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
