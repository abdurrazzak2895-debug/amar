import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api, getSession, getBackendUrl, getProxyPrefix } from "@/lib/api";
import "@/styles/reservations-premium.css";

// Confirmed from live traffic: SVP's /exam_reservations list endpoint returns
// a flat single-object shape (top-level reservation_id, final_result, labor,
// occupation, test_center, etc. — no array wrapper at all) when the account
// has exactly one reservation, instead of an array with one item. Without
// this check, that single reservation would silently disappear.
const RESERVATION_FIELD_HINTS = ["reservation_id", "reservation_status", "final_result", "labor", "test_center", "prometric_data"];
function looksLikeSingleReservation(obj: any): boolean {
  return obj && typeof obj === "object" && !Array.isArray(obj) && RESERVATION_FIELD_HINTS.some((key) => key in obj);
}

function pickArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (looksLikeSingleReservation(payload)) return [payload];
  const candidates = [
    payload?.data, payload?.items, payload?.result, payload?.payload,
    payload?.exam_reservations, payload?.reservations,
    payload?.data?.items, payload?.data?.result, payload?.data?.payload,
    payload?.data?.exam_reservations, payload?.data?.reservations,
    payload?.result?.items, payload?.result?.exam_reservations,
    payload?.payload?.items, payload?.payload?.exam_reservations,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) return item;
    if (looksLikeSingleReservation(item)) return [item];
  }
  return [];
}

function value(item: any, keys: string[]) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== "") return item[key];
    if (item?.data?.[key] !== undefined && item?.data?.[key] !== null && item?.data?.[key] !== "") return item.data[key];
    if (item?.exam_session?.[key] !== undefined && item?.exam_session?.[key] !== null && item?.exam_session?.[key] !== "") return item.exam_session[key];
    if (item?.test_center?.[key] !== undefined && item?.test_center?.[key] !== null && item?.test_center?.[key] !== "") return item.test_center[key];
  }
  return "";
}

