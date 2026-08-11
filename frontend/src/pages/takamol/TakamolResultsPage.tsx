import { useCallback, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw } from "lucide-react";
import { useTakamolAuth } from "@/contexts/TakamolAuthContext";
import { getExamResults, getTakamolBaseUrl } from "@/lib/takamol-api";

function pretty(data: any): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function TakamolResultsPage() {
  const { loggedIn } = useTakamolAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = getTakamolBaseUrl();

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await getExamResults();
      setData(res);
    } catch (err: any) {
      setError(err?.message || "Failed to load exam results");
    } finally {
      setBusy(false);
    }
  }, []);

  const resultsList = Array.isArray(data) ? data : data?.results || data?.data || null;

  return (
    <div className="tk-container" style={{ padding: 0 }}>
      <div className="tk-hero">
        <div className="tk-card-header" style={{ marginBottom: 6 }}>
          <div>
            <h1>Exam Results</h1>
            <p>
              <code>GET /api/exam/results</code> — requires a logged-in portal session.
            </p>
          </div>
          <span className={loggedIn ? "tk-badge tk-badge--ok" : "tk-badge tk-badge--warn"}>
            {loggedIn ? "Logged in" : "Needs login"}
          </span>
        </div>
        <div className="tk-hero-actions">
          <button type="button" className="tk-btn tk-btn--teal" onClick={load} disabled={busy}>
            {busy ? <span className="tk-spinner" style={{ width: 14, height: 14 }} /> : <RefreshCw size={15} />}
            {busy ? "Loading…" : "Fetch results"}
          </button>
          {!loggedIn && (
            <a className="tk-btn tk-btn--sm tk-btn--gold" href="/takamol/login">
              <ExternalLink size={14} /> Login first
            </a>
          )}
        </div>
      </div>

      {error && <div className="tk-msg tk-msg--error">{error}</div>}

      {data === null && !error ? (
        <div className="tk-empty">
          <BarChart3 size={26} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No results loaded yet. Press “Fetch results”.</div>
        </div>
      ) : resultsList && Array.isArray(resultsList) && resultsList.length > 0 ? (
        <div className="tk-card">
          <table className="tk-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Category</th>
                <th>Result</th>
                <th>Date</th>
                <th>Center</th>
              </tr>
            </thead>
            <tbody>
              {resultsList.slice(0, 100).map((r: any, i: number) => {
                const result = String(
                  r?.result || r?.exam_result || r?.final_result || r?.status || "—"
                ).toLowerCase();
                return (
                  <tr key={r?.id ?? r?.session_id ?? i}>
                    <td>{r?.full_name || r?.name || r?.applicant_name || "—"}</td>
                    <td>{r?.category?.name || r?.category || r?.category_id || "—"}</td>
                    <td>
                      <span className={result === "passed" || result === "pass" ? "tk-badge tk-badge--ok" : result === "failed" || result === "fail" ? "tk-badge tk-badge--danger" : "tk-badge"}>
                        {result || "—"}
                      </span>
                    </td>
                    <td>{r?.exam_date || r?.test_date || r?.date || "—"}</td>
                    <td>{r?.center_name || r?.test_center_name || r?.test_center?.name || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : data !== null ? (
        <div className="tk-card">
          <div className="tk-card-header">
            <strong>Raw response</strong>
            <span className="tk-badge tk-badge--ok">Received</span>
          </div>
          <pre style={{ margin: 0, fontSize: "0.8rem", overflowX: "auto", color: "var(--tk-muted)" }}>{pretty(data)}</pre>
        </div>
      ) : null}
    </div>
  );
}
