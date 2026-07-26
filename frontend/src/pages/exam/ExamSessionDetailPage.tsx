import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Clock, Tag, User, BookOpen, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import "@/styles/booking-premium.css";

interface ExamCategory {
  id: number;
  arabic_name: string;
  english_name: string;
  exam_type: string;
  published: boolean;
}

interface TestCenter {
  city: string;
  country_code: string;
  country_id: number;
}

interface ExamSession {
  id: string;
  browser_time_zone_offset: string;
  category: ExamCategory;
  start_date_in_browser_time_zone: string;
  start_date_in_tc_time_zone: string;
  status: string;
  test_center: TestCenter;
  time_zone_name: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Scheduled", icon: Hourglass, variant: "secondary" },
  open: { label: "Open for Booking", icon: CheckCircle2, variant: "default" },
  full: { label: "Fully Booked", icon: XCircle, variant: "destructive" },
  closed: { label: "Closed", icon: XCircle, variant: "outline" },
  completed: { label: "Completed", icon: CheckCircle2, variant: "default" },
};

function formatDate(value: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return value;
  }
}

export default function ExamSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadSession() {
      try {
        setLoading(true);
        setError(null);
        const data = await api<ExamSession>(`/exam-sessions/${encodeURIComponent(id)}?locale=en`);
        if (!cancelled) setSession(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load exam session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSession();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="text-sm font-semibold text-destructive">Failed to load exam session</p>
          <p className="mt-1 text-xs text-muted-foreground">{error || "Session not found"}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/exam/booking")}>
            Go to Booking
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.scheduled;
  const StatusIcon = statusInfo.icon;
  const examTypeLabel = session.category.exam_type === "cbt_and_practical"
    ? "CBT + Practical"
    : session.category.exam_type === "cbt"
      ? "Computer Based Test"
      : session.category.exam_type === "practical"
        ? "Practical"
        : session.category.exam_type;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Exam Session Details</h1>
          <p className="text-xs text-muted-foreground font-mono">ID: {session.id}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <Badge variant={statusInfo.variant} className="gap-1.5 px-3 py-1.5 text-sm">
          <StatusIcon className="h-3.5 w-3.5" />
          {statusInfo.label}
        </Badge>
        <span className="text-xs text-muted-foreground">Session ID: {session.id}</span>
      </div>

      {/* Main Card */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Category / Occupation */}
        <div className="border-b border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{session.category.english_name}</h2>
                <p className="text-sm text-muted-foreground" dir="rtl">{session.category.arabic_name}</p>
                <Badge variant="outline" className="mt-2 gap-1 text-xs">
                  <Tag className="h-3 w-3" />
                  Category ID: {session.category.id}
                </Badge>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">
              {examTypeLabel}
            </Badge>
          </div>
        </div>

        {/* Date & Time Section */}
        <div className="border-b border-border p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Calendar className="h-4 w-4" /> Schedule
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground mb-1">Start Date (Browser Timezone)</p>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(session.start_date_in_browser_time_zone)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Timezone: {session.browser_time_zone_offset}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground mb-1">Start Date (Test Center TZ)</p>
              <p className="text-sm font-semibold text-foreground">
                {formatDate(session.start_date_in_tc_time_zone)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Zone: {session.time_zone_name}</p>
            </div>
          </div>
        </div>

        {/* Test Center Section */}
        <div className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <MapPin className="h-4 w-4" /> Test Center
          </h3>
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20">
              <MapPin className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{session.test_center.city}</p>
              <p className="text-xs text-muted-foreground">
                Country Code: {session.test_center.country_code} &nbsp;·&nbsp; Country ID: {session.test_center.country_id}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 p-6">
          <Link to="/exam/booking">
            <Button>Book This Session</Button>
          </Link>
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
        </div>
      </div>
    </div>
  );
}
