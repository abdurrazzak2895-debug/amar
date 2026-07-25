import { useState, useEffect, useRef } from "react";
import { apiAuth, apiAuthGet } from "@/lib/api";
import "@/styles/auth-premium.css";
import "@/styles/result-verification.css";

interface LaborRow {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  passport_number?: string;
  nationality_id?: string;
  occupation_key?: string;
  occupation_name?: string;
  status?: string;
  [key: string]: unknown;
}

interface OccupationOption {
  id: string;
  name: string;
}

// SVP's /visitor_space/labors endpoint returns different shapes depending on
// match count: an array when there are (or could be) multiple rows, but a
// single flat object — e.g. { applicant_name, exam_result, exam_date, ... }
// with no wrapping array at all — when there's exactly one match. Detect
// that flat-record shape and normalize it into a one-item array.
const RECORD_FIELD_HINTS = ["applicant_name", "exam_result", "exam_date", "test_center_name", "passport_number", "full_name"];
function looksLikeSingleRecord(obj: Record<string, unknown>): boolean {
  return RECORD_FIELD_HINTS.some((key) => key in obj);
}

function extractLaborRows(payload: unknown): LaborRow[] {
  if (Array.isArray(payload)) return payload as LaborRow[];
  if (!payload || typeof payload !== "object") return [];

  const value = payload as Record<string, unknown>;
  if (looksLikeSingleRecord(value)) return [value as LaborRow];

  const nested = value.result ?? value.data ?? value.labors ?? value.items;
  if (Array.isArray(nested)) return nested as LaborRow[];
  if (nested && typeof nested === "object") {
    const nestedValue = nested as Record<string, unknown>;
    if (looksLikeSingleRecord(nestedValue)) return [nestedValue as LaborRow];
    const nestedList = nestedValue.data ?? nestedValue.labors ?? nestedValue.items;
    if (Array.isArray(nestedList)) return nestedList as LaborRow[];
  }
  return [];
}

function extractOccupationRows(payload: unknown): OccupationOption[] {
  const pick = (val: unknown): unknown[] => {
    if (Array.isArray(val)) return val;
    if (val && typeof val === "object") {
      const v = val as Record<string, unknown>;
      for (const key of ["data", "occupations", "items"]) {
        if (Array.isArray(v[key])) return v[key] as unknown[];
      }
    }
    return [];
  };
  const raw = pick(payload).length ? pick(payload) : pick((payload as Record<string, unknown>)?.data);
  return raw.map((item) => {
    const o = item as Record<string, unknown>;
    const id = o.id ?? o.key ?? o.occupation_id ?? o.occupation_key;
    const name = o.name ?? o.english_name ?? o.title ?? o.occupation_name ?? "";
    return { id: String(id ?? ""), name: String(name || `Occupation ${id ?? ""}`) };
  }).filter((o) => o.id);
}

