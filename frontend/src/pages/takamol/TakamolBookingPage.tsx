import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck, MapPin, CalendarDays, Clock, Users, Save, ExternalLink } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import {
  getCategories,
  getCenters,
  getDates,
  getSessions,
  getReservation,
  getTakamolBaseUrl,
  type TakamolCategory,
  type TakamolCenter,
  type TakamolDatesResult,
} from "@/lib/takamol-api";

function normalizeSessions(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.sessions || raw.dates || raw.data || [];
}

export default function TakamolBookingPage() {
  const { loggedIn, refresh } = useTakamolAuth();
  const [searchParams] = useSearchParams();

  const [categories, setCategories] = useState<TakamolCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>(searchParams.get("category_id") || "");

  const [datesRes, setDatesRes] = useState<TakamolDatesResult | null>(null);
  const [centers, setCenters] = useState<TakamolCenter[]>([]);
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({
    session_id: "",
    passport_number: "",
    nationality: "BGD",
    full_name: "",
  });

  const baseUrl = getTakamolBaseUrl();

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(categoryId)) || null,
    [categories, categoryId]
  );

  const cities = useMemo(() => datesRes?.cities || [], [datesRes]);
  const dateRows = useMemo(() => datesRes?.dates || [], [datesRes]);
  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories();
      const list = Array.isArray(res) ? res : (res?.categories || []);
      setCategories(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load categories");
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const pickCategory = useCallback(
    async (id: string) => {
      setCategoryId(id);
      setDatesRes(null);
      setCenters([]);
      setCity("");
      setDate("");
      setSessions([]);
      setError(null);
      setOk(null);
      if (!id) return;
      setLoading(true);
      try {
        const body: Record<string, unknown> = { category_id: Number(id) };
        if (city) body.city = city;
        const [d, c] = await Promise.all([getDates(body), getCenters(body)]);
        setDatesRes(d);
        setCenters(c?.centers || (Array.isArray(c) ? c : []));
      } catch (err: any) {
        setError(err?.message || "Failed to load dates/centers");
      } finally {
        setLoading(false);
      }
    },
    [city]
  );

  const loadSessions = useCallback(async () => {
    if (!categoryId || !date) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = {
        category_id: Number(categoryId),
        exam_date: date,
      };
      if (city) body.city = city;
      const res = await getSessions(body);
      setSessions(normalizeSessions(res));
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setBusy(false);
    }
  }, [categoryId, city, date]);

  const submitReservation = useCallback(async () => {
    if (!form.session_id || !form.passport_number) {
      setError("Select a session and enter a passport number.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const body: Record<string, unknown> = {
        category_id: Number(categoryId),
        session_id: form.session_id,
        passport_number: form.passport_number,
        nationality: form.nationality,
      };
      if (form.full_name) body.full_name = form.full_name;
      const res = await getReservation(body);
      setOk(typeof res === "string" ? res : JSON.stringify(res, null, 2));
    } catch (err: any) {
      setError(err?.message || "Reservation failed. Is the portal session active?");
    } finally {
      setBusy(false);
    }
  }, [categoryId, form]);

  return (
    <div className="tk-container" style={{ padding: 0 }}>
      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Book an Exam</h1>
            <p>Pick a category, then the backend queries the portal for centers, dates and open sessions.</p>
          </div>
          <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
            {loggedIn ? "Logged in" : "Needs login"}
          </span>
        </div>
        <div className="tk-hero-actions">
          <button type="button" className="tk-btn tk-btn--sm" onClick={() => refresh()}>
            <CalendarCheck size={14} /> Refresh status
          </button>
          {!loggedIn && (
            <a className="tk-btn tk-btn--sm tk-btn--gold" href={`/takamol/login`}>
              <ExternalLink size={14} /> Login first
            </a>
          )}
        </div>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}
      {ok && <div className="tk-msg tk-msg--ok"><pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.85rem" }}>{ok}</pre></div>}

      <div className="tk-card">
        <h2>Step 1 · Category</h2>
        <div className="tk-field">
          <label>Exam category</label>
          <select value={categoryId} onChange={(e) => pickCategory(e.target.value)} disabled={loading}>
            <option value="">— Select category —</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name} (ID {cat.id})</option>
            ))}
          </select>
        </div>
        {selectedCategory && (
          <span className="tk-badge tk-badge--info">Selected: {selectedCategory.name}</span>
        )}
      </div>

      <div className="tk-card">
        <h2>Step 2 · Center, city &amp; date</h2>
        {loading ? (
          <div className="tk-loading"><span className="tk-spinner" /> Loading dates &amp; centers…</div>
        ) : !categoryId ? (
          <div className="tk-empty">Select a category first.</div>
        ) : (
          <div className="tk-grid tk-grid-2">
            <div className="tk-field">
              <label><MapPin size={13} style={{ verticalAlign: "-2px" }} /> City</label>
              <select value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="">— Any city —</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {centers.map((ctr) => (
                  <option key={`ctr-${ctr.id ?? ctr.name ?? ctr.city}`} value={ctr.city || ctr.name}>
                    {(ctr.name || ctr.city || "Center")}
                  </option>
                ))}
              </select>
            </div>
            <div className="tk-field">
              <label><CalendarDays size={13} style={{ verticalAlign: "-2px" }} /> Exam date</label>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="">— Pick date —</option>
                {dateRows.map((d: any, i: number) => {
                  const val = d?.date || d?.exam_date || d?.start_date || d?.value || String(d);
                  return <option key={i} value={String(val)}>{String(val)}</option>;
                })}
              </select>
            </div>
          </div>
        )}
        {!loading && !datesRes && categoryId && (
          <div className="tk-msg tk-msg--info">
            No dates/cities returned — the portal may need an active session. Retry after logging in.
          </div>
        )}
      </div>

      <div className="tk-card">
        <div className="tk-card-header">
          <h2><Clock size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />Step 3 · Sessions</h2>
          <button type="button" className="tk-btn tk-btn--sm" onClick={loadSessions} disabled={busy || !date}>
            {busy ? <span className="tk-spinner" style={{ width: 13, height: 13 }} /> : <Users size={14} />}
            Load sessions
          </button>
        </div>
        {busy ? (
          <div className="tk-loading"><span className="tk-spinner" /> Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="tk-empty">No sessions loaded yet. Pick a date above and press “Load sessions”.</div>
        ) : (
          <div>
            {sessions.slice(0, 40).map((s, i) => {
              const sid = String(s?.id ?? s?.session_id ?? s?.sessionId ?? i);
              const start = s?.start_date || s?.start_date_in_browser_time_zone || s?.exam_date || s?.date || "";
              const seats = s?.available_seats ?? s?.seats ?? s?.capacity ?? "";
              const center = s?.test_center?.name || s?.center || s?.center_name || "";
              const st = s?.status || "open";
              return (
                <div key={sid} className="tk-row">
                  <div className="tk-row-main">
                    <div className="tk-row-title">
                      {start ? String(start) : `Session ${sid}`} {center && `· ${center}`}
                    </div>
                    <div className="tk-row-sub">
                      Session ID: <code>{sid}</code>
                      {seats !== "" && ` · Seats: ${seats}`} · Status: {st}
                    </div>
                  </div>
                  <div className="tk-row-actions">
                    <button
                      type="button"
                      className={form.session_id === sid ? "tk-chip tk-chip--active" : "tk-chip"}
                      onClick={() => setForm((f) => ({ ...f, session_id: sid }))}
                    >
                      {form.session_id === sid ? "Selected ✓" : "Select"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="tk-card">
        <h2><Save size={17} style={{ verticalAlign: "-3px", marginRight: 7 }} />Step 4 · Reservation</h2>
        <div className="tk-grid tk-grid-2">
          <div className="tk-field">
            <label>Session ID</label>
            <input
              value={form.session_id}
              onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value }))}
              placeholder="Select from the list above or paste an ID"
            />
          </div>
          <div className="tk-field">
            <label>Passport number *</label>
            <input
              value={form.passport_number}
              onChange={(e) => setForm((f) => ({ ...f, passport_number: e.target.value.toUpperCase() }))}
              placeholder="e.g. A01234567"
            />
          </div>
          <div className="tk-field">
            <label>Nationality</label>
            <select value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}>
              <option value="BGD">Bangladesh (BGD)</option>
              <option value="IND">India (IND)</option>
              <option value="PAK">Pakistan (PAK)</option>
              <option value="NPL">Nepal (NPL)</option>
              <option value="PHL">Philippines (PHL)</option>
            </select>
          </div>
          <div className="tk-field">
            <label>Full name (optional)</label>
            <input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Applicant name"
            />
          </div>
        </div>
        <button type="button" className="tk-btn tk-btn--gold" onClick={submitReservation} disabled={busy}>
          {busy ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <Save size={16} />}
          {busy ? "Reserving…" : "Create reservation"}
        </button>
        {baseUrl && (
          <p className="tk-muted" style={{ fontSize: "0.78rem", marginTop: 14 }}>
            Backend: <code>{baseUrl}</code>
          </p>
        )}
      </div>
    </div>
  );
}

