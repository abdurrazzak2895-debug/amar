import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { api, getSession, getBackendUrl, getProxyPrefix } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { extractTestCenterId } from "@/lib/test-centers";
import {
  pickArray, normalizeOccupation, normalizeDateValue,
  normalizeAvailableDateEntries, getSessionId, getSessionSiteId, getSessionSiteCity,
  getSessionCenterName, getExplicitSessionCenterName, getCenterKey, getPrometricCodes, extractId,
  buildCenterOptions, buildCityOptions, buildDateOptions, buildCalendarDays,
  formatDateLabel, detectBookingMode, resolveSessionCenter, SectionCenterRule,
} from "@/lib/booking-utils";
import "@/styles/booking-premium.css";
import { useAccessAuth } from "@/contexts/AccessAuthContext";

const FALLBACK_TEST_CENTERS: { siteId: string; name: string; city: string }[] = [
  { siteId: "17", name: "Bangladesh Korea TTC Dhaka", city: "Dhaka" },
  { siteId: "45", name: "Bangladesh German TTC", city: "Dhaka" },
  { siteId: "53", name: "Bangladesh Korea TTC Chattogram", city: "Chattogram" },
  { siteId: "54", name: "Rajshahi Technical Training Centre", city: "Rajshahi" },
  { siteId: "60", name: "Barishal Technical Training Center", city: "Barishal" },
  { siteId: "62", name: "Cumilla Technical Training Centre", city: "Cumilla" },
  { siteId: "68", name: "Nilphamari Technical Training Center", city: "Nilphamari" },
  { siteId: "70", name: "Mymensingh Technical Training Centre", city: "Mymensingh" },
  { siteId: "71", name: "Sylhet Technical Training Center", city: "Sylhet" },
  { siteId: "102", name: "Tangail Technical Training Center", city: "Dhaka" },
  { siteId: "107", name: "Bogura Technical Training Centre", city: "Rajshahi" },
  { siteId: "115", name: "BRTC Central Training Institute Gazipur", city: "Dhaka" },
  { siteId: "156", name: "Khulna Technical Training Centre", city: "Khulna" },
  { siteId: "166", name: "Faridpur Technical Training Centre", city: "Barishal" },
  { siteId: "171", name: "Jashore Technical Training Centre", city: "Khulna" },
  { siteId: "174", name: "Brahmanbaria Technical Training Centre", city: "Cumilla" },
  { siteId: "180", name: "Madaripur Technical Training Centre", city: "Barishal" },
  { siteId: "181", name: "Narail Technical Training Centre", city: "Khulna" },
  { siteId: "201", name: "Pabna Technical Training Centre", city: "Rajshahi" },
  { siteId: "203", name: "Noakhali Technical Training Centre", city: "Cumilla" },
  { siteId: "208", name: "Tangail Ttc", city: "Tangail" },
  { siteId: "218", name: "Narsingdi Technical Training Center", city: "Dhaka" },
  { siteId: "220", name: "Kishoreganj Technical Training Centre", city: "Dhaka" },
  { siteId: "221", name: "Shariatpur Technical Training Centre", city: "Dhaka" },
  { siteId: "223", name: "Manikganj Technical Training Center", city: "Dhaka" },
  { siteId: "265", name: "Joypurhat Technical Training Center", city: "Rajshahi" },
];

function fallbackCentersForCity(city: string) {
  const c = String(city || "").trim().toLowerCase();
  return FALLBACK_TEST_CENTERS.filter((item) => item.city.toLowerCase() === c);
}