function getReservationId(item: any) { return value(item, ["id", "reservation_id", "exam_reservation_id"]); }
function getOccupationId(item: any) { return item?.occupation?.id || value(item, ["occupation_id"]) || ""; }
function getMethodology(item: any) { return value(item, ["methodology", "methodology_type"]) || "in_person"; }
function getStatus(item: any) { return value(item, ["reservation_status", "status", "cbt_exam_status", "payment_status"]) || "Unknown"; }
function getPaymentStatusRaw(item: any) {
  const paymentCandidates = [
    ...(Array.isArray(item?.payments) ? item.payments : []),
    ...(Array.isArray(item?.payment_transactions) ? item.payment_transactions : []),
    ...(Array.isArray(item?.transactions) ? item.transactions : []),
    item?.latest_payment,
    item?.payment,
    item?.transaction,
    item?.invoice,
  ].filter(Boolean);

  for (const payment of paymentCandidates) {
    const status =
      payment?.status ||
      payment?.payment_status ||
      payment?.result?.description ||
      payment?.result?.code ||
      payment?.response?.result?.description ||
      payment?.response?.result?.code ||
      payment?.raw?.result?.description ||
      payment?.raw?.result?.code ||
      "";
    if (status) return String(status).trim();
  }

  return String(
    item?.payment_status ||
    value(item, ["payment_status", "paymentStatus", "pay_status", "paid_status"]) ||
    ""
  ).trim();
}
function getPaymentStatus(item: any) {
  const reservationId = getReservationId(item);
  const localStatus = reservationId ? localStorage.getItem(`paymentStatus:${reservationId}`) : "";
  if (localStatus === "failed") return { type: "failed", label: "Payment failed" };
  if (localStatus === "pending") return { type: "pending", label: "Payment pending" };
  if (localStatus === "success") return { type: "paid", label: "Paid" };

  const raw = getPaymentStatusRaw(item).toLowerCase();
  const reservationStatus = String(getStatus(item) || "").toLowerCase();
  const paidFlag = item?.paid === true || item?.is_paid === true || item?.payment?.paid === true;

  if (/fail|failed|declin|reject|cancel|expired|void|error|not\s*successful|unsuccessful/.test(raw)) {
    return { type: "failed", label: "Payment failed" };
  }
  if (paidFlag || /paid|success|successful|completed|confirmed|settled|captured/.test(raw)) {
    return { type: "paid", label: "Paid" };
  }
  if (/pending|initiated|created|processing|unpaid|not_paid|payment_required/.test(raw)) {
    return { type: "pending", label: "Payment pending" };
  }
  if (/unpaid|payment/.test(reservationStatus)) {
    return { type: "pending", label: "Payment pending" };
  }
  return { type: "unknown", label: raw || "Unknown" };
}
function canPayReservation(item: any) {
  const status = getPaymentStatus(item).type;
  const reservationStatus = String(getStatus(item) || "").toLowerCase();
  return status === "failed" || status === "pending" || (/unpaid|payment/.test(reservationStatus) && status !== "paid");
}
function readNumeric(payload: any, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key] ?? payload?.balance?.[key] ?? payload?.data?.[key] ?? payload?.data?.balance?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) return numberValue;
    }
  }
  return 0;
}
function getCreditInfo(balance: any) {
  const reservationCredits = readNumeric(balance, ["reservation_credits", "reservationCredits"]);
  const freeCertificates = readNumeric(balance, ["free_certificates_total", "freeCertificatesTotal"]);
  return {
    reservationCredits,
    freeCertificates,
    hasCredit: reservationCredits > 0 || freeCertificates > 0,
  };
}
function getDate(item: any) {
  return item?.exam_session?.test_date || item?.exam_session?.start_at_in_browser_time_zone || value(item, ["exam_date", "scheduled_at", "date", "examDay", "test_date", "start_at_in_browser_time_zone", "start_at"]) || "";
}
function getCenterName(item: any) {
  // New SVP shape: test_center.test_center_name. Legacy: test_center.name.
  // Always trust the explicit center name from SVP per exam_session.
  const explicit =
    item?.exam_session?.test_center?.test_center_name ||
    item?.exam_session?.test_center?.name ||
    item?.test_center?.test_center_name ||
    item?.test_center?.name ||
    value(item, ["test_center_name"]);
  if (explicit) return String(explicit).trim();
  const city = item?.exam_session?.test_center?.test_center_city || item?.exam_session?.test_center?.city || value(item, ["site_city", "city"]);
  return city ? String(city) : `Site #${getSiteId(item) || "-"}`;
}
function getSiteId(item: any) {
  // New SVP shape: test_center.test_center_id (numeric). Legacy: test_center.site_id.
  return (
    item?.exam_session?.test_center?.site_id ||
    item?.exam_session?.test_center?.test_center_id ||
    item?.test_center?.site_id ||
    item?.test_center?.test_center_id ||
    value(item, ["site_id"]) ||
    ""
  );
}
function getLanguageCode(item: any) { return value(item, ["language_code", "prometric_code", "code"]) || "-"; }
function getSessionId(item: any) { return value(item, ["exam_session_id"]) || item?.exam_session?.id || ""; }
function canReschedule(item: any) { return Boolean(item?.can_be_rescheduled); }
function canCancel(item: any) { return Boolean(item?.can_be_canceled); }
function getRescheduleReason(item: any) { return item?.cancellation_reason || item?.violation_reason || item?.reservation_status || ""; }
function getFullName(item: any) {
  return String(
    item?.full_name ||
    item?.user?.full_name ||
    item?.individual_labor?.full_name ||
    item?.labor?.full_name ||
    item?.profile?.full_name ||
    value(item, ["full_name", "name"]) ||
    ""
  ).trim();
}
function getOccupationName(item: any) {
  return String(
    item?.occupation?.english_name ||
    item?.occupation?.name ||
    item?.exam_session?.occupation?.english_name ||
    item?.exam_session?.occupation?.name ||
    value(item, ["occupation_name", "occupation_english_name"]) ||
    getOccupationId(item) ||
    ""
  ).trim();
}
function sanitizeFilePart(value: string, fallback: string) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}
function getTicketFileName(item: any, reservationId: string | number) {
  const fullName = sanitizeFilePart(getFullName(item), "SVP User");
  const occupationName = sanitizeFilePart(getOccupationName(item), "Occupation");
  return `${fullName}_${occupationName}_Ticket_${reservationId}.pdf`;
}
function findUrlDeep(value: any, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const queue = [value];
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    for (const [key, item] of Object.entries(current)) {
      if (typeof item === "string" && wanted.has(key.toLowerCase()) && /^https?:\/\//i.test(item)) return item;
      if (item && typeof item === "object") queue.push(item);
    }
  }
  return "";
}
function findCheckoutIdDeep(value: any): string {
  if (!value || typeof value !== "object") return "";
  const queue: { value: any; parentKey: string }[] = [{ value, parentKey: "" }];
  while (queue.length) {
    const current = queue.shift();
    if (!current?.value || typeof current.value !== "object") continue;
    for (const [key, item] of Object.entries(current.value)) {
      const normalizedKey = key.toLowerCase();
      if ((normalizedKey === "checkout_id" || normalizedKey === "checkoutid") && (typeof item === "string" || typeof item === "number")) return String(item);
      if ((typeof item === "string" || typeof item === "number") && normalizedKey === "id") {
        const raw = String(item);
        if (current.parentKey.toLowerCase().includes("checkout") || /^[A-F0-9]{16,}\.[\w.-]+$/i.test(raw)) return raw;
      }
      if (typeof item === "string") {
        const match = item.match(/[A-F0-9]{16,}\.[\w.-]+/i);
        if (match) return match[0];
      }
      if (item && typeof item === "object") queue.push({ value: item, parentKey: key });
    }
  }
  return "";
}

