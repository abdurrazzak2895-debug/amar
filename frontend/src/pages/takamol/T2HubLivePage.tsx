import { useCallback, useState } from "react";
import { MapPin, CalendarDays, RefreshCw, Search, Building2, Users, Armchair, CircleCheck, CircleX, ChevronRight, Zap } from "lucide-react";
import "@/styles/takamol.css";

const DIVISIONS = ["Dhaka", "Chattogram", "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh", "Sylhet"];

const CATEGORIES = [
  { id: 159, name: "Load & Unload Workers" },
  { id: 158, name: "Cleaners" },
  { id: 160, name: "Office & Facility Cleaning" },
  { id: 162, name: "Street Clean Workers" },
  { id: 6, name: "Painting" },
  { id: 18, name: "Machine Repair" },
  { id: 48, name: "Stone Mason" },
  { id: 58, name: "Sellers" },
  { id: 59, name: "Tailoring" },
  { id: 61, name: "Bakery & Pastries" },
  { id: 72, name: "Taxi Driver" },
];

const API_BASE = "https://xklwzkraobxetxdcysun.supabase.co/functions/v1/svp-proxy";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrbHd6a3Jhb2J4ZXR4ZGN5c3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNTI4ODAsImV4cCI6MjA3MTcyODg4MH0.ZfB5qzYtKjNNoGmzLkNnYKJwZ5oGJ8mL5oY0XqZ6X4";

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { apikey: API_KEY } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function seatColor(n: number) {
  if (n >= 20) return "var(--tk-success)";
  if (n >= 10) return "var(--tk-gold)";
  if (n > 0) return "#f97316";
  return "var(--tk-danger)";
}