export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAccessAuth();
  const [occupations, setOccupations] = useState<any[]>([]);
  const [availableDateEntries, setAvailableDateEntries] = useState<{ city: string; date: string }[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [testCenterMap, setTestCenterMap] = useState<Map<string, string>>(new Map());
  // name (lowercased) -> site_id, resolved from local DB so we can stamp site_id
  // on sessions when SVP returns site_id=null.
  const [centerNameToSiteId, setCenterNameToSiteId] = useState<Map<string, string>>(new Map());
  // exam_session_id -> site_id (admin-defined deterministic mapping via Lovable Cloud).
  const [sessionIdToSiteId, setSessionIdToSiteId] = useState<Map<string, string>>(new Map());
  // Section rules — deterministic fallback for sessions whose site_id changes daily.
  const [sectionRules, setSectionRules] = useState<SectionCenterRule[]>([]);
  const [cityCenterOptions, setCityCenterOptions] = useState<{ siteId: string; name: string; city: string }[]>([]);
  const [selectedOccupationId, setSelectedOccupationId] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [methodology, setMethodology] = useState("in_person");
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [siteCity, setSiteCity] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [languageCode, setLanguageCode] = useState("");
  const [holdId, setHoldId] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [paymentSession, setPaymentSession] = useState<{ reservationId: string; url: string; checkoutId: string; resultUrl: string } | null>(null);
  const [loadingOccupations, setLoadingOccupations] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [creatingHold, setCreatingHold] = useState(false);
  const [booking, setBooking] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [liveAvailableSeats, setLiveAvailableSeats] = useState<number | null>(null);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [occupationSearch, setOccupationSearch] = useState("");
  const [isOccupationOpen, setIsOccupationOpen] = useState(false);
  const occupationRef = useRef<HTMLDivElement>(null);

  const selectedOccupation = useMemo(
    () => occupations.find((item) => String(item.id) === String(selectedOccupationId)) || null,
    [occupations, selectedOccupationId]
  );
  const filteredOccupations = useMemo(
    () => occupationSearch ? occupations.filter((item) => item.name?.toLowerCase().includes(occupationSearch.toLowerCase())) : occupations,
    [occupations, occupationSearch]
  );
  const cityOptions = useMemo(() => buildCityOptions(availableDateEntries), [availableDateEntries]);
  const availableDates = useMemo(() => buildDateOptions(availableDateEntries, selectedCity), [availableDateEntries, selectedCity]);
  const cityFilteredSessions = useMemo(
    () => selectedCity ? sessions.filter((item) => String(getSessionSiteCity(item)).trim().toLowerCase() === String(selectedCity).trim().toLowerCase()) : sessions,
    [sessions, selectedCity]
  );
  const sessionsWithResolvedCenters = useMemo(
    () => cityFilteredSessions.map((item) => resolveSessionCenter(item, testCenterMap, centerNameToSiteId, sessionIdToSiteId, sectionRules)),
    [cityFilteredSessions, testCenterMap, centerNameToSiteId, sessionIdToSiteId, sectionRules]
  );
  const centerOptions = useMemo(() => {
    const options = buildCenterOptions(sessionsWithResolvedCenters);
    const merged = new Map<string, { siteId: string; name: string; city: string }>();
    const sessionBackedSiteIds = new Set(options.map((opt) => String(opt.siteId)));

    // When sessions are loaded, the dropdown must only contain centers that
    // actually have available sessions. Otherwise a city-wide t2hub center list
    // can auto-select a center with no matching session and make the Exam
    // Session dropdown look broken. Use cityCenterOptions only to enrich the
    // matching session-backed center name, or as a pre-session fallback.
    const hasSessionBackedCenters = options.length > 0;
    const hasCityDbCenters = cityCenterOptions.length > 0;
    options.forEach((opt) => {
      if (hasCityDbCenters && String(opt.siteId).startsWith("city:")) return;
      const liveCenter = cityCenterOptions.find((item) => String(item.siteId) === String(opt.siteId));
      merged.set(String(opt.siteId), {
        ...opt,
        name: liveCenter?.name || testCenterMap.get(opt.siteId) || opt.name,
        city: liveCenter?.city || opt.city,
      });
    });
    cityCenterOptions.forEach((opt) => {
      if (hasSessionBackedCenters && !sessionBackedSiteIds.has(String(opt.siteId))) return;
      merged.set(String(opt.siteId), opt);
    });
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionsWithResolvedCenters, testCenterMap, cityCenterOptions]);
  const getResolvedSessionCenterName = (item: any) => {
    // SVP-first: if the session already carries its own real test_center_name
    // (new SVP shape), use that. This guarantees per-session correctness even
    // when multiple sessions in the same city belong to different test centers.
    const explicit = getExplicitSessionCenterName(item);
    if (explicit) return explicit;
    const candidates = [`session:${getSessionId(item)}`, String(getCenterKey(item)), String(getSessionSiteId(item))].filter(Boolean);
    for (const key of candidates) {
      const mapped = testCenterMap.get(key);
      if (mapped) return mapped;
    }
    return getSessionCenterName(item);
  };
  const filteredSessions = useMemo(
    () => {
      if (!selectedCenterId) return sessionsWithResolvedCenters;
      const exact = sessionsWithResolvedCenters.filter((item) => getCenterKey(item) === String(selectedCenterId));
      if (exact.length) return exact;

      const selectedCenter = centerOptions.find((item) => String(item.siteId) === String(selectedCenterId));
      if (!selectedCenter) return [];
      if (String(selectedCenter.siteId).startsWith("city:") && selectedCenter.city) {
        return sessionsWithResolvedCenters.filter(
          (item) => String(getSessionSiteCity(item)).trim().toLowerCase() === String(selectedCenter.city).trim().toLowerCase()
        );
      }
      const selectedName = String(selectedCenter.name || "").trim().toLowerCase();
      if (!selectedName) return [];
      return sessionsWithResolvedCenters.filter(
        (item) => getResolvedSessionCenterName(item).trim().toLowerCase() === selectedName
      );
    },
    [sessionsWithResolvedCenters, selectedCenterId, centerOptions]
  );
  const selectedSession = useMemo(
    () => filteredSessions.find((item) => String(getSessionId(item)) === String(sessionId)) || null,
    [filteredSessions, sessionId]
  );
  const selectedCenterOption = useMemo(
    () => centerOptions.find((item) => String(item.siteId) === String(selectedCenterId)) || null,
    [centerOptions, selectedCenterId]
  );
  const calendarBaseMonth = calendarMonth || (availableDate ? availableDate.slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  const calendarCursorDate = useMemo(() => new Date(`${calendarBaseMonth}-01T00:00:00`), [calendarBaseMonth]);
  const calendarYear = calendarCursorDate.getFullYear();
  const calendarDays = useMemo(
    () => buildCalendarDays(calendarBaseMonth, availableDates),
    [calendarBaseMonth, availableDates]
  );
  const calendarYearOptions = useMemo(() => {
    const years = availableDates.map((item) => Number(String(item).slice(0, 4))).filter((item) => Number.isInteger(item));
    const fallback = new Date().getFullYear();
    const minYear = years.length ? Math.min(...years) : fallback;
    const maxYear = years.length ? Math.max(...years) : fallback + 1;
    const options: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) options.push(year);
    return options.length ? options : [fallback, fallback + 1];
  }, [availableDates]);
  const bookingMode = useMemo(() => detectBookingMode(balanceInfo), [balanceInfo]);

  function getSessionPayloadId(value: string): number | string | null {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && String(numeric) === raw) {
      return numeric > 0 ? numeric : null;
    }
    return raw;
  }

  function findUrlDeep(value: any, keys: string[]): string {
    if (!value || typeof value !== "object") return "";
    const queue = [value];
    const wanted = new Set(keys.map((key) => key.toLowerCase()));

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;

      for (const [key, item] of Object.entries(current)) {
        if (typeof item === "string") {
          const normalizedKey = key.toLowerCase();
          if (wanted.has(normalizedKey) && /^https?:\/\//i.test(item)) return item;
        } else if (item && typeof item === "object") {
          queue.push(item);
        }
      }
    }

    return "";
  }

  function findValueDeep(value: any, keys: string[]): string {
    if (!value || typeof value !== "object") return "";
    const queue = [value];
    const wanted = new Set(keys.map((key) => key.toLowerCase()));

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object") continue;

      for (const [key, item] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase()) && (typeof item === "string" || typeof item === "number")) {
          return String(item);
        }
        if (item && typeof item === "object") queue.push(item);
      }
    }

    return "";
  }

  function findCheckoutIdDeep(value: any): string {
    if (!value || typeof value !== "object") return "";
    const direct = findValueDeep(value, ["checkout_id", "checkoutId", "checkout_id_value", "checkoutIdValue"]);
    if (direct) return direct;

    const queue: { value: any; parentKey: string }[] = [{ value, parentKey: "" }];
    while (queue.length) {
      const current = queue.shift();
      if (!current?.value || typeof current.value !== "object") continue;

      for (const [key, item] of Object.entries(current.value)) {
        if ((typeof item === "string" || typeof item === "number") && key.toLowerCase() === "id") {
          const parentKey = current.parentKey.toLowerCase();
          const raw = String(item);
          if (parentKey.includes("checkout") || /^[A-F0-9]{16,}\.[\w.-]+$/i.test(raw)) return raw;
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

  function getPaymentUrl(paymentData: any): string {
    return findUrlDeep(paymentData, [
      "checkout_url",
      "checkoutUrl",
      "payment_url",
      "paymentUrl",
      "redirect_url",
      "redirectUrl",
      "url",
    ]);
  }

  function getPaymentResultUrl(paymentData: any): string {
    return findUrlDeep(paymentData, [
      "result_url",
      "resultUrl",
      "shopper_result_url",
      "shopperResultUrl",
      "return_url",
      "returnUrl",
    ]);
  }

  function openPaymentSession(session: { reservationId: string; url: string; checkoutId: string; resultUrl: string }) {
    if (session.url) {
      window.open(session.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (session.checkoutId) {
      const resultUrl = session.resultUrl || `${window.location.origin}/exam/payment/result?reservationId=${encodeURIComponent(session.reservationId)}`;
      const params = new URLSearchParams({
        checkoutId: session.checkoutId,
        reservationId: session.reservationId,
        resultUrl,
      });
      window.open(`/exam/payment?${params.toString()}`, "_blank", "noopener,noreferrer");
    }
  }

  function sanitizeFilePart(value: string, fallback: string) {
    const cleaned = String(value || "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || fallback;
  }

  function getReservationFullName(item: any): string {
    return String(
      item?.full_name ||
      item?.user?.full_name ||
      item?.individual_labor?.full_name ||
      item?.labor?.full_name ||
      item?.profile?.full_name ||
      item?.data?.full_name ||
      ""
    ).trim();
  }

  function getReservationOccupationName(item: any): string {
    return String(
      item?.occupation?.english_name ||
      item?.occupation?.name ||
      item?.exam_session?.occupation?.english_name ||
      item?.exam_session?.occupation?.name ||
      item?.occupation_name ||
      item?.occupation_english_name ||
      selectedOccupation?.name ||
      selectedOccupationId ||
      ""
    ).trim();
  }

  async function getTicketFileName(nextReservationId: string, reservationHint?: any) {
    const candidates: any[] = [];
    const addCandidate = (value: any) => {
      if (!value) return;
      candidates.push(value?.data || value?.exam_reservation || value?.reservation || value);
    };

    addCandidate(reservationHint);
    try {
      addCandidate(await api(`/exam-reservations/${encodeURIComponent(nextReservationId)}?locale=en`));
    } catch {
      // Some SVP deployments do not expose a reservation detail route. The list
      // endpoint below is also what My Bookings uses, so it is the authoritative
      // fallback for the user's name and occupation shown in its PDF filename.
    }

    if (!candidates.some((item) => getReservationFullName(item))) {
      try {
        const listPayload = await api("/exam-reservations?locale=en");
        const listReservation = pickArray(listPayload).find((item) =>
          String(extractId(item, ["id", "reservation_id", "exam_reservation_id"])) === String(nextReservationId)
        );
        addCandidate(listReservation);
      } catch {
        // Keep the creation/detail response and safe filename fallbacks.
      }
    }

    const fullName = sanitizeFilePart(
      candidates.map(getReservationFullName).find(Boolean) || "",
      "SVP User"
    );
    const occupationName = sanitizeFilePart(
      candidates.map(getReservationOccupationName).find(Boolean) || "",
      "Occupation"
    );
    return `${fullName}_${occupationName}_Ticket_${nextReservationId}.pdf`;
  }

  function getSessionDateTimeRaw(item: any): string {
    const deep = findSessionValueDeep(item, [
      "start_at_in_tc_time_zone",
      "start_date_in_tc_time_zone",
      "start_at_in_browser_time_zone",
      "start_date_in_browser_time_zone",
      "start_at",
      "scheduled_at",
      "test_date_time",
      "exam_date_time",
      "datetime",
      "date_time",
    ]);
    if (deep) return deep;

    return String(
      item?.start_at_in_tc_time_zone ||
      item?.start_date_in_tc_time_zone ||
      item?.start_at_in_browser_time_zone ||
      item?.start_date_in_browser_time_zone ||
      item?.start_at ||
      item?.scheduled_at ||
      item?.test_date_time ||
      item?.exam_date_time ||
      item?.exam_session?.start_at_in_tc_time_zone ||
      item?.exam_session?.start_at_in_browser_time_zone ||
      item?.exam_session?.start_at ||
      ""
    ).trim();
  }

  function getSessionTimeRaw(item: any): string {
    const deep = findSessionValueDeep(item, [
      "start_time",
      "test_time",
      "exam_time",
      "session_time",
      "time",
      "start_time_in_browser_time_zone",
      "start_time_in_tc_time_zone",
      "exam_start_time",
      "test_start_time",
    ]);
    if (deep) return deep;

    return String(
      item?.start_time ||
      item?.test_time ||
      item?.exam_time ||
      item?.time ||
      item?.exam_session?.start_time ||
      item?.exam_session?.test_time ||
      ""
    ).trim();
  }

  function findSessionValueDeep(value: any, keys: string[]): string {
    if (!value || typeof value !== "object") return "";
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    const queue = [value];
    const seen = new Set<any>();

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);

      for (const [key, item] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase()) && (typeof item === "string" || typeof item === "number")) {
          const text = String(item).trim();
          if (text) return text;
        }
        if (item && typeof item === "object") queue.push(item);
      }
    }
    return "";
  }

  function findSessionTimeInText(value: any): string {
    if (!value || typeof value !== "object") return "";
    const queue = [value];
    const seen = new Set<any>();
    const timePattern = /\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:AM|PM)?\b|\b(?:1[0-2]|0?[1-9])\s*(?:AM|PM)\b/i;

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);

      for (const item of Object.values(current)) {
        if (typeof item === "string") {
          const match = item.match(timePattern);
          if (match) return match[0];
        } else if (item && typeof item === "object") {
          queue.push(item);
        }
      }
    }
    return "";
  }

  function formatSessionDateTime(item: any): string {
    const dateTimeRaw = getSessionDateTimeRaw(item);
    const timezoneOffset = String(item?.tc_time_zone_offset || item?.exam_session?.tc_time_zone_offset || "").trim();
    if (dateTimeRaw) {
      const normalizedDateTime = dateTimeRaw.replace(" ", "T");
      const parsed = new Date(normalizedDateTime);
      if (!Number.isNaN(parsed.getTime())) {
        const label = parsed.toLocaleString("en-US", {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return timezoneOffset ? `${label} (${timezoneOffset})` : label;
      }
      return timezoneOffset ? `${dateTimeRaw} (${timezoneOffset})` : dateTimeRaw;
    }

    const deepDate = findSessionValueDeep(item, ["test_date", "exam_date", "date", "start_at_date", "session_date"]);
    const dateRaw = normalizeDateValue(String(deepDate || availableDate || ""));
    const timeRaw = getSessionTimeRaw(item) || findSessionTimeInText(item);
    if (!dateRaw && !timeRaw) return "";

    const formattedDate = dateRaw
      ? new Date(`${dateRaw}T00:00:00`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
      : "";
    let formattedTime = timeRaw;
    const timeMatch = timeRaw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (timeMatch) {
      const hours = Number(timeMatch[1]);
      const minutes = Number(timeMatch[2]);
      const suffix = timeMatch[3]?.toUpperCase();
      const date = new Date();
      date.setHours(suffix === "PM" && hours < 12 ? hours + 12 : suffix === "AM" && hours === 12 ? 0 : hours, minutes, 0, 0);
      formattedTime = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    const label = [formattedDate, formattedTime].filter(Boolean).join(" ");
    return label && timezoneOffset ? `${label} (${timezoneOffset})` : label;
  }

  useEffect(() => {
    (async () => {
      setLoadingOccupations(true); setError("");
      try {
        const perPage = 200;
        const all: any[] = [];
        let page = 1;
        // Fetch all pages until we get an empty/short page (max 50 pages safety)
        for (; page <= 50; page++) {
          const data = await api(`/occupations?locale=en&per_page=${perPage}&page=${page}`);
          const arr = pickArray(data);
          if (!arr.length) break;
          all.push(...arr);
          if (arr.length < perPage) break;
        }
        // Dedupe by id
        const seen = new Set<string>();
        const unique = all.filter((it) => {
          const k = String(it?.id ?? "");
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setOccupations(unique.map(normalizeOccupation));
      } catch (err: any) { setError(err?.message || "Failed to load occupations"); }
      finally { setLoadingOccupations(false); }
    })();
  }, []);

  useEffect(() => {
    if (searchParams.get("occupationId")) setSelectedOccupationId(String(searchParams.get("occupationId")));
    if (searchParams.get("categoryId")) setCategoryId(String(searchParams.get("categoryId")));
    if (searchParams.get("languageCode")) setLanguageCode(String(searchParams.get("languageCode")));
    if (searchParams.get("siteCity")) setSelectedCity(String(searchParams.get("siteCity")));
    if (searchParams.get("siteId")) { setSelectedCenterId(String(searchParams.get("siteId"))); setSiteId(String(searchParams.get("siteId"))); }
    if (searchParams.get("siteCity")) setSiteCity(String(searchParams.get("siteCity")));
    if (searchParams.get("examDate")) {
      const examDate = normalizeDateValue(String(searchParams.get("examDate")));
      setAvailableDate(examDate); setCalendarMonth(examDate.slice(0, 7));
    }
    if (searchParams.get("reschedule") === "1") setStatus("Reschedule mode active. Follow the steps to rebook.");
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOccupation) return;
    setCategoryId(String(selectedOccupation.categoryId || ""));
    setLanguageCode((prev) => prev || String(selectedOccupation.languageCodes[0]?.code || ""));
    setMethodology(String(selectedOccupation.methodology || "in_person"));
    setSelectedCity(""); setAvailableDate(""); setAvailableDateEntries([]); setSessions([]);
    setSelectedCenterId(""); setSessionId(""); setHoldId(""); setReservationId("");
    setPaymentSession(null);
  }, [selectedOccupation]);

  useEffect(() => {
    setAvailableDate(""); setSessions([]); setSelectedCenterId(""); setSessionId("");
    setSiteId(""); setSiteCity(selectedCity || ""); setHoldId(""); setReservationId("");
    setPaymentSession(null);
    if (selectedCity) setStatus(`City selected: ${selectedCity}. Loading sessions for the selected date.`);
  }, [selectedCity]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCity) { setCityCenterOptions([]); return; }
      const fallbackRows = fallbackCentersForCity(selectedCity);
      let t2hubRows: { siteId: string; name: string; city: string }[] = [];
      try {
        const live = await api(`/t2hub/test-centers?city=${encodeURIComponent(selectedCity)}&locale=en`);
        t2hubRows = (Array.isArray(live?.sites) ? live.sites : []).map((row: any) => ({
          siteId: String(row.id || row.center || ""),
          name: String(row.name || row.city || `Site #${row.id || row.center || ""}`),
          city: String(row.raw_city || row.division || selectedCity),
        })).filter((row) => row.siteId && row.name);
      } catch {
        t2hubRows = [];
      }
      const { data } = await supabase
        .from("test_centers")
        .select("site_id, name, city")
        .eq("city", selectedCity)
        .order("name", { ascending: true });
      if (!active) return;
      const merged = new Map<string, { siteId: string; name: string; city: string }>();
      fallbackRows.forEach((row) => merged.set(row.siteId, row));
      t2hubRows.forEach((row) => merged.set(row.siteId, row));
      (data || []).forEach((row: any) => {
        const siteId = String(row.site_id);
        merged.set(siteId, {
          siteId,
          name: String(row.name || `Site #${row.site_id}`),
          city: String(row.city || selectedCity),
        });
      });
      setCityCenterOptions(Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => { active = false; };
  }, [selectedCity]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setAvailableDateEntries([]); setAvailableDate(""); return; }
      setLoadingDates(true); setError("");
      try {
        const params = new URLSearchParams({
          per_page: "1000", category_id: String(categoryId),
          start_at_date_from: normalizeDateValue(new Date().toISOString()),
          available_seats: "greater_than::0", status: "scheduled", locale: "en",
        });
        const data = await api(`/available-dates?${params.toString()}`);
        if (!active) return;
        const entries = normalizeAvailableDateEntries(pickArray(data));
        const cities = buildCityOptions(entries);
        setAvailableDateEntries(entries);
        setSelectedCity((prev) => (prev && cities.includes(prev) ? prev : cities[0] || ""));
      } catch (err: any) { if (!active) return; setAvailableDateEntries([]); setError(err?.message || "Failed to load available dates"); }
      finally { if (active) setLoadingDates(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, categoryId]);

  useEffect(() => {
    setAvailableDate((prev) => (prev && availableDates.includes(prev) ? prev : availableDates[0] || ""));
    setCalendarMonth(availableDates[0] ? availableDates[0].slice(0, 7) : normalizeDateValue(new Date().toISOString()).slice(0, 7));
  }, [availableDates]);

  useEffect(() => { if (!selectedCity || !availableDates.length) setIsDatePickerOpen(false); }, [selectedCity, availableDates.length]);

  useEffect(() => {
    if (!isDatePickerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsDatePickerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDatePickerOpen]);

  // Close occupation dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (occupationRef.current && !occupationRef.current.contains(e.target as Node)) setIsOccupationOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedOccupationId) { setBalanceInfo(null); return; }
      setLoadingBalance(true);
      try {
        const params = new URLSearchParams({ methodology_type: methodology || "in_person", occupation_id: String(selectedOccupationId), locale: "en" });
        const data = await api(`/user-balance?${params.toString()}`);
        if (!active) return; setBalanceInfo(data);
      } catch { if (!active) return; setBalanceInfo(null); }
      finally { if (active) setLoadingBalance(false); }
    })();
    return () => { active = false; };
  }, [selectedOccupationId, methodology]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!selectedCity || !availableDate || !categoryId) { setSessions([]); return; }
      setLoadingSessions(true); setError("");
      try {
        const params = new URLSearchParams({ category_id: String(categoryId), city: String(selectedCity), exam_date: availableDate, locale: "en" });
        let data: any;
        try {
          data = await api(`/t2hub/pacc-exam-sessions?${params.toString()}`);
        } catch {
          data = await api(`/exam-sessions?${params.toString()}`);
        }
        if (!active) return; setSessions(pickArray(data));
      } catch (err: any) { if (!active) return; setSessions([]); setError(err?.message || "Failed to load test sessions"); }
      finally { if (active) setLoadingSessions(false); }
    })();
    return () => { active = false; };
  }, [selectedCity, availableDate, categoryId]);

  // Admin-defined exam_session_id -> site_id mapping (deterministic).
  // Loaded from Lovable Cloud whenever sessions change. Also fetches the
  // matching test_centers row so we have the canonical center NAME for each
  // admin-mapped site_id (stored under `site:<siteId>` in testCenterMap).
  useEffect(() => {
    if (!sessions.length) return;
    let active = true;
    (async () => {
      // Prefer the stable numeric_session_id (present on T2Hub-sourced sessions)
      // over getSessionId(), which returns the encrypted_session_id token when
      // present — Number(encryptedToken) is always NaN, so the old code silently
      // dropped every session here whenever SVP's own encrypted ID was used.
      // Official SVP-direct sessions have no stable numeric ID at all (confirmed
      // from live response shape), so admin exact-mapping can only ever apply to
      // T2Hub-sourced sessions — that's an architecture limit, not a bug to "fix" further.
      const ids = Array.from(new Set(sessions.map((s: any) => Number(s?.numeric_session_id ?? getSessionId(s))).filter((n) => Number.isFinite(n) && n > 0)));
      if (!ids.length) return;
      const { data: maps } = await supabase
        .from("exam_session_centers")
        .select("exam_session_id, site_id")
        .in("exam_session_id", ids);
      if (!active || !maps?.length) return;
      const newSessionMap = new Map(sessionIdToSiteId);
      let sessionMapChanged = false;
      maps.forEach((row: any) => {
        const k = String(row.exam_session_id);
        const v = String(row.site_id);
        if (newSessionMap.get(k) !== v) { newSessionMap.set(k, v); sessionMapChanged = true; }
      });
      const siteIds = Array.from(new Set(maps.map((r: any) => Number(r.site_id))));
      const { data: centers } = await supabase
        .from("test_centers")
        .select("site_id, name")
        .in("site_id", siteIds);
      if (!active) return;
      const newTcMap = new Map(testCenterMap);
      const newNameMap = new Map(centerNameToSiteId);
      let tcChanged = false;
      let nameChanged = false;
      centers?.forEach((row: any) => {
        const siteKey = `site:${row.site_id}`;
        if (newTcMap.get(siteKey) !== row.name) { newTcMap.set(siteKey, row.name); tcChanged = true; }
        const nk = String(row.name || "").trim().toLowerCase();
        if (nk && newNameMap.get(nk) !== String(row.site_id)) { newNameMap.set(nk, String(row.site_id)); nameChanged = true; }
      });
      if (sessionMapChanged) setSessionIdToSiteId(newSessionMap);
      if (tcChanged) setTestCenterMap(newTcMap);
      if (nameChanged) setCenterNameToSiteId(newNameMap);
    })();
    return () => { active = false; };
  }, [sessions]);

  // Load all section center rules once. Also pre-load test_centers names for rule sites.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: rules } = await supabase
        .from("section_center_rules")
        .select("id, city, category_id, section, site_id, priority");
      if (!active || !rules) return;
      setSectionRules(rules as SectionCenterRule[]);
      const siteIds = Array.from(new Set(rules.map((r: any) => Number(r.site_id)).filter((n) => Number.isFinite(n))));
      if (!siteIds.length) return;
      const { data: centers } = await supabase
        .from("test_centers").select("site_id, name").in("site_id", siteIds);
      if (!active || !centers) return;
      setTestCenterMap((prev) => {
        const next = new Map(prev);
        let changed = false;
        centers.forEach((row: any) => {
          const k = `site:${row.site_id}`;
          if (next.get(k) !== row.name) { next.set(k, row.name); changed = true; }
        });
        return changed ? next : prev;
      });
      setCenterNameToSiteId((prev) => {
        const next = new Map(prev);
        let changed = false;
        centers.forEach((row: any) => {
          const k = String(row.name || "").trim().toLowerCase();
          if (k && next.get(k) !== String(row.site_id)) { next.set(k, String(row.site_id)); changed = true; }
        });
        return changed ? next : prev;
      });
    })();
    return () => { active = false; };
  }, []);

  // Resolve real test center names: prefer SVP exam_session detail (test_center.name),
  // fall back to local DB by site_id. Key map by the same key buildCenterOptions uses.
  useEffect(() => {
    if (!sessions.length) return;
    let active = true;
    (async () => {
      const newMap = new Map(testCenterMap);
      let changed = false;

      // 1. Fetch /exam-sessions/:id and map the real test_center.name per exam_session_id.
      const needDetail = sessions.filter((s: any) => {
        const key = String(getCenterKey(s));
        if (!key || newMap.has(key)) return false;
        return true;
      });
      const uniqueIds = Array.from(new Set(needDetail.map((s: any) => String(getSessionId(s))).filter(Boolean)));
      await Promise.all(uniqueIds.map(async (id) => {
        try {
          const detail: any = await api(`/exam-sessions/${encodeURIComponent(id)}?locale=en`);
          const node = detail?.exam_session || detail?.data?.exam_session || detail?.data || detail;
          const tc = node?.test_center;
          const name = tc?.name || tc?.test_center_name || node?.test_center_name;
          if (!name) return;
          const sess = sessions.find((s: any) => String(getSessionId(s)) === id);
          const sessionKey = `session:${id}`;
          if (!newMap.has(sessionKey)) { newMap.set(sessionKey, name); changed = true; }
          const key = String(getCenterKey(sess));
          if (key && !newMap.has(key)) { newMap.set(key, name); changed = true; }
          const detailKey = String(getCenterKey({ ...sess, ...node, test_center: { ...sess?.test_center, ...tc } }));
          if (detailKey && !newMap.has(detailKey)) { newMap.set(detailKey, name); changed = true; }
        } catch {}
      }));

      // 2. Fallback: query local DB by site_id for any still-missing entries.
      const sessionCandidateIds = (s: any): number[] => {
        const ids = [
          s?.site_id,
          s?.test_center?.site_id,
          s?.test_center?.id,
          s?.test_center?.test_center_id,
          s?.test_center_id,
        ].map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
        return Array.from(new Set(ids));
      };
      const dbMissing = Array.from(new Set(
        sessions.flatMap((s: any) => {
          const key = String(getCenterKey(s));
          if (!key || newMap.has(key)) return [];
          return sessionCandidateIds(s);
        })
      ));
      if (dbMissing.length) {
        const { data } = await supabase.from("test_centers").select("site_id, name").in("site_id", dbMissing);
        data?.forEach((row: any) => {
          sessions.forEach((s: any) => {
            if (sessionCandidateIds(s).includes(Number(row.site_id))) {
              const key = String(getCenterKey(s));
              if (key && !newMap.has(key)) { newMap.set(key, row.name); changed = true; }
            }
          });
        });
      }

      // 3. Final fallback: query local DB by city only when that city maps to a
      //    single configured center. Multi-center cities are ambiguous, so a
      //    city-only guess would show the wrong center name/site_id.
      const cityMissing = Array.from(new Set(
        sessions
          .filter((s: any) => {
            const key = String(getCenterKey(s));
            const sessionKey = `session:${getSessionId(s)}`;
            return !newMap.has(sessionKey) && (!key || !newMap.has(key));
          })
          .map((s: any) => String(getSessionSiteCity(s)).trim())
          .filter(Boolean)
      ));
      if (cityMissing.length) {
        const { data } = await supabase.from("test_centers").select("name, city").in("city", cityMissing);
        const byCity = new Map<string, string>();
        const cityCounts = new Map<string, number>();
        data?.forEach((row: any) => {
          const c = String(row.city || "").trim().toLowerCase();
          if (!c) return;
          cityCounts.set(c, (cityCounts.get(c) || 0) + 1);
          if (!byCity.has(c)) byCity.set(c, row.name);
        });
        for (const [city, count] of cityCounts) {
          if (count !== 1) byCity.delete(city);
        }
        sessions.forEach((s: any) => {
          const key = String(getCenterKey(s));
          const sessionKey = `session:${getSessionId(s)}`;
          if (newMap.has(sessionKey)) return;
          const c = String(getSessionSiteCity(s)).trim().toLowerCase();
          const name = byCity.get(c);
          if (!name) return;
          if (!newMap.has(sessionKey)) { newMap.set(sessionKey, name); changed = true; }
          if (key && !newMap.has(key)) { newMap.set(key, name); changed = true; }
        });
      }

      // 4. Build a name -> site_id lookup from local DB for every resolved
      //    center name. This lets us stamp site_id onto sessions even when
      //    SVP returns site_id=null (the API just gives us the name).
      const resolvedNames = Array.from(new Set(
        Array.from(newMap.values()).map((n) => String(n || "").trim()).filter(Boolean)
      ));
      const newSiteIdMap = new Map(centerNameToSiteId);
      let siteIdChanged = false;
      const missingNames = resolvedNames.filter((n) => !newSiteIdMap.has(n.toLowerCase()));
      if (missingNames.length) {
        const { data: rows } = await supabase.from("test_centers").select("site_id, name").in("name", missingNames);
        rows?.forEach((row: any) => {
          const k = String(row.name || "").trim().toLowerCase();
          if (k && !newSiteIdMap.has(k)) { newSiteIdMap.set(k, String(row.site_id)); siteIdChanged = true; }
        });
      }

      if (active && changed) setTestCenterMap(newMap);
      if (active && siteIdChanged) setCenterNameToSiteId(newSiteIdMap);
    })();
    return () => { active = false; };
  }, [sessions]);

  useEffect(() => {
    if (!centerOptions.length) { setSelectedCenterId(""); return; }
    const hasSelected = centerOptions.some((item) => String(item.siteId) === String(selectedCenterId));
    if (!selectedCenterId || !hasSelected) setSelectedCenterId(String(centerOptions[0].siteId));
  }, [centerOptions, selectedCenterId]);

  useEffect(() => {
    if (!filteredSessions.length) { setSessionId(""); return; }
    const hasSelected = filteredSessions.some((item) => String(getSessionId(item)) === String(sessionId));
    if (!sessionId || !hasSelected) setSessionId(String(getSessionId(filteredSessions[0])));
  }, [filteredSessions, sessionId]);

  useEffect(() => {
    if (selectedCenterOption) { setSiteId(String(selectedCenterOption.siteId || "")); setSiteCity(String(selectedCenterOption.city || "")); }
  }, [selectedCenterOption]);

  useEffect(() => {
    if (!selectedSession) return;
    const sessionSiteId = String(getSessionSiteId(selectedSession) || "");
    if (sessionSiteId && sessionSiteId === String(selectedCenterId)) {
      setSiteId(sessionSiteId);
    }
    setSiteCity(String(getSessionSiteCity(selectedSession) || ""));
    const codes = getPrometricCodes(selectedSession);
    if (codes[0]?.code || codes[0]?.language_code) setLanguageCode(String(codes[0].code || codes[0].language_code));
  }, [selectedSession, selectedCenterId]);

  // Fetch session detail (status + seats) for the selected session
  useEffect(() => {
    let active = true;
    (async () => {
      if (!sessionId) { setLiveAvailableSeats(null); setLoadingSeats(false); setSessionDetail(null); return; }
      setLoadingSeats(true);
      const findSeats = (payload: any): number | null => {
        const findInNode = (n: any): number | null => {
          if (!n || typeof n !== "object") return null;
          const es = n.exam_session;
          if (es && String(es.id) === String(sessionId)) {
            const s = es.available_seats ?? es.seats_available ?? es.remaining_seats;
            if (s != null) return Number(s);
          }
          if (String(n.id) === String(sessionId)) {
            const s = n.available_seats ?? n.seats_available ?? n.remaining_seats;
            if (s != null) return Number(s);
          }
          return null;
        };
        const arr = pickArray(payload);
        for (const it of arr) { const v = findInNode(it); if (v != null) return v; }
        const direct = findInNode(payload?.data || payload?.exam_session || payload);
        return direct;
      };
      try {
        let seats: number | null = null;
        // getExamSessionById equivalent — primary source of truth for status + seats
        try {
          const r0: any = await api(`/exam-sessions/${encodeURIComponent(sessionId)}?locale=en`);
          if (active) {
            const node = r0?.exam_session || r0?.data?.exam_session || r0?.data || r0;
            setSessionDetail(node);
          }
          seats = findSeats(r0);
        } catch {}
        if (seats == null) {
          try {
            const r1: any = await api(`/exam-reservations?locale=en&exam_session_id=${encodeURIComponent(sessionId)}`);
            seats = findSeats(r1);
          } catch {}
        }
        if (seats == null) {
          try {
            const r2: any = await api(`/exam-session/${encodeURIComponent(sessionId)}?locale=en`);
            seats = findSeats(r2);
          } catch {}
        }
        if (!active) return;
        if (seats == null) {
          const fallback = (selectedSession as any)?.available_seats ?? (selectedSession as any)?.seats_available;
          seats = fallback != null ? Number(fallback) : null;
        }
        setLiveAvailableSeats(seats);
      } catch {
        if (!active) return;
        const fallback = (selectedSession as any)?.available_seats ?? (selectedSession as any)?.seats_available;
        setLiveAvailableSeats(fallback != null ? Number(fallback) : null);
      } finally {
        if (active) setLoadingSeats(false);
      }
    })();
    return () => { active = false; };
  }, [sessionId, selectedSession]);

  async function createHold() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    // Only hold the SELECTED session, not every session in the city.
    // Holding the whole city would let SVP confirm a different test center
    // when the booking POST is made with hold_id, because the hold covers
    // multiple distinct centers in the same city.
    const selectedSessionId = getSessionPayloadId(getSessionId(selectedSession) || sessionId);
    if (selectedSessionId === null) {
      setError("No valid exam session selected for hold creation");
      return;
    }
    const sessionIds = [selectedSessionId];
    setCreatingHold(true); setError(""); setStatus("");
    try {
      const data = await api("/temporary-seats", { method: "POST", body: { exam_session_id: sessionIds, methodology: methodology || "in_person" } });
      const nextHoldId = extractId(data, ["id", "hold_id", "temporary_seat_id"]);
      setHoldId(String(nextHoldId || ""));
      setStatus(nextHoldId ? `Hold created: #${nextHoldId}` : "Hold created");
    } catch (err: any) { setError(err?.message || "Failed to create hold"); }
    finally { setCreatingHold(false); }
  }

  async function bookReservation() {
    if (!sessionId) { setError("Select test center / session first"); return; }
    const selectedSessionPayloadId = getSessionPayloadId(getSessionId(selectedSession) || sessionId);
    if (selectedSessionPayloadId === null) { setError("No valid exam session selected"); return; }
    const selectedSessionIdForApi = String(selectedSessionPayloadId);
    try { await api(`/exam-session/${encodeURIComponent(selectedSessionIdForApi)}?locale=en`); }
    catch (err: any) { setError(err?.message || "Selected exam session is no longer available"); return; }
    const sessionCodes = getPrometricCodes(selectedSession);
    const effectiveLanguageCode = languageCode || selectedOccupation?.languageCodes?.[0]?.code || sessionCodes?.[0]?.code || sessionCodes?.[0]?.language_code || "";
    if (!effectiveLanguageCode) { setError("language_code is required. Select a language before booking."); return; }

    // For reschedule, ensure we use the prometric code (e.g. "LOABB") not ISO code (e.g. "bn")
    let rescheduleLanguageCode = effectiveLanguageCode;
    if (searchParams.get("reschedule") === "1" && selectedOccupation?.languageCodes?.length) {
      // If the current code looks like an ISO code (2-3 chars), find the matching prometric code
      if (effectiveLanguageCode.length <= 3) {
        const match = selectedOccupation.languageCodes.find(
          (lc: any) => lc.code?.toLowerCase() !== effectiveLanguageCode.toLowerCase() && effectiveLanguageCode.length <= 3
        );
        // Actually search by checking if any prometric code's raw data has this language_code
        const allCodes = selectedOccupation?.raw?.category?.prometric_codes || selectedOccupation?.raw?.prometric_codes || [];
        const prometricMatch = allCodes.find((c: any) => c?.language_code === effectiveLanguageCode);
        if (prometricMatch?.code) rescheduleLanguageCode = prometricMatch.code;
      }
    }

    setBooking(true); setError(""); setStatus("");
    try {
      const oldReservationId = searchParams.get("reservationId");
      const isReschedule = searchParams.get("reschedule") === "1" && oldReservationId;

      if (isReschedule) {
        // Use the dedicated reschedule endpoint
        setStatus("Rescheduling reservation...");
        const data = await api(`/exam-reservations/${encodeURIComponent(oldReservationId)}/reschedule`, {
          method: "POST",
          body: {
            id: Number(oldReservationId),
            exam_session_id: selectedSessionPayloadId,
            language_code: rescheduleLanguageCode,
          },
        });
        const nextReservationId = extractId(data, ["id", "reservation_id", "exam_reservation_id"]) || oldReservationId;
        setReservationId(String(nextReservationId || ""));
        setStatus(`Reservation rescheduled successfully: #${nextReservationId}`);
        if (nextReservationId) await openTicketPdf(String(nextReservationId), data);
      } else {
        // Normal new booking.
        //
        // CRITICAL: Match the official SVP frontend (svp-international.pacc.sa) behaviour
        // EXACTLY — it sends `site_id: null`, `site_city: null`, `hold_id: null` and lets
        // the SVP server determine the test center from `exam_session_id`.
        //
        // If we send a `site_id`/`site_city` (e.g. an admin-mapped fallback like
        // site_id=1), SVP treats that as an override and may confirm the booking
        // in a DIFFERENT centre within the same city than the one the user picked.
        // Likewise, `hold_id` is left null here so the reservation binds purely to
        // the chosen `exam_session_id` (the temporary seat hold above is informational
        // only — SVP's own UI never forwards hold_id into the reservation POST).
        const data: any = await api("/exam-reservations", {
          method: "POST", body: {
            exam_session_id: selectedSessionPayloadId, occupation_id: Number(selectedOccupationId),
            methodology: methodology || "in_person", language_code: effectiveLanguageCode,
            site_id: null, site_city: null, hold_id: null,
          },
        });
        const nextReservationId = extractId(data, ["id", "reservation_id", "exam_reservation_id"]);
        setReservationId(String(nextReservationId || ""));
        // Update live seats from response if present
        const respSeats = data?.exam_session?.available_seats ?? data?.data?.exam_session?.available_seats;
        if (respSeats != null && String(data?.exam_session?.id ?? data?.data?.exam_session?.id) === String(sessionId)) {
          setLiveAvailableSeats(Number(respSeats));
        }
        if (nextReservationId && bookingMode.type === "reservation_credit") {
          try {
            await api("/reservation-credits/use", {
              method: "POST",
              body: {
                methodology_type: methodology || "in_person",
                reservation_id: Number(nextReservationId),
                occupation_id: Number(selectedOccupationId),
              },
            });
          } catch (creditErr: any) {
            console.warn("reservation-credits/use failed after booking (continuing):", creditErr?.message);
          }
        }
        setStatus(nextReservationId ? `Reservation confirmed: #${nextReservationId}` : "Reservation created");
        if (nextReservationId) {
          if (bookingMode.type === "paid") {
            await openPaymentPage(String(nextReservationId));
          } else if (hasPermission("reservation.manage")) {
            await openTicketPdf(String(nextReservationId), data);
          }
        }
      }
    } catch (err: any) { setError(err?.message || "Failed to book reservation"); }
    finally { setBooking(false); }
  }

  async function openPaymentPage(nextReservationId: string) {
    setStatus(`Reservation confirmed: #${nextReservationId}. Opening official payment page...`);

    try {
      await api("/payments-validate-pending?locale=en");
    } catch (err: any) {
      console.warn("payments/validate_pending failed before payment creation (continuing):", err?.message);
    }

    const paymentData: any = await api("/payments", {
      method: "POST",
      body: {
        payment: {
          payment_method: "card",
          payable_type: "Reservation",
          payable_id: Number(nextReservationId),
        },
      },
    });

    const paymentUrl = getPaymentUrl(paymentData);
    const checkoutId = findCheckoutIdDeep(paymentData);
    const resultUrl = getPaymentResultUrl(paymentData) || `${window.location.origin}/exam/payment/result?reservationId=${encodeURIComponent(nextReservationId)}`;
    const nextPaymentSession = {
      reservationId: nextReservationId,
      url: paymentUrl,
      checkoutId,
      resultUrl,
    };
    setPaymentSession(paymentUrl || checkoutId ? nextPaymentSession : null);

    if (paymentUrl || checkoutId) {
      openPaymentSession(nextPaymentSession);
      setStatus(`Reservation confirmed: #${nextReservationId}. Complete payment in the payment tab.`);
      return;
    }

    setStatus(
      `Reservation confirmed: #${nextReservationId}. Payment could not be opened because no official payment URL or checkout ID was returned.`
    );
  }

  async function openTicketPdf(nextReservationId: string, reservationHint?: any) {
    const { accessToken } = getSession();
    const base = getBackendUrl();
    const response = await fetch(`${base}${getProxyPrefix()}/tickets/${encodeURIComponent(nextReservationId)}/show-pdf?locale=en`, {
      method: "GET", headers: {
        Accept: "*/*",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(localStorage.getItem("access_token") ? { "X-Access-Token": localStorage.getItem("access_token")! } : {}),
      },
    });
    if (!response.ok) { throw new Error(await response.text() || "Failed to open ticket PDF"); }
    const contentType = response.headers.get("content-type") || "";
    const fileName = await getTicketFileName(nextReservationId, reservationHint);
    function triggerDownload(href: string, name: string) {
      const anchor = document.createElement("a"); anchor.href = href; anchor.download = name;
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
    }
    if (contentType.includes("application/json")) {
      const data = await response.json();
      const url = data?.url || data?.pdf_url || data?.data?.url || data?.data?.pdf_url;
      if (url) { triggerDownload(String(url), fileName); return; }
      throw new Error("Ticket PDF URL not found in response");
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }

  function shiftCalendarMonth(delta: number) {
    const base = new Date(`${calendarBaseMonth}-01T00:00:00`);
    base.setMonth(base.getMonth() + delta);
    setCalendarMonth(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`);
  }

  function pickDateFromCalendar(nextDate: string) {
    setAvailableDate(nextDate); setCalendarMonth(nextDate.slice(0, 7)); setIsDatePickerOpen(false);
  }

  const isReschedule = searchParams.get("reschedule") === "1";
  const stepOccupationDone = Boolean(selectedOccupationId);
  const stepCityDateDone = stepOccupationDone && Boolean(selectedCity && availableDate);
  const stepCenterSessionDone = stepCityDateDone && Boolean(selectedCenterId && sessionId);
  const stepReady = stepCenterSessionDone && Boolean(languageCode);

  function stepClass(done: boolean, active: boolean) {
    return `bk-step${done ? " bk-step--done" : ""}${active ? " bk-step--active" : ""}`;
  }

  return (
    <div className="bk-shell">
      <div className="bk-container">
        {/* Hero */}
        <section className="bk-hero">
          <div className="bk-hero-row">
            <div>
              <span className="bk-hero-eyebrow">{isReschedule ? "Reschedule reservation" : "New booking"}</span>
              <h1>{isReschedule ? "Reschedule your exam" : "Create a new"} <em>booking</em></h1>
              <p>Choose your occupation, city, date and test centre. Every step syncs live with the SVP platform to keep seats accurate.</p>
            </div>
            <div className="bk-hero-links">
              {hasPermission("reservation.manage") && <Link to="/exam/reservations" className="bk-hero-link">☰ My bookings</Link>}
              <Link to="/dashboard" className="bk-hero-link">◈ Dashboard</Link>
              <Link to="/dashboard" className="bk-hero-link bk-hero-link--close" aria-label="Close">×</Link>
            </div>
          </div>
        </section>

        {/* Progress steps */}
        <section className="bk-steps" aria-label="Booking progress">
          <div className={stepClass(stepOccupationDone, !stepOccupationDone)}>
            <div className="bk-step-num">1</div>
            <div className="bk-step-copy"><small>Step 1</small><span>Occupation</span></div>
          </div>
          <div className={stepClass(stepCityDateDone, stepOccupationDone && !stepCityDateDone)}>
            <div className="bk-step-num">2</div>
            <div className="bk-step-copy"><small>Step 2</small><span>City &amp; date</span></div>
          </div>
          <div className={stepClass(stepCenterSessionDone, stepCityDateDone && !stepCenterSessionDone)}>
            <div className="bk-step-num">3</div>
            <div className="bk-step-copy"><small>Step 3</small><span>Centre &amp; session</span></div>
          </div>
          <div className={stepClass(stepReady, stepCenterSessionDone && !stepReady)}>
            <div className="bk-step-num">4</div>
            <div className="bk-step-copy"><small>Step 4</small><span>Confirm &amp; pay</span></div>
          </div>
        </section>

        {status ? <div className="bk-notice bk-notice--ok">{status}</div> : null}
        {error ? <div className="bk-notice bk-notice--error">{error}</div> : null}

        {/* Booking form */}
        <section className="bk-panel">
          <div className="bk-panel-head">
            <div>
              <h2>Booking details</h2>
              <p>Fields marked with <b style={{ color: "var(--bk-gold)" }}>*</b> are required.</p>
            </div>
          </div>

          <div className="bk-form-grid">
            <div className="bk-field">
              <span className="bk-field-label">Category ID</span>
              <div className="bk-readonly">{categoryId || "—"}</div>
            </div>
            <div className="bk-field">
              <span className="bk-field-label">Methodology</span>
              <div className="bk-readonly">{methodology}</div>
            </div>

            <div className="bk-field bk-field--wide" ref={occupationRef}>
              <span className="bk-field-label">Occupation <b>*</b></span>
              <button type="button" className="bk-input bk-trigger" onClick={() => setIsOccupationOpen((p) => !p)}>
                <span className={selectedOccupation ? "" : "bk-placeholder"}>
                  {selectedOccupation ? selectedOccupation.name : (loadingOccupations ? "Loading occupations…" : "Select occupation")}
                </span>
                <span className="bk-trigger-icon">▾</span>
              </button>
              {isOccupationOpen && (
                <div className="bk-popup">
                  <input
                    type="text"
                    className="bk-popup-search"
                    placeholder="Search occupation…"
                    value={occupationSearch}
                    onChange={(e) => setOccupationSearch(e.target.value)}
                    autoFocus
                  />
                  <div className="bk-popup-list">
                    {filteredOccupations.length === 0 && (
                      <div className="bk-popup-empty">No results found</div>
                    )}
                    {filteredOccupations.map((item) => (
                      <button key={item.id} type="button"
                        className={`bk-popup-item${String(item.id) === String(selectedOccupationId) ? " bk-popup-item--active" : ""}`}
                        onClick={() => { setSelectedOccupationId(String(item.id)); setIsOccupationOpen(false); setOccupationSearch(""); }}>
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bk-field">
              <span className="bk-field-label">City <b>*</b></span>
              <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} disabled={!selectedOccupationId}>
                <option value="">Select city</option>
                {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="bk-field">
              <span className="bk-field-label">Available date <b>*</b></span>
              <button type="button" className="bk-input bk-trigger" onClick={() => setIsDatePickerOpen((prev) => !prev)}
                disabled={loadingDates || !availableDates.length || !selectedCity}>
                <span className={availableDate ? "" : "bk-placeholder"}>
                  {availableDate ? formatDateLabel(availableDate) : (selectedCity ? "Select available date…" : "Select city first")}
                </span>
                <CalendarDays className="bk-trigger-icon" size={17} aria-hidden="true" />
              </button>
              {isDatePickerOpen && selectedCity && availableDates.length ? (
                createPortal(
                  <div className="bk-calendar-overlay" onMouseDown={() => setIsDatePickerOpen(false)}>
                    <div
                      className="bk-popup bk-date-popup"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Select available date"
                      onMouseDown={(event) => event.stopPropagation()}
                    >
                      <div className="bk-date-head">
                        <div>
                          <strong>Select available date</strong>
                          <small>{selectedCity}</small>
                        </div>
                        <button type="button" className="bk-icon-btn" aria-label="Close calendar" onClick={() => setIsDatePickerOpen(false)}>
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="bk-date-tools">
                        <button type="button" className="bk-icon-btn" aria-label="Previous month" onClick={() => shiftCalendarMonth(-1)}>
                          <ChevronLeft size={17} aria-hidden="true" />
                        </button>
                        <select className="bk-tool-select bk-tool-select--month" aria-label="Calendar month" value={calendarCursorDate.getMonth()}
                          onChange={(e) => { const next = new Date(calendarCursorDate); next.setMonth(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2000, index, 1).toLocaleDateString("en-US", { month: "long" })}</option>)}
                        </select>
                        <select className="bk-tool-select bk-tool-select--year" aria-label="Calendar year" value={calendarYear}
                          onChange={(e) => { const next = new Date(calendarCursorDate); next.setFullYear(Number(e.target.value)); setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`); }}>
                          {calendarYearOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <button type="button" className="bk-icon-btn" aria-label="Next month" onClick={() => shiftCalendarMonth(1)}>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="bk-weekdays">
                        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                      </div>
                      <div className="bk-calendar">
                        {calendarDays.map((item) =>
                          item.empty ? <div key={item.key} className="bk-cell bk-cell--empty" /> : (
                            <button key={item.key} type="button"
                              className={`bk-cell${item.available ? " bk-cell--available" : ""}${item.iso === availableDate ? " bk-cell--active" : ""}`}
                              onClick={() => item.available && pickDateFromCalendar(item.iso!)} disabled={!item.available}>
                              {item.day}
                            </button>
                          )
                        )}
                      </div>
                      <p className="bk-date-help">Only highlighted dates are available. Selecting a date closes this calendar automatically.</p>
                    </div>
                  </div>,
                  document.body,
                )
              ) : null}
              {!loadingDates && selectedCity && !availableDates.length ? (
                <small className="bk-error-text">No available dates found yet. Try another city or occupation.</small>
              ) : null}
            </div>

            <div className="bk-field">
              <span className="bk-field-label">Test centre <b>*</b></span>
              <select value={selectedCenterId} onChange={(e) => setSelectedCenterId(e.target.value)} disabled={!centerOptions.length}>
                <option value="">{loadingSessions ? "Loading centres…" : "Select test centre"}</option>
                {centerOptions.map((item) => <option key={item.siteId} value={item.siteId}>{item.name} (Site #{item.siteId})</option>)}
              </select>
            </div>

            <div className="bk-field">
              <span className="bk-field-label">Exam session <b>*</b></span>
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!filteredSessions.length}>
                <option value="">{loadingSessions ? "Loading sessions…" : "Select session"}</option>
                {filteredSessions.map((item) => {
                  const sid = getSessionSiteId(item);
                  const realName = getResolvedSessionCenterName(item);
                  const seats = item?.available_seats ?? item?.seats_available ?? item?.remaining_seats ?? null;
                  const dateTimeLabel = formatSessionDateTime(item);
                  return (
                    <option key={getSessionId(item)} value={getSessionId(item)}>
                      {realName}{sid ? ` (Site #${sid})` : ""}{dateTimeLabel ? ` | ${dateTimeLabel}` : ""}{seats !== null && seats !== undefined ? ` | Seats: ${seats}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="bk-field">
              <span className="bk-field-label">Language <b>*</b></span>
              <select value={languageCode} onChange={(e) => setLanguageCode(e.target.value)}>
                <option value="">Select language</option>
                {selectedOccupation?.languageCodes.map((item: any, idx: number) => (
                  <option key={`${item.code}-${idx}`} value={item.code}>{item.englishName} {item.code ? `(${item.code})` : ""}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Booking summary */}
        <section className="bk-panel">
          <div className="bk-panel-head">
            <div>
              <h2>Booking summary</h2>
              <p>Live data from SVP — updates as you change your selections.</p>
            </div>
          </div>

          <div className="bk-meta">
            <div className="bk-meta-row"><span>Booking type</span><strong className="bk-highlight">{loadingBalance ? "Checking…" : bookingMode.label}</strong></div>
            <div className="bk-meta-row"><span>Reservation credits</span><strong>{loadingBalance ? "-" : bookingMode.reservationCredits}</strong></div>
            <div className="bk-meta-row"><span>Free certificates</span><strong>{loadingBalance ? "-" : bookingMode.freeCertificates}</strong></div>
            <div className="bk-meta-row"><span>Available seats</span><strong>{loadingSeats ? "Loading…" : (liveAvailableSeats !== null ? liveAvailableSeats : (selectedSession ? (selectedSession.available_seats ?? selectedSession.seats_available ?? "-") : "-"))}</strong></div>
            <div className="bk-meta-row"><span>City</span><strong>{siteCity || selectedCity || "-"}</strong></div>
            <div className="bk-meta-row"><span>Site ID</span><strong>{siteId || "-"}</strong></div>
            <div className="bk-meta-row"><span>Test centre ID</span><strong>{
              extractTestCenterId(selectedSession) || extractTestCenterId(sessionDetail) || siteId || "-"
            }</strong></div>
            <div className="bk-meta-row"><span>Test centre</span><strong>{selectedSession ? getResolvedSessionCenterName(selectedSession) : (selectedCenterOption?.name || "-")}</strong></div>
            <div className="bk-meta-row"><span>Session status</span><strong>{loadingSeats ? "Loading…" : (sessionDetail?.status || "-")}</strong></div>
            <div className="bk-meta-row"><span>Hold ID</span><strong>{holdId || "-"}</strong></div>
            <div className="bk-meta-row"><span>Booking no.</span><strong className="bk-highlight">{reservationId || "-"}</strong></div>
          </div>
        </section>

        {/* Actions */}
        <section className="bk-actions">
          <button className="bk-btn bk-btn--ghost" type="button" onClick={createHold} disabled={creatingHold || !sessionId}>
            {creatingHold ? "Creating hold…" : "Create hold"}
          </button>
          {paymentSession ? (
            <button className="bk-btn bk-btn--primary" type="button" onClick={() => openPaymentSession(paymentSession)}>
              Pay now →
            </button>
          ) : null}
          {isReschedule ? (
            <button className="bk-btn bk-btn--primary" type="button" onClick={() => setShowRescheduleConfirm(true)} disabled={booking || !sessionId}>
              {booking ? "Confirming…" : "Confirm reschedule →"}
            </button>
          ) : (
            <button className="bk-btn bk-btn--primary" type="button" onClick={bookReservation} disabled={booking || !sessionId}>
              {booking ? "Confirming…" : "Confirm booking →"}
            </button>
          )}
        </section>

        {/* Reschedule Confirmation Dialog — premium redesign */}
        {showRescheduleConfirm && (
          <div className="bk-modal-overlay" role="dialog" aria-modal="true">
            <div className="bk-modal">
              <h2>Confirm reschedule</h2>
              <p>This will <b>reschedule</b> your existing reservation to a new session. The old reservation will be released.</p>

              <div className="bk-compare">
                <div className="bk-compare-col bk-compare-col--old">
                  <div className="bk-compare-title">Old reservation</div>
                  <div className="bk-compare-line"><span>ID</span><strong>#{searchParams.get("reservationId") || "-"}</strong></div>
                  <div className="bk-compare-line"><span>Date</span><strong>{searchParams.get("examDate") || "-"}</strong></div>
                  <div className="bk-compare-line"><span>Site</span><strong>#{searchParams.get("siteId") || "-"}</strong></div>
                  <div className="bk-compare-line"><span>City</span><strong>{searchParams.get("siteCity") || "-"}</strong></div>
                </div>

                <div className="bk-compare-col bk-compare-col--new">
                  <div className="bk-compare-title">New reservation</div>
                  <div className="bk-compare-line"><span>Session</span><strong>#{sessionId || "-"}</strong></div>
                  <div className="bk-compare-line"><span>Date</span><strong>{availableDate || "-"}</strong></div>
                  <div className="bk-compare-line"><span>Site</span><strong>#{selectedSession ? (getSessionSiteId(selectedSession) || siteId || "-") : (siteId || "-")}</strong></div>
                  <div className="bk-compare-line"><span>City</span><strong>{selectedSession ? (getSessionSiteCity(selectedSession) || siteCity || selectedCity || "-") : (siteCity || selectedCity || "-")}</strong></div>
                  <div className="bk-compare-line"><span>Centre</span><strong>{selectedSession ? getResolvedSessionCenterName(selectedSession) : (centerOptions.find(c => String(c.siteId) === String(selectedCenterId))?.name || "-")}</strong></div>
                </div>
              </div>

              <div className="bk-modal-actions">
                <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setShowRescheduleConfirm(false)}>
                  Cancel
                </button>
                <button type="button" className="bk-btn bk-btn--primary" disabled={booking}
                  onClick={() => { setShowRescheduleConfirm(false); bookReservation(); }}>
                  {booking ? "Processing…" : "Yes, reschedule"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