export default function ReservationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [payingId, setPayingId] = useState("");
  const [creditByReservationId, setCreditByReservationId] = useState<Record<string, { reservationCredits: number; freeCertificates: number; hasCredit: boolean; checked: boolean }>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadReservations() {
    setLoading(true); setError(""); setSuccess("");
    try {
      const data = await api("/exam-reservations?locale=en");
      const reservations = pickArray(data);
      setItems(reservations);
      void loadReservationCredits(reservations);
      if (!reservations.length) setError("No booked reservations found from the API for this account.");
    } catch (err: any) { setItems([]); setError(err?.message || "Failed to load booked reservations"); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadReservations(); }, []);

  async function loadReservationCredits(reservations: any[]) {
    const entries = await Promise.all(
      reservations.map(async (item) => {
        const reservationId = String(getReservationId(item) || "");
        const occupationId = String(getOccupationId(item) || "");
        if (!reservationId || !occupationId) return null;
        try {
          const params = new URLSearchParams({
            methodology_type: getMethodology(item),
            occupation_id: occupationId,
            locale: "en",
          });
          const balance = await api(`/user-balance?${params.toString()}`);
          return [reservationId, { ...getCreditInfo(balance), checked: true }] as const;
        } catch {
          return [reservationId, { reservationCredits: 0, freeCertificates: 0, hasCredit: false, checked: true }] as const;
        }
      })
    );
    const next: Record<string, { reservationCredits: number; freeCertificates: number; hasCredit: boolean; checked: boolean }> = {};
    entries.forEach((entry) => {
      if (entry) next[entry[0]] = entry[1];
    });
    setCreditByReservationId(next);
  }

  async function startReschedule(item: any) {
    const reservationId = getReservationId(item);
    const occupationId = getOccupationId(item);
    if (!reservationId || !occupationId) { setError("Missing reservation ID or occupation ID"); return; }
    setLoadingId(String(reservationId)); setError("");

    try {
      // Try reservation-credits/use first, but don't block reschedule if it fails
      try {
        await api("/reservation-credits/use", {
          method: "POST",
          body: { methodology_type: getMethodology(item), reservation_id: Number(reservationId), occupation_id: Number(occupationId) },
        });
      } catch (creditErr: any) {
        console.warn("reservation-credits/use failed (continuing):", creditErr?.message);
        // Continue to reschedule even if credits call fails
      }

      // Find the prometric code matching the reservation's language_code
      const isoLang = String(getLanguageCode(item) || "");
      const catId = String(item?.category?.id || item?.exam_session?.category?.id || "");
      const prometricCodes = item?.category?.prometric_codes || item?.exam_session?.category?.prometric_codes || [];
      const matchedPrometricCode = prometricCodes.find((c: any) => c?.language_code === isoLang)?.code || isoLang;

      const query = new URLSearchParams({
        reschedule: "1", reservationId: String(reservationId), occupationId: String(occupationId),
        methodology: String(getMethodology(item)), examDate: String(getDate(item) || ""),
        siteId: String(getSiteId(item) || ""), siteCity: String(value(item, ["site_city", "city"]) || item?.exam_session?.test_center?.test_center_city || item?.exam_session?.test_center?.city || ""),
        languageCode: String(matchedPrometricCode || isoLang || ""),
        categoryId: catId,
      });
      navigate(`/exam/booking?${query.toString()}`);
    } catch (err: any) { setError(err?.message || "Failed to start reschedule"); }
    finally { setLoadingId(""); }
  }

  async function cancelReservation(item: any) {
    const reservationId = getReservationId(item);
    if (!reservationId) { setError("Missing reservation ID"); return; }
    if (!window.confirm(`Are you sure you want to cancel reservation #${reservationId}? This action cannot be undone.`)) return;

    setCancellingId(String(reservationId)); setError(""); setSuccess("");
    try {
      await api(`/exam-reservations/${encodeURIComponent(reservationId)}`, { method: "DELETE" });
      setSuccess(`Reservation #${reservationId} cancelled successfully.`);
      await loadReservations();
    } catch (err: any) { setError(err?.message || "Failed to cancel reservation"); }
    finally { setCancellingId(""); }
  }

  async function downloadTicket(item: any) {
    const reservationId = getReservationId(item);
    if (!reservationId) { setError("Missing reservation ID for ticket download"); return; }
    setDownloadingId(String(reservationId)); setError("");
    try {
      const { accessToken } = getSession();
      const base = getBackendUrl();
      const response = await fetch(`${base}${getProxyPrefix()}/tickets/${encodeURIComponent(reservationId)}/show-pdf?locale=en`, {
        method: "GET", headers: {
          Accept: "*/*",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(localStorage.getItem("access_token") ? { "X-Access-Token": localStorage.getItem("access_token")! } : {}),
        },
      });
      if (!response.ok) { throw new Error(await response.text() || "Failed to download ticket PDF"); }
      const contentType = response.headers.get("content-type") || "";
      const fileName = getTicketFileName(item, reservationId);
      const triggerDownload = (href: string, name: string) => {
        const anchor = document.createElement("a"); anchor.href = href; anchor.download = name;
        document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
      };
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const url = data?.url || data?.pdf_url || data?.data?.url || data?.data?.pdf_url;
        if (!url) throw new Error("Ticket PDF URL not found in response");
        triggerDownload(String(url), fileName); return;
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      triggerDownload(blobUrl, fileName);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) { setError(err?.message || "Failed to download ticket"); }
    finally { setDownloadingId(""); }
  }

  async function startPayment(item: any) {
    const reservationId = getReservationId(item);
    if (!reservationId) { setError("Missing reservation ID for payment"); return; }
    const creditInfo = creditByReservationId[String(reservationId)];
    if (creditInfo?.hasCredit) {
      setError("Reservation credit is available for this booking. Payment is not required.");
      return;
    }
    setPayingId(String(reservationId)); setError(""); setSuccess("");
    try {
      try {
        await api("/payments-validate-pending?locale=en");
      } catch (err: any) {
        console.warn("payments/validate_pending failed before retry payment (continuing):", err?.message);
      }

      const paymentData: any = await api("/payments", {
        method: "POST",
        body: {
          payment: {
            payment_method: "card",
            payable_type: "Reservation",
            payable_id: Number(reservationId),
          },
        },
      });

      const paymentUrl = findUrlDeep(paymentData, ["checkout_url", "checkoutUrl", "payment_url", "paymentUrl", "redirect_url", "redirectUrl", "url"]);
      if (paymentUrl) {
        window.open(paymentUrl, "_blank", "noopener,noreferrer");
        setSuccess(`Payment page opened for reservation #${reservationId}.`);
        return;
      }

      const checkoutId = findCheckoutIdDeep(paymentData);
      if (!checkoutId) throw new Error("Payment session was created, but no checkout ID was returned.");
      const resultUrl = `${window.location.origin}/exam/payment/result?reservationId=${encodeURIComponent(String(reservationId))}`;
      const params = new URLSearchParams({ checkoutId, reservationId: String(reservationId), resultUrl });
      window.open(`/exam/payment?${params.toString()}`, "_blank", "noopener,noreferrer");
      setSuccess(`Payment page opened for reservation #${reservationId}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to start payment");
    } finally {
      setPayingId("");
    }
  }

  return (
    <div className="page-shell rb-shell">
      <div className="page-card rb-board">
        <div className="page-head rb-hero">
          <div>
            <p className="eyebrow">RESERVATION COMMAND CENTRE</p>
            <h1>My exam journey</h1>
            <p className="muted">Track every reservation, payment and ticket from one calm, focused workspace.</p>
          </div>
          <div className="actions rb-hero__actions">
            <Link to="/dashboard" className="secondary-btn">Dashboard</Link>
            <button className="secondary-btn" type="button" onClick={loadReservations} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="rb-orbit rb-orbit--one" /><div className="rb-orbit rb-orbit--two" />
        </div>

        <div className="rb-summary">
          <div><small>TOTAL BOOKINGS</small><strong>{items.length}</strong><span>All reservations</span></div>
          <div><small>READY / PAID</small><strong>{items.filter((item) => getPaymentStatus(item).type === "paid").length}</strong><span>Ticket-ready exams</span></div>
          <div><small>NEEDS ATTENTION</small><strong>{items.filter((item) => ["failed", "pending"].includes(getPaymentStatus(item).type)).length}</strong><span>Payment follow-up</span></div>
        </div>

        {success ? <div className="status-card status-success" style={{ background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb" }}>{success}</div> : null}
        {error ? <div className="status-card status-error">{error}</div> : null}
        {loading ? <div className="empty-card">Loading booked reservations...</div> : null}
        {!loading && !items.length ? (
          <div className="empty-card">No reservations are available to show.</div>
        ) : null}

        <div className="reservation-grid rb-grid">
          {items.map((item) => {
            const rid = getReservationId(item);
            const sid = getSessionId(item);
            const paymentStatus = getPaymentStatus(item);
            const creditInfo = creditByReservationId[String(rid || "")];
            const creditAvailable = Boolean(creditInfo?.hasCredit);
            const showPayButton = canPayReservation(item) && !creditAvailable;
            return (
              <div className={`reservation-card rb-card rb-card--${paymentStatus.type}`} key={String(rid || sid || "reservation-item")}>
                <div className="reservation-top rb-card__head">
                  <div><small>RESERVATION</small><h2>#{rid || "-"}</h2></div>
                  <span className="rb-status">{getStatus(item)}</span>
                </div>
                <div className="detail-list rb-details">
                  <div data-icon="📍" data-tone="cyan"><span>Test center</span><strong>{getCenterName(item)}</strong></div>
                  <div data-icon="📅" data-tone="gold"><span>Exam date</span><strong>{getDate(item) || "-"}</strong></div>
                  <div data-icon="💼" data-tone="violet"><span>Occupation</span><strong>{item?.occupation?.english_name || item?.occupation?.name || getOccupationId(item) || "-"}</strong></div>
                  <div data-icon="🆔" data-tone="blue"><span>Session ID</span><strong>{getSessionId(item) || "-"}</strong></div>
                  <div data-icon="🌐" data-tone="teal"><span>Language</span><strong>{getLanguageCode(item)}</strong></div>
                  <div data-icon="🏢" data-tone="orange"><span>Site ID</span><strong>{getSiteId(item) || "-"}</strong></div>
                  <div data-icon="🖥️" data-tone="pink"><span>Methodology</span><strong>{getMethodology(item) || "-"}</strong></div>
                  <div data-icon="🎫" data-tone="gold">
                    <span>Reservation Credits</span>
                    <strong>{creditInfo?.checked ? creditInfo.reservationCredits : "Checking..."}</strong>
                  </div>
                  <div data-icon="💳" data-tone={creditAvailable || paymentStatus.type === "paid" ? "green" : paymentStatus.type === "failed" ? "red" : "gold"}>
                    <span>Payment</span>
                    <strong style={{
                      color: creditAvailable || paymentStatus.type === "paid" ? "#a7f3d0" : paymentStatus.type === "failed" ? "#fecdd3" : "#fde68a",
                    }}>
                      {creditAvailable ? "Credit available" : paymentStatus.label}
                    </strong>
                  </div>
                </div>
                {showPayButton ? (
                  <button className="primary-btn rb-pay-btn" type="button" onClick={() => startPayment(item)}
                    disabled={payingId === String(rid)} style={{ marginBottom: "10px", width: "100%" }}>
                    {payingId === String(rid) ? "Opening payment..." : paymentStatus.type === "failed" ? "Retry Payment" : "Pay Now"}
                  </button>
                ) : null}
                {creditAvailable && canPayReservation(item) ? (
                  <small style={{ display: "block", margin: "0 0 10px", color: "#15803d", fontWeight: 700 }}>
                    Reservation credit available. Pay Now is hidden.
                  </small>
                ) : null}
                <button className="primary-btn" type="button" onClick={() => startReschedule(item)}
                  disabled={loadingId === String(rid) || !canReschedule(item)}>
                  {loadingId === String(rid) ? "Opening..." : canReschedule(item) ? "Reschedule" : "Reschedule unavailable"}
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => cancelReservation(item)}
                  disabled={cancellingId === String(rid) || !canCancel(item)}
                  style={{ marginTop: "10px", width: "100%", ...(canCancel(item) ? { background: "#dc3545", color: "#fff", border: "1px solid #dc3545" } : {}) }}
                >
                  {cancellingId === String(rid) ? "Cancelling..." : canCancel(item) ? "Cancel Reservation" : "Cancel unavailable"}
                </button>
                <button className="secondary-btn" type="button" onClick={() => downloadTicket(item)}
                  disabled={downloadingId === String(rid)} style={{ marginTop: "10px", width: "100%" }}>
                  {downloadingId === String(rid) ? "Downloading..." : "Download Ticket PDF"}
                </button>
                {!canReschedule(item) && getRescheduleReason(item) ? (
                  <small style={{ display: "block", marginTop: "8px", color: "#8b3d3d" }}>
                    Reason: {String(getRescheduleReason(item))}
                  </small>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
