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

function getCenterId(value: any): string {
  return String(value?.test_center_id ?? value?.site_id ?? value?.center_id ?? value?.id ?? value?.test_center?.site_id ?? value?.test_center?.id ?? "").trim();
}

function getCenterName(value: any): string {
  return String(value?.test_center_name ?? value?.name ?? value?.center_name ?? value?.test_center?.test_center_name ?? value?.test_center?.name ?? "").trim();
}

function getSessionId(value: any): string {
  return String(value?.exam_session_id ?? value?.session_id ?? value?.sessionId ?? value?.id ?? "").trim();
}

function getSessionCenterName(value: any): string {
  return getCenterName(value) || String(value?.test_center?.city ?? value?.city ?? "").trim();
}

function getSessionTime(value: any): string {
  return String(value?.test_time ?? value?.time ?? value?.start_time ?? value?.start_date ?? value?.start_date_in_browser_time_zone ?? "").trim();
}

export default function TakamolBookingPage() {
  const { loggedIn, refresh } = useTakamolAuth();
  const [searchParams] = useSearchParams();

  const [categories, setCategories] = useState<TakamolCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>(searchParams.get("category_id") || "");

  const [datesRes, setDatesRes] = useState<TakamolDatesResult | null>(null);
  const [centers, setCenters] = useState<TakamolCenter[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState("");
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

  const centerGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; city: string; slots: TakamolCenter[] }>();
    centers.forEach((center) => {
      const id = getCenterId(center);
      const name = getCenterName(center);
      if (!id || !name) return;
      const key = id;
      const existing = groups.get(key);
      if (existing) existing.slots.push(center);
      else groups.set(key, { id, name, city: String(center.city || city).trim(), slots: [center] });
    });
    return Array.from(groups.values());
  }, [centers, city]);

  const selectedCenter = useMemo(
    () => centerGroups.find((center) => center.id === selectedCenterId) || null,
    [centerGroups, selectedCenterId]
  );

  const selectedSessions = useMemo(() => {
    if (!selectedCenterId) return [];
    return sessions.filter((session) => getCenterId(session) === selectedCenterId);
  }, [sessions, selectedCenterId]);

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
      setSelectedCenterId("");
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
        const nextCenters = c?.centers || (Array.isArray(c) ? c : []);
        setCenters(nextCenters);
        setSelectedCenterId("");
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
      if (!selectedCenterId) {
        setSessions([]);
        setError("Select a test centre first; sessions from other centres are hidden.");
        return;
      }
      const body: Record<string, unknown> = {
        category_id: Number(categoryId),
        exam_date: date,
        test_center_id: Number.isFinite(Number(selectedCenterId)) ? Number(selectedCenterId) : selectedCenterId,
      };
      if (city) body.city = city;
      const res = await getSessions(body);
      const centreSessions = normalizeSessions(res).filter((session) => getCenterId(session) === selectedCenterId);
      setSessions(centreSessions);
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setBusy(false);
    }
  }, [categoryId, city, date, selectedCenterId]);

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
          <>
            <div className="tk-grid tk-grid-3">
            <div className="tk-field">
              <label><MapPin size={13} style={{ verticalAlign: "-2px" }} /> City</label>
              <select value={city} onChange={(e) => { setCity(e.target.value); setSelectedCenterId(""); setSessions([]); }}>
                <option value="">— Any city —</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="tk-field">
              <label><MapPin size={13} style={{ verticalAlign: "-2px" }} /> Test centre</label>
              <select
                value={selectedCenterId}
                onChange={(e) => { setSelectedCenterId(e.target.value); setSessions([]); setForm((prev) => ({ ...prev, session_id: "" })); }}
                disabled={!centerGroups.length}
              >
                <option value="">— Select one centre —</option>
                {centerGroups
                  .filter((center) => !city || !center.city || center.city.toLowerCase() === city.toLowerCase())
                  .map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name} — Site #{center.id} · {center.slots.length} available slot{center.slots.length === 1 ? "" : "s"}
                    </option>
                  ))}
              </select>
              {selectedCenter && (
                <small className="tk-help">Selected centre only: {selectedCenter.name} — Site #{selectedCenter.id}. Other-centre sessions are hidden.</small>
              )}
            </div>
            <div className="tk-field">
              <label><CalendarDays size={13} style={{ verticalAlign: "-2px" }} /> Exam date</label>
              <select value={date} onChange={(e) => { setDate(e.target.value); setSessions([]); setForm((prev) => ({ ...prev, session_id: "" })); }}>
                <option value="">— Pick date —</option>
                {dateRows.map((d: any, i: number) => {
                  const val = d?.date || d?.exam_date || d?.start_date || d?.value || String(d);
                  return <option key={i} value={String(val)}>{String(val)}</option>;
                })}
              </select>
            </div>
          </div>
          {selectedCenter && (
            <div className="tk-msg tk-msg--info">
              <strong>{selectedCenter.name} — Site #{selectedCenter.id}</strong>: {selectedCenter.slots.length} available slot{selectedCenter.slots.length === 1 ? "" : "s"}.
              {selectedCenter.slots.map((slot, index) => (
                <span key={`${getSessionId(slot) || "slot"}-${index}`}> {getSessionTime(slot) || "Time pending"}{getSessionId(slot) ? ` · Session ID: ${getSessionId(slot)}` : ""}{index < selectedCenter.slots.length - 1 ? " ·" : ""}</span>
              ))}
            </div>
          )}
          </>
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
          <button type="button" className="tk-btn tk-btn--sm" onClick={loadSessions} disabled={busy || !date || !selectedCenterId}>
            {busy ? <span className="tk-spinner" style={{ width: 13, height: 13 }} /> : <Users size={14} />}
            Load sessions
          </button>
        </div>
        {busy ? (
          <div className="tk-loading"><span className="tk-spinner" /> Loading sessions…</div>
        ) : !selectedCenterId ? (
          <div className="tk-empty">Select a test centre first. Sessions from other centres remain hidden.</div>
        ) : selectedSessions.length === 0 ? (
          <div className="tk-empty">No sessions loaded for {selectedCenter?.name || "the selected centre"}. Press “Load sessions” to refresh this centre only.</div>
        ) : (
          <div>
            {selectedSessions.slice(0, 40).map((s, i) => {
              const sid = getSessionId(s) || String(i);
              const start = getSessionTime(s) || s?.exam_date || s?.date || "";
              const seats = s?.available_seats ?? s?.seats ?? s?.capacity ?? "";
              const center = getSessionCenterName(s) || selectedCenter?.name || "";
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