export default function ResultVerificationPage() {
  const [passportNumber, setPassportNumber] = useState("");
  const [occupationKey, setOccupationKey] = useState("");
  const [occupationQuery, setOccupationQuery] = useState("");
  const [occupationOptions, setOccupationOptions] = useState<OccupationOption[]>([]);
  const [occupationOpen, setOccupationOpen] = useState(false);
  const [occupationLoading, setOccupationLoading] = useState(false);
  const [occupationError, setOccupationError] = useState("");
  const occupationBoxRef = useRef<HTMLDivElement>(null);
  const [nationalityId, setNationalityId] = useState("BGD");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LaborRow[]>([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // Pre-fill occupation_key from login page selection if available
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("selected_occupation");
      if (saved) {
        const occ = JSON.parse(saved);
        if (occ.occupation_key) {
          setOccupationKey(String(occ.occupation_key));
          setOccupationQuery(occ.occupation_name || String(occ.occupation_key));
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Debounced occupation search-as-you-type against the live SVP occupations list.
  useEffect(() => {
    const query = occupationQuery.trim();
    if (query.length < 2) { setOccupationOptions([]); return; }
    setOccupationLoading(true);
    setOccupationError("");
    const handle = setTimeout(() => {
      apiAuthGet<unknown>(`/registration/occupations?per_page=20&name=${encodeURIComponent(query)}`)
        .then((data) => setOccupationOptions(extractOccupationRows(data)))
        .catch((err: unknown) => {
          const value = err as { message?: string };
          setOccupationOptions([]);
          setOccupationError(value?.message || "Could not load occupations");
        })
        .finally(() => setOccupationLoading(false));
    }, 350);
    return () => clearTimeout(handle);
  }, [occupationQuery]);

  // Close the dropdown when clicking outside the occupation field.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (occupationBoxRef.current && !occupationBoxRef.current.contains(e.target as Node)) {
        setOccupationOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectOccupation(opt: OccupationOption) {
    setOccupationKey(opt.id);
    setOccupationQuery(opt.name);
    setOccupationOpen(false);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResults([]);
    setSearched(false);
    if (!occupationKey) {
      setError("Please select an occupation from the search results.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiAuth<unknown>("/result-verification", {
        passportNumber,
        occupationKey,
        nationalityId,
      });
      const list = extractLaborRows(data);
      setResults(list);
      setSearched(true);
      if (list.length === 0) setError("No labor records found for the given criteria.");
    } catch (err: unknown) {
      const value = err as { message?: string; data?: { message?: unknown } };
      const detail = value.data?.message || value.message || "Search failed";
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function renderCell(key: string, value: unknown) {
    if (value === null || value === undefined || value === "") return <span key={key} className="rv-cell rv-cell--empty">—</span>;
    // Highlight passport number
    if (key === "passport_number") return <code key={key} className="rv-cell rv-cell--highlight">{String(value)}</code>;
    if (key === "id") return <code key={key} className="rv-cell rv-cell--muted">{String(value)}</code>;
    return <span key={key} className="rv-cell">{String(value)}</span>;
  }

  return (
    <main className="rv-shell">
      <div className="rv-card">
        <header className="rv-header">
          <h1>Result Verification</h1>
          <p>Look up a labor record by passport number, occupation key and nationality.</p>
        </header>

        <form onSubmit={handleSearch} className="rv-form">
          <div className="rv-grid">
            <div className="rv-field">
              <label htmlFor="rv-passport">Passport Number</label>
              <input
                id="rv-passport"
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="e.g. A14746895"
                required
                autoComplete="off"
              />
            </div>
            <div className="rv-field" ref={occupationBoxRef} style={{ position: "relative" }}>
              <label htmlFor="rv-occ">Occupation</label>
              <input
                id="rv-occ"
                type="text"
                value={occupationQuery}
                onChange={(e) => {
                  setOccupationQuery(e.target.value);
                  setOccupationKey("");
                  setOccupationOpen(true);
                }}
                onFocus={() => { if (occupationOptions.length > 0) setOccupationOpen(true); }}
                placeholder="Type to search, e.g. Welder"
                autoComplete="off"
                required
              />
              {occupationOpen && occupationQuery.trim().length >= 2 && (
                <div className="rv-occ-dropdown">
                  {occupationLoading && <div className="rv-occ-dropdown-item rv-occ-dropdown-item--muted">Searching…</div>}
                  {!occupationLoading && occupationError && <div className="rv-occ-dropdown-item rv-occ-dropdown-item--muted">{occupationError}</div>}
                  {!occupationLoading && !occupationError && occupationOptions.length === 0 && (
                    <div className="rv-occ-dropdown-item rv-occ-dropdown-item--muted">No occupations found.</div>
                  )}
                  {!occupationLoading && occupationOptions.map((opt) => (
                    <button type="button" key={opt.id} className="rv-occ-dropdown-item" onClick={() => selectOccupation(opt)}>
                      {opt.name} <span className="rv-occ-dropdown-item-id">#{opt.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {occupationKey ? (
                <small>Selected occupation key: {occupationKey}</small>
              ) : (
                <small>Search and select an occupation from the list.</small>
              )}
            </div>
            <div className="rv-field">
              <label htmlFor="rv-nat">Nationality ID</label>
              <input
                id="rv-nat"
                type="text"
                value={nationalityId}
                onChange={(e) => setNationalityId(e.target.value)}
                placeholder="e.g. BGD"
                required
                autoComplete="off"
              />
            </div>
          </div>
          <button type="submit" className="rv-submit" disabled={loading}>
            {loading ? "Searching…" : "Search labor record"}
          </button>
        </form>

        {error && <div className="rv-message rv-message--error">{error}</div>}

        {results.length > 0 && (
          <div className="rv-results">
            <h2 className="rv-results-title">{results.length} record{results.length !== 1 ? "s" : ""} found</h2>
            <div className="rv-table-wrap">
              <table className="rv-table">
                <thead>
                  <tr>
                    {Object.keys(results[0]).map((key) => (
                      <th key={key}>{key.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([key, value]) => renderCell(key, value))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {searched && results.length === 0 && !error && !loading && (
          <div className="rv-message rv-message--info">
            No records matched your search criteria. Verify the passport number, occupation key and nationality.
          </div>
        )}
      </div>
    </main>
  );
}
