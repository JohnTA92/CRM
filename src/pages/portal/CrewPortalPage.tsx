import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, Leaf, ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle2 } from "lucide-react";

type ViewMode = "day" | "week" | "month";

function statusColor(s: string) {
  const m: Record<string, string> = {
    scheduled: "bg-[#e3f2fd] text-[#1565c0] border-[#90caf9]",
    "in-progress": "bg-[#fff8e1] text-[#f57f17] border-[#ffe082]",
    complete: "bg-[#e8f5e9] text-[#2e7d32] border-[#a5d6a7]",
    quoted: "bg-[#fff3e0] text-[#e65100] border-[#ffcc80]",
    invoiced: "bg-paper-warm text-ink-soft border-paper-deep",
  };
  return m[s] ?? "bg-paper-warm text-ink-soft border-paper-deep";
}

function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function CrewPortalPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const [member, setMember] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  });

  useEffect(() => { if (crewId) load(crewId); }, [crewId]);

  async function load(id: string) {
    setLoading(true);
    const { data: m } = await supabase.from("crew_members").select("*").eq("id", id).single();
    if (!m) { setNotFound(true); setLoading(false); return; }
    setMember(m);

    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title, status, scheduled_date, scheduled_time, customer_id")
      .contains("crew_member_ids", [id])
      .not("scheduled_date", "is", null)
      .order("scheduled_date");

    if (jobRows && jobRows.length > 0) {
      const custIds = [...new Set(jobRows.map((j: any) => j.customer_id).filter(Boolean))];
      const { data: custs } = await supabase.from("customers").select("id, name, address, city").in("id", custIds);
      const custMap: Record<string, any> = {};
      (custs ?? []).forEach((c: any) => { custMap[c.id] = c; });
      setJobs(jobRows.map((j: any) => ({ ...j, customer: custMap[j.customer_id] ?? null })));
    } else {
      setJobs([]);
    }
    setLoading(false);
  }

  function jobsForDate(iso: string) {
    return jobs.filter((j) => j.scheduled_date === iso).sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  }

  // ── Day View ──
  function DayView() {
    const iso = dateToIso(cursor);
    const dayJobs = jobsForDate(iso);
    const label = cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(addDays(cursor, -1))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronLeft className="w-4 h-4 text-ink-quiet" /></button>
          <p className="text-[15px] font-semibold text-ink">{label}</p>
          <button onClick={() => setCursor(addDays(cursor, 1))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronRight className="w-4 h-4 text-ink-quiet" /></button>
        </div>
        {dayJobs.length === 0 ? (
          <div className="text-center py-12 text-ink-quiet text-[14px]">No jobs scheduled.</div>
        ) : (
          <div className="space-y-3">
            {dayJobs.map((j) => <JobCard key={j.id} job={j} />)}
          </div>
        )}
      </div>
    );
  }

  // ── Week View ──
  function WeekView() {
    const weekStart = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    const todayIso = dateToIso(new Date());

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(addDays(cursor, -7))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronLeft className="w-4 h-4 text-ink-quiet" /></button>
          <p className="text-[14px] font-semibold text-ink">{weekLabel}</p>
          <button onClick={() => setCursor(addDays(cursor, 7))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronRight className="w-4 h-4 text-ink-quiet" /></button>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((day, i) => {
            const iso = dateToIso(day);
            const dayJobs = jobsForDate(iso);
            const isToday = iso === todayIso;
            return (
              <div key={iso} className="min-w-0">
                <div className={`text-center mb-2 py-1.5 rounded-lg ${isToday ? "bg-ink text-white" : ""}`}>
                  <p className={`text-[10px] font-semibold uppercase ${isToday ? "text-white/70" : "text-ink-quiet"}`}>{DAY_LABELS[i]}</p>
                  <p className={`text-[15px] font-bold ${isToday ? "text-white" : "text-ink"}`}>{day.getDate()}</p>
                </div>
                <div className="space-y-1.5">
                  {dayJobs.length === 0 ? (
                    <div className="h-1 rounded-full bg-paper-dark" />
                  ) : dayJobs.map((j) => (
                    <div key={j.id} className={`rounded-lg border px-2 py-1.5 text-[11px] ${statusColor(j.status)}`}>
                      <p className="font-semibold truncate leading-tight">{j.title}</p>
                      {j.scheduled_time && <p className="opacity-70 mt-0.5">{j.scheduled_time}</p>}
                      {j.customer?.name && <p className="opacity-70 truncate">{j.customer.name}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Month View ──
  function MonthView() {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const todayIso = dateToIso(new Date());

    const cells: (Date | null)[] = [
      ...Array(startPad).fill(null),
      ...Array.from({ length: lastDay.getDate() }, (_, i) => new Date(year, month, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronLeft className="w-4 h-4 text-ink-quiet" /></button>
          <p className="text-[15px] font-semibold text-ink">{MONTH_NAMES[month]} {year}</p>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg hover:bg-paper-dark transition-colors"><ChevronRight className="w-4 h-4 text-ink-quiet" /></button>
        </div>
        <div className="grid grid-cols-7 gap-px bg-paper-deep rounded-lg overflow-hidden">
          {DAY_LABELS.map((d) => (
            <div key={d} className="bg-paper-warm text-center py-2 text-[11px] font-semibold text-ink-quiet uppercase">{d}</div>
          ))}
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} className="bg-white min-h-[72px]" />;
            const iso = dateToIso(day);
            const dayJobs = jobsForDate(iso);
            const isToday = iso === todayIso;
            return (
              <div key={iso} className={`bg-white min-h-[72px] p-1.5 ${isToday ? "ring-2 ring-inset ring-ink" : ""}`}>
                <p className={`text-[12px] font-bold mb-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? "bg-ink text-white" : "text-ink"}`}>
                  {day.getDate()}
                </p>
                <div className="space-y-0.5">
                  {dayJobs.slice(0, 3).map((j) => (
                    <div key={j.id} className={`rounded px-1 py-0.5 text-[10px] font-medium truncate border ${statusColor(j.status)}`}>
                      {j.scheduled_time ? `${j.scheduled_time} ` : ""}{j.title}
                    </div>
                  ))}
                  {dayJobs.length > 3 && (
                    <p className="text-[10px] text-ink-quiet pl-1">+{dayJobs.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function JobCard({ job }: { job: any }) {
    return (
      <div className={`rounded-xl border p-4 ${statusColor(job.status)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold">{job.title}</p>
            {job.scheduled_time && (
              <p className="text-[12px] flex items-center gap-1 mt-1 opacity-80">
                <Clock className="w-3 h-3" /> {job.scheduled_time}
              </p>
            )}
            {job.customer && (
              <p className="text-[12px] flex items-center gap-1 mt-0.5 opacity-80">
                <MapPin className="w-3 h-3" />
                {job.customer.name}{job.customer.address ? ` · ${job.customer.address}${job.customer.city ? `, ${job.customer.city}` : ""}` : ""}
              </p>
            )}
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/60 capitalize whitespace-nowrap">
            {job.status.replace("-", " ")}
          </span>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen bg-paper-warm flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-ink-quiet" />
    </div>
  );

  if (notFound || !member) return (
    <div className="min-h-screen bg-paper-warm flex flex-col items-center justify-center text-center px-6">
      <AlertCircle className="w-10 h-10 text-ink-quiet opacity-30 mb-3" />
      <p className="text-[16px] font-semibold text-ink">Portal not found</p>
      <p className="text-[13px] text-ink-quiet mt-1">This link may be invalid or expired.</p>
    </div>
  );

  const upcomingCount = jobs.filter((j) => j.scheduled_date >= dateToIso(new Date())).length;

  return (
    <div className="min-h-screen bg-paper-warm">
      {/* Header */}
      <div className="bg-white border-b border-paper-deep">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
              <Leaf className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink">{member.name}</p>
              <p className="text-[12px] text-ink-quiet capitalize">{member.role} · {upcomingCount} upcoming job{upcomingCount !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-paper-warm rounded-lg p-1 border border-paper-deep">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium capitalize transition-colors ${view === v ? "bg-white text-ink shadow-sm" : "text-ink-quiet hover:text-ink"}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Today shortcut */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => setCursor(new Date())}
            className="text-[12px] font-medium text-ink-quiet hover:text-ink border border-paper-deep bg-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Today
          </button>
          {jobs.filter((j) => j.status === "in-progress").length > 0 && (
            <div className="flex items-center gap-1.5 text-[12px] text-[#f57f17] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {jobs.filter((j) => j.status === "in-progress").length} job{jobs.filter((j) => j.status === "in-progress").length !== 1 ? "s" : ""} in progress
            </div>
          )}
        </div>

        {view === "day" && <DayView />}
        {view === "week" && <WeekView />}
        {view === "month" && <MonthView />}
      </div>
    </div>
  );
}
