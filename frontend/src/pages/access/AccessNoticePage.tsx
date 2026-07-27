import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Megaphone, Users, WalletCards } from "lucide-react";
import { useAccessAuth } from "@/contexts/AccessAuthContext";
import { accessAdminApi } from "@/lib/access-api";
import "@/styles/access-dashboard-premium.css";

interface Notice { enabled: boolean; message: string; updated_at?: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function AccessNoticePage() {
  const { user, logout } = useAccessAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice>({ enabled: false, message: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await accessAdminApi<{ notice: Notice }>("/notice");
        setNotice(response.notice);
      } catch (error: unknown) {
        setMessage(errorMessage(error));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const response = await accessAdminApi<{ notice: Notice }>("/notice", {
        method: "PUT",
        body: { enabled: notice.enabled, message: notice.message },
      });
      setNotice(response.notice);
      setMessage(response.notice.enabled ? "Notice is now live on every user dashboard." : "Notice saved and hidden from dashboards.");
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ap-shell">
      <aside className="ap-sidebar">
        <div className="ap-brand"><span className="ap-brand__mark">A</span><div><strong>Access</strong><small>ADMIN CONSOLE</small></div></div>
        <nav className="ap-nav">
          <small>CONTROL</small>
          <Link className="ap-nav__link" to="/access/dashboard"><LayoutDashboard />Dashboard</Link>
          <Link className="ap-nav__link" to="/access/accounts"><Users />Accounts</Link>
          <Link className="ap-nav__link" to="/access/finance"><WalletCards />Permissions & Wallets</Link>
          <Link className="ap-nav__link ap-nav__link--active" to="/access/notice"><Megaphone />Notice</Link>
        </nav>
        <div className="ap-sidebar__foot">Secure ledger · v1</div>
      </aside>
      <main className="ap-main">
        <header className="ap-topbar">
          <div><small>ANNOUNCEMENTS</small><strong>Dashboard notice</strong></div>
          <div className="ap-account">
            <span className="ap-role ap-role--admin">ADMIN</span>
            <div><strong>{user?.name}</strong><small>{user?.email}</small></div>
            <button onClick={() => { logout(); navigate("/access/login"); }}><LogOut />Logout</button>
          </div>
        </header>
        <section className="af-head">
          <Megaphone />
          <div><small>USER-FACING BANNER</small><h1>Dashboard notice</h1><p>When enabled, this message shows at the top of every logged-in user's dashboard — useful for maintenance windows or system-wide updates.</p></div>
        </section>
        {message && <div className="ap-error af-message">{message}</div>}
        {!loading && (
          <section className="ap-panel af-booking-cost">
            <div><small>BANNER SETTINGS</small><h2>Compose the notice</h2></div>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <label className="af-method-toggle" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  style={{ width: "18px", minHeight: "18px" }}
                  type="checkbox"
                  checked={notice.enabled}
                  onChange={(e) => setNotice({ ...notice, enabled: e.target.checked })}
                />
                Show this notice on all user dashboards
              </label>
              <label>
                Message
                <textarea
                  rows={5}
                  maxLength={2000}
                  value={notice.message}
                  onChange={(e) => setNotice({ ...notice, message: e.target.value })}
                  placeholder="তাকামুলের সিস্টেম চেঞ্জ হওয়ার কারণে আমাদের আপডেটের কাজ চলছে, এই মুহূর্তে সকল চয়েসের কাজ বন্ধ আছে, অনুগ্রহপূর্বক অপেক্ষা করুন, সিস্টেম ঠিক হলে আবারও কাজ করতে পারবেন.."
                  style={{ width: "100%", fontFamily: "inherit", fontSize: 14, padding: 10, borderRadius: 8, border: "1px solid #d8d8d8" }}
                />
              </label>
              {notice.enabled && notice.message && (
                <div style={{ background: "#fff4e0", border: "1px solid #f0c674", borderRadius: 8, padding: 12, fontSize: 14 }}>
                  <strong style={{ display: "block", marginBottom: 4 }}>Preview</strong>
                  {notice.message}
                </div>
              )}
              <button className="ap-btn ap-btn--gold" style={{ alignSelf: "start" }} disabled={saving}>
                {saving ? "Saving…" : "Save notice"}
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
