import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ChevronLeft, ChevronRight, Users, Briefcase, Clock, MapPin, AlertCircle } from "lucide-react";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-[#e3f2fd] border-[#90caf9] text-[#1565c0]",
  "in-progress": "bg-[#fff8e1] border-[#ffe082] text-[#f57f17]",
  complete: "bg-[#e8f5e9] border-[#a5d6a7] text-[#2e7d32]",
  quoted: "bg-[#fff3e0] border-[#ffcc80] text-[#e65100]",
};

const ROLE_COLOR: Record<string, string> = {
  crew: "bg-paper-warm text-ink-soft",
  lead: "bg-[#e3f2fd] text-[#1565c0]",
  supervisor: "bg-[#f3e5f5] text-[#6a1b9a]",
  admin: "bg-[#e8f5e9] text-[#2e7d32]",
};

export function SchedulingPage() {
  const { business } = useAuth();
  const businessId = business?.id ?? "";
  const [crew, setCrew] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [view, setView] = useState<"week" | "day">("week");
  const [dayDate, setDayDate] = useState(today);

  useEffect(() => { load(); }, [businessId]);

  async function load() {
    setLoading(true);
    const [crewRes, jobRes, custRes] = await Promise.all([
      supabase.from("crew_members").select("*").eq("business_id", businessId).eq("active", true).order("name"),
      supabase.from("jobs")
        .select("id, title, status, scheduled_date, scheduled_time, duration_minutes, customer_id, crew_member_ids, service_type")
        .eq("business_id", businessId)
        .not("scheduled_date", "is", null)
        .in("status", ["scheduled", "in-progress", "complete", "quoted"])
        .order("scheduled_date"),
      supabase.from("customers").select("id, name, address, city").eq("business_id", businessId),
    ]);
    if (crewRes.data) setCrew(crewRes.data);
    if (jobRes.data) setJobs(jobRes.data);
    if (custRes.data) {
      const m: Record<string, any> = {};
      custRes.data.forEach((c: any) => { m[c.id] = c; });
      setCustomers(m);
    }
    setLoading(false);
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = toISO(today);

  function jobsForMemberOnDay(memberId: string, iso: string) {
    return jobs.filter((j) =>
      j.scheduled_date === iso &&
      Array.isArray(j.crew_member_ids) &&
      j.crew_member_ids.includes(memberId)
    ).sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  }

  function unassignedForDay(iso: string) {
    return jobs.filter((j) =>
      j.scheduled_date === iso &&
      (!Array.isArray(j.crew_member_ids) || j.crew_member_ids.length === 0)
    );
  }

  // ── Week view ──
  function WeekView() {
    const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg hover:bg-paper-dark border border-paper-deep transition-colors">
            <ChevronLeft className="w-4 h-4 text-ink-soft" />
          </button>
          <span className="text-[14px] font-semibold text-ink min-w-56 text-center">{weekLabel}</span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg hover:bg-paper-dark border border-paper-deep transition-colors">
            <ChevronRight className="w-4 h-4 text-ink-soft" />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(today))} className="px-3 py-1.5 text-[12px] font-medium border border-paper-deep rounded-lg hover:bg-paper-dark transition-colors text-ink-soft ml-1">
            This week
          </button>
        </div>

        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          {/* Header row */}
          <div className="grid border-b border-paper-deep" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
            <div className="px-4 py-3 border-r border-paper-deep bg-paper-warm">
              <p className="text-[11px] font-semibold text-ink-quiet uppercase tracking-wide">Crew Member</p>
            </div>
            {days.map((d) => {
              const iso = toISO(d);
              const isToday = iso === todayISO;
              const unassigned = unassignedForDay(iso);
              return (
                <div
                  key={iso}
                  className={`px-2 py-3 border-r border-paper-deep last:border-r-0 text-center cursor-pointer hover:bg-paper-warm transition-colors ${isToday ? "bg-accent/5" : "bg-paper-warm"}`}
                  onClick={() => { setDayDate(d); setView("day"); }}
                >
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-accent" : "text-ink-quiet"}`}>{DAY_LABELS[d.getDay()]}</p>
                  <p className={`text-[15px] font-bold mt-0.5 ${isToday ? "text-accent" : "text-ink"}`}>{d.getDate()}</p>
                  {unassigned.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#e65100] mt-1">
                      <AlertCircle className="w-3 h-3" />{unassigned.length} unassigned
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Crew rows */}
          {loading ? (
            <div className="py-12 text-center text-[14px] text-ink-quiet">Loading…</div>
          ) : crew.length === 0 ? (
            <div className="py-12 text-center text-[14px] text-ink-quiet">No active crew members. <Link to="/crew" className="text-accent hover:underline">Add crew →</Link></div>
          ) : crew.map((member) => (
            <div key={member.id} className="grid border-b border-paper-deep last:border-b-0" style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}>
              <div className="px-4 py-3 border-r border-paper-deep flex items-center gap-2.5 bg-paper-warm/40">
                <div className="w-7 h-7 rounded-full bg-paper-dark flex items-center justify-center text-[11px] font-bold text-ink-soft flex-shrink-0">
                  {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink truncate">{member.name}</p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${ROLE_COLOR[member.role] ?? ROLE_COLOR.crew}`}>{member.role}</span>
                </div>
              </div>
              {days.map((d) => {
                const iso = toISO(d);
                const isToday = iso === todayISO;
                const dayJobs = jobsForMemberOnDay(member.id, iso);
                return (
                  <div key={iso} className={`px-1.5 py-2 border-r border-paper-deep last:border-r-0 min-h-[64px] ${isToday ? "bg-accent/5" : ""}`}>
                    {dayJobs.map((j) => (
                      <Link key={j.id} to={`/jobs/${j.id}`} className={`block rounded border px-1.5 py-1 mb-1 text-[10px] font-medium leading-tight truncate hover:shadow-sm transition-shadow ${STATUS_COLOR[j.status] ?? "bg-paper-warm border-paper-deep text-ink"}`}>
                        {j.scheduled_time && <span className="opacity-70">{j.scheduled_time} </span>}
                        {customers[j.customer_id]?.name ?? j.title}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Day view ──
  function DayView() {
    const iso = toISO(dayDate);
    const isToday = iso === todayISO;
    const label = dayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const totalJobs = jobs.filter((j) => j.scheduled_date === iso);
    const unassigned = unassignedForDay(iso);

    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setDayDate(addDays(dayDate, -1))} className="p-2 rounded-lg hover:bg-paper-dark border border-paper-deep transition-colors">
            <ChevronLeft className="w-4 h-4 text-ink-soft" />
          </button>
          <span className={`text-[14px] font-semibold min-w-56 text-center ${isToday ? "text-accent" : "text-ink"}`}>{label}</span>
          <button onClick={() => setDayDate(addDays(dayDate, 1))} className="p-2 rounded-lg hover:bg-paper-dark border border-paper-deep transition-colors">
            <ChevronRight className="w-4 h-4 text-ink-soft" />
          </button>
          <button onClick={() => setDayDate(today)} className="px-3 py-1.5 text-[12px] font-medium border border-paper-deep rounded-lg hover:bg-paper-dark transition-colors text-ink-soft ml-1">
            Today
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Total Jobs", value: totalJobs.length, icon: Briefcase },
            { label: "Crew Working", value: crew.filter((m) => jobsForMemberOnDay(m.id, iso).length > 0).length, icon: Users },
            { label: "Unassigned", value: unassigned.length, icon: AlertCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl border border-paper-deep px-5 py-3.5 flex items-center justify-between">
              <p className="text-[13px] text-ink-quiet font-medium">{label}</p>
              <p className="text-[24px] font-bold text-ink">{value}</p>
            </div>
          ))}
        </div>

        {/* Per-crew member */}
        <div className="space-y-3">
          {crew.map((member) => {
            const dayJobs = jobsForMemberOnDay(member.id, iso);
            return (
              <div key={member.id} className="bg-white rounded-xl border border-paper-deep overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-paper-deep bg-paper-warm">
                  <div className="w-7 h-7 rounded-full bg-paper-dark flex items-center justify-center text-[11px] font-bold text-ink-soft flex-shrink-0">
                    {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-[13px] font-semibold text-ink flex-1">{member.name}</p>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_COLOR[member.role] ?? ROLE_COLOR.crew}`}>{member.role}</span>
                  <span className="text-[12px] text-ink-quiet">{dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""}</span>
                </div>
                {dayJobs.length === 0 ? (
                  <p className="px-5 py-3 text-[13px] text-ink-quiet">No jobs assigned.</p>
                ) : (
                  <div className="divide-y divide-paper-deep">
                    {dayJobs.map((j) => {
                      const cust = customers[j.customer_id];
                      return (
                        <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-paper-warm transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-ink truncate">{j.title}</p>
                            {cust && (
                              <p className="text-[12px] text-ink-quiet flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {cust.name}{cust.address ? ` · ${cust.address}${cust.city ? `, ${cust.city}` : ""}` : ""}
                              </p>
                            )}
                          </div>
                          {j.scheduled_time && (
                            <span className="text-[12px] text-ink-quiet flex items-center gap-1 flex-shrink-0">
                              <Clock className="w-3 h-3" /> {j.scheduled_time}
                            </span>
                          )}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize flex-shrink-0 ${STATUS_COLOR[j.status] ?? "bg-paper-warm border-paper-deep text-ink-soft"}`}>
                            {j.status.replace("-", " ")}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div className="bg-white rounded-xl border border-[#ffcc80] overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[#ffcc80] bg-[#fff8e1]">
                <AlertCircle className="w-4 h-4 text-[#e65100]" />
                <p className="text-[13px] font-semibold text-[#e65100]">Unassigned Jobs ({unassigned.length})</p>
              </div>
              <div className="divide-y divide-paper-deep">
                {unassigned.map((j) => (
                  <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-paper-warm transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-ink">{j.title}</p>
                      <p className="text-[12px] text-ink-quiet">{customers[j.customer_id]?.name ?? ""}</p>
                    </div>
                    <span className="text-[12px] text-[#e65100] font-medium">Assign crew →</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-ink-quiet" /> Crew Scheduling
          </h1>
          <p className="text-[14px] text-ink-quiet mt-1">See who's working what, assign jobs to crew</p>
        </div>
        <div className="flex items-center gap-1 bg-paper-warm border border-paper-deep rounded-lg p-1">
          {(["week", "day"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-[12px] font-medium capitalize transition-colors ${view === v ? "bg-white text-ink shadow-sm" : "text-ink-quiet hover:text-ink"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "week" ? <WeekView /> : <DayView />}
    </div>
  );
}