function seatBadge(n: number) {
  return {
    background: `${seatColor(n)}22`,
    color: seatColor(n),
    border: `1px solid ${seatColor(n)}44`,
  };
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
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [division]);

  const fetchPaccSessions = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/pacc-exam-sessions?category_id=${categoryId}&city=${encodeURIComponent(division)}&exam_date=${examDate}`);
      setResult({ type: "pacc-sessions", data });
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [division, categoryId, examDate]);

  const fetchOccupations = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/occupations`);
      setResult({ type: "occupations", data });
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const fetchSessionStatus = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setRawJson(null);
    try {
      const data = await api(`/t2hub/session-status`);
      setResult({ type: "session-status", data });
      setRawJson(JSON.stringify(data, null, 2));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const sessions = result?.type === "pacc-sessions" ? result.data?.sessions || [] : [];
  const sites = result?.type === "pacc-sessions" ? result.data?.sites || [] : [];
  const totalSeats = sessions.reduce((sum: number, s: any) => sum + (s.available_seats || 0), 0);
  const uniqueCenters = [...new Set(sessions.map((s: any) => s.center_name || s.test_center_name))];

  return (
    <div className="tk-shell" style={{ padding: 0 }}>
      <header className="tk-topbar">
        <div className="tk-brand">
          <span className="tk-logo" style={{ background: "linear-gradient(135deg, #2dd4bf, #06b6d4)", color: "#0b1230" }}>T2</span>
          <div>
            <span style={{ fontWeight: 800 }}>T2Hub Live</span>
            <span style={{ fontSize: 11, color: "var(--tk-muted)", marginLeft: 8 }}>takamol exam data</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tk-badge tk-badge--ok" style={{ fontSize: 11 }}>
            <span className="tk-dot tk-dot--ok" />
            No auth
          </span>
          <a href="/takamol/booking" style={{ fontSize: 12, color: "var(--tk-gold)", textDecoration: "none" }}>Booking →</a>
        </div>
      </header>

      <main className="tk-container">
        {error && <div className="tk-msg tk-msg--error" style={{ borderRadius: 10 }}>{error}</div>}

        {/* ── Controls ── */}
        <section className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)" }}>
          <div className="tk-step-heading" style={{ marginBottom: 16 }}>
            <span>01</span>
            <div><p className="tk-eyebrow">QUERY</p><strong>Search live t2hub data</strong></div>
          </div>

          <div className="tk-grid tk-grid-3">
            <div className="tk-field">
              <label><MapPin size={13} /> Division / City</label>
              <select value={division} onChange={e => setDivision(e.target.value)}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="tk-field">
              <label><Building2 size={13} /> Category</label>
              <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="tk-field">
              <label><CalendarDays size={13} /> Exam Date</label>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            <button className="tk-btn tk-btn--gold" onClick={fetchPaccSessions} disabled={loading} style={{ fontWeight: 600 }}>
              <Zap size={14} /> Find Sessions
            </button>
            <button className="tk-btn" onClick={fetchTestCenters} disabled={loading}>
              <MapPin size={14} /> All Centers
            </button>
            <button className="tk-btn" onClick={fetchOccupations} disabled={loading}>
              <Search size={14} /> Occupations
            </button>
            <button className="tk-btn" onClick={fetchSessionStatus} disabled={loading}>
              <RefreshCw size={14} /> Health
            </button>
          </div>
        </section>

        {/* ── Loading ── */}
        {loading && (
          <div className="tk-card tk-booking-card" style={{ textAlign: "center", padding: 48 }}>
            <span className="tk-spinner" style={{ width: 28, height: 28 }} />
            <p style={{ marginTop: 10, color: "var(--tk-muted)", fontSize: 13 }}>Fetching from t2hub.app...</p>
          </div>
        )}

        {/* ── Sessions Summary ── */}
        {result?.type === "pacc-sessions" && !loading && (
          <>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Centers", value: uniqueCenters.length, icon: Building2, color: "var(--tk-info)" },
                { label: "Sessions", value: sessions.length, icon: Users, color: "var(--tk-gold)" },
                { label: "Total Seats", value: totalSeats, icon: Armchair, color: totalSeats > 0 ? "var(--tk-success)" : "var(--tk-danger)" },
                { label: "Available", value: sessions.filter((s: any) => (s.available_seats || 0) > 0).length, icon: CircleCheck, color: "var(--tk-teal)" },
              ].map((stat) => (
                <div key={stat.label} className="tk-card" style={{
                  padding: "16px 18px",
                  border: "1px solid var(--tk-glass-border)",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${stat.color}15`, display: "grid", placeItems: "center",
                  }}>
                    <stat.icon size={18} style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</p>
                    <p style={{ fontSize: 11, color: "var(--tk-muted)", marginTop: 2 }}>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sessions per center */}
            {uniqueCenters.map((centerName) => {
              const centerSessions = sessions.filter((s: any) => (s.center_name || s.test_center_name) === centerName);
              const centerSeats = centerSessions.reduce((sum: number, s: any) => sum + (s.available_seats || 0), 0);
              const centerCity = centerSessions[0]?.center_city || centerSessions[0]?.site_city || "";
              return (
                <section key={String(centerName)} className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)", overflow: "hidden" }}>
                  {/* Center header */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "14px 18px",
                    background: "rgba(255,255,255,0.02)",
                    borderBottom: "1px solid var(--tk-glass-border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8,
                        background: "linear-gradient(135deg, var(--tk-gold), var(--tk-gold-deep))",
                        display: "grid", placeItems: "center", color: "#0b1230", fontWeight: 900, fontSize: 14,
                      }}>
                        {String(centerName).charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 14 }}>{centerName}</p>
                        <p style={{ fontSize: 11, color: "var(--tk-muted)" }}>{centerCity} · {division}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        ...seatBadge(centerSeats),
                        borderRadius: 20, padding: "4px 14px", fontWeight: 800, fontSize: 14,
                      }}>
                        {centerSeats} seats
                      </div>
                      <span style={{ fontSize: 11, color: "var(--tk-muted)" }}>{centerSessions.length} session(s)</span>
                    </div>
                  </div>

                  {/* Session rows */}
                  <div style={{ padding: 0 }}>
                    {centerSessions.map((s: any, idx: number) => {
                      const seats = s.available_seats || 0;
                      return (
                        <div key={s.id || idx} style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 100px 120px",
                          alignItems: "center",
                          padding: "10px 18px",
                          borderBottom: idx < centerSessions.length - 1 ? "1px solid var(--tk-glass-border)" : "none",
                          fontSize: 13,
                        }}>
                          <div>
                            <span style={{ color: "var(--tk-muted)" }}>Date:</span>{" "}
                            <strong>{s.exam_date || s.start_date_in_browser_time_zone || "—"}</strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--tk-muted)" }}>Status:</span>{" "}
                            <span style={{
                              color: s.status === "scheduled" ? "var(--tk-success)" : s.status === "Completed" ? "var(--tk-muted)" : "var(--tk-gold)",
                              fontWeight: 600,
                            }}>{s.status}</span>
                          </div>
                          <div>
                            <div style={{
                              ...seatBadge(seats),
                              display: "inline-flex", alignItems: "center", gap: 5,
                              borderRadius: 6, padding: "3px 10px", fontWeight: 800, fontSize: 13,
                            }}>
                              {seats > 0 ? <CircleCheck size={13} /> : <CircleX size={13} />}
                              {seats} seats
                            </div>
                          </div>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--tk-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.session_id || s.id}>
                            {String(s.session_id || s.id).substring(0, 24)}...
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}

        {/* ── Test Centers ── */}
        {result?.type === "test-centers" && !loading && result.data?.sites && (
          <section className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)" }}>
            <div className="tk-step-heading" style={{ marginBottom: 12 }}>
              <span>02</span>
              <div><p className="tk-eyebrow">RESULT</p><strong>{result.data.sites.length} Test Centers in {division}</strong></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {result.data.sites.map((s: any) => (
                <div key={s.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px",
                  border: "1px solid var(--tk-glass-border)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.02)",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: "var(--tk-glass-border)", display: "grid", placeItems: "center",
                    fontFamily: "monospace", fontWeight: 800, fontSize: 13, color: "var(--tk-gold)",
                  }}>
                    {s.id}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</p>
                    <p style={{ fontSize: 11, color: "var(--tk-muted)" }}>{s.city} · {s.division}</p>
                  </div>
                  <ChevronRight size={14} style={{ color: "var(--tk-muted)" }} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Session Status ── */}
        {result?.type === "session-status" && !loading && (
          <section className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)" }}>
            <div className="tk-step-heading" style={{ marginBottom: 12 }}>
              <span>02</span>
              <div><p className="tk-eyebrow">HEALTH</p><strong>Session Status</strong></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[
                { label: "Encryption Key", ok: result.data?.env?.hasKey, detail: result.data?.env?.hasKey ? `${result.data.env.keyLen} chars` : "missing" },
                { label: "Session Cookie", ok: result.data?.env?.hasCookie, detail: result.data?.env?.hasCookie ? `${result.data.env.cookieLen} chars` : "missing" },
                { label: "Overall Status", ok: result.data?.status === "ok", detail: result.data?.status },
              ].map((item) => (
                <div key={item.label} style={{
                  padding: "14px 16px",
                  border: `1px solid ${item.ok ? "var(--tk-success)" : "var(--tk-danger)"}33`,
                  borderRadius: 10,
                  background: `${item.ok ? "var(--tk-success)" : "var(--tk-danger)"}08`,
                }}>
                  <p style={{ fontSize: 11, color: "var(--tk-muted)", marginBottom: 4 }}>{item.label}</p>
                  <p style={{ fontWeight: 700, color: item.ok ? "var(--tk-success)" : "var(--tk-danger)", fontSize: 15 }}>
                    {item.ok ? "✓" : "✗"} {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Occupations ── */}
        {result?.type === "occupations" && !loading && (
          <section className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)" }}>
            <div className="tk-step-heading" style={{ marginBottom: 12 }}>
              <span>02</span>
              <div><p className="tk-eyebrow">RESULT</p><strong>{Array.isArray(result.data) ? result.data.length : 0} Occupations</strong></div>
            </div>
            {Array.isArray(result.data) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, fontSize: 13 }}>
                {result.data.slice(0, 60).map((occ: any) => (
                  <div key={occ.id} style={{
                    padding: "8px 14px",
                    border: "1px solid var(--tk-glass-border)",
                    borderRadius: 8,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{occ.name || occ.english_name}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--tk-muted)" }}>{occ.occupation_key || occ.id}</span>
                  </div>
                ))}
                {result.data.length > 60 && (
                  <p style={{ gridColumn: "1/-1", color: "var(--tk-muted)", fontSize: 12, padding: "4px 14px" }}>
                    + {result.data.length - 60} more (see raw JSON)
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Raw JSON ── */}
        {rawJson && (
          <details className="tk-card tk-booking-card" style={{ border: "1px solid var(--tk-glass-border)" }}>
            <summary style={{ cursor: "pointer", padding: "12px 18px", fontWeight: 600, fontSize: 13, color: "var(--tk-muted)" }}>
              🔧 Raw JSON response ({rawJson.length.toLocaleString()} chars)
            </summary>
            <pre style={{
              margin: 0, padding: "0 18px 18px",
              fontSize: 11, fontFamily: "monospace",
              overflow: "auto", maxHeight: 400,
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              color: "var(--tk-text)",
            }}>
              {rawJson.length > 6000 ? rawJson.substring(0, 6000) + "\n... (truncated)" : rawJson}
            </pre>
          </details>
        )}
      </main>
    </div>
  );
}
