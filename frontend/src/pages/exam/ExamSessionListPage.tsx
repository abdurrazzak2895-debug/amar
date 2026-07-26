import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Calendar, BookOpen, MapPin, Search, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

const EXAM_TYPE_LABEL: Record<string, string> = {
  cbt_and_practical: "CBT + Practical",
  cbt: "CBT Only",
  practical: "Practical Only",
};

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  open: "default",
  full: "destructive",
  closed: "outline",
  completed: "default",
};

function formatDate(value: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function ExamSessionListPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api<ExamSession[]>("/exam-sessions?locale=en");
      setSessions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load exam sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const statuses = Array.from(new Set(sessions.map((s) => s.status)));

  const filtered = sessions.filter((s) => {
    if (activeFilter && s.status !== activeFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.category.english_name.toLowerCase().includes(q) ||
      s.test_center.city.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to load sessions</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={loadSessions}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exam Sessions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse available exam sessions from the SVP system
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by occupation or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveFilter(null)}
          >
            All
          </Button>
          {statuses.map((status) => (
            <Button
              key={status}
              variant={activeFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter((prev) => (prev === status ? null : status))}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">No exam sessions found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery ? "Try adjusting your search or filters." : "No sessions are currently available."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((session) => (
            <Card
              key={session.id}
              className="cursor-pointer transition-colors hover:border-primary/50 hover:shadow-md"
              onClick={() => navigate(`/exam/sessions/${session.id}`)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Category & Center info */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Category icon */}
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {session.category.english_name}
                        </h3>
                        <Badge variant={STATUS_BADGE_VARIANT[session.status] ?? "secondary"} className="text-xs">
                          {session.status}
                        </Badge>
                        {EXAM_TYPE_LABEL[session.category.exam_type] && (
                          <Badge variant="outline" className="text-xs">
                            {EXAM_TYPE_LABEL[session.category.exam_type]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1" dir="rtl">
                        {session.category.arabic_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(session.start_date_in_browser_time_zone)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {session.test_center.city}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: arrow */}
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>

                <Separator className="my-3" />

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-mono">ID: {session.id.slice(0, 32)}…</span>
                  <span>·</span>
                  <span>Cat. ID: {session.category.id}</span>
                  <span>·</span>
                  <span>Timezone: {session.time_zone_name}</span>
                  <span>·</span>
                  <span>Country: {session.test_center.country_code}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
