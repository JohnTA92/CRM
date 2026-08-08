import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, AlertCircle, Leaf, ChevronLeft, ChevronRight, Clock, MapPin, Navigation, X } from "lucide-react";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const SERVICE_COLORS: Record<string, string> = {
  lawn: "bg-[#e8f5e9] border-[#a5d6a7] text-[#1b5e20]",
  "pressure-washing": "bg-[#e3f2fd] border-[#90caf9] text-[#0d47a1]",
  "window-cleaning": "bg-[#fff3e0] border-[#ffcc80] text-[#e65100]",
  custom: "bg-paper-warm border-paper-deep text-ink",
};

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatHour(h: number) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function jobStartHour(time: string | null): number {
  if (!time) return -1;
  return parseInt(time.split(":")[0], 10);
}

export function CrewPortalPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const [member, setMember] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [customerAddresses, setCustomerAddresses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedISO, setSelectedISO] = useState<string | null>(
    toISO(today.getFullYear(), today.getMonth(), today.getDate())
  );

  useEffect(() => { if (crewId) load(crewId); }, [crewId]);

  async function load(id: string) {
    setLoading(true);
    const { data: m } = await supabase.from("crew_members").select("*").eq("id", id).single();
    if (!m) { setNotFound(true); setLoading(false); return; }
    setMember(m);

    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title, status, scheduled_date, scheduled_time, service_type, duration_minutes, customer_id")
      .contains("crew_member_ids", [id])
      .not("scheduled_date", "is", null)
      .order("scheduled_date");

    if (jobRows && jobRows.length > 0) {
      const custIds = [...new Set(jobRows.map((j: any) => j.customer_id).filter(Boolean))] as string[];
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name, address, city, state, zip")
        .in("id", custIds);
      const nameMap: Record<string, string> = {};
      const addrMap: Record<string, string> = {};
      (custs ?? []).forEach((c: any) => {
        nameMap[c.id] = c.name;
        if (c.address) {
          addrMap[c.id] = [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
        }
      });
      setCustomerNames(nameMap);
      setCustomerAddresses(addrMap);
      setJobs(jobRows);
    } else {
      setJobs([]);
    }
    setLoading(false);
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedISO(toISO(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());
  const grid = getMonthGrid(year, month);

  const selectedDayJobs = selectedISO
    ? jobs
        .filter((j) => j.scheduled_date === selectedISO)
        .sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""))
    : [];

  const selectedDate = selectedISO ? new Date(selectedISO + "T12:00:00") : null;

  const monthISOs = grid.filter(Boolean).map((d) => toISO(d!.getFullYear(), d!.getMonth(), d!.getDate()));
  const monthJobs = jobs.filter((j) => j.scheduled_date && monthISOs.includes(j.scheduled_date));

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

  return (
    <div className="min-h-screen bg-paper-warm">
      {/* Header */}
      <div className="bg-white border-b border-paper-deep">
        <div className="px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink">{member.name}</p>
            <p className="text-[12px] text-ink-quiet capitalize">{member.role} · My Schedule</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Nav row */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="px-3 py-1.5 text-[13px] font-medium text-ink-soft bg-paper-warm border border-paper-deep rounded-lg hover:bg-paper-dark transition-colors"
            >
              Today
            </button>
            <div className="flex items-center border border-paper-deep rounded-lg overflow-hidden">
              <button onClick={prevMonth} className="p-2 hover:bg-paper-warm transition-colors">
                <ChevronLeft className="w-4 h-4 text-ink-soft" />
              </button>
              <span className="px-4 text-[14px] font-semibold text-ink min-w-44 text-center">
                {MONTHS[month]} {year}
              </span>
              <button onClick={nextMonth} className="p-2 hover:bg-paper-warm transition-colors">
                <ChevronRight className="w-4 h-4 text-ink-soft" />
              </button>
            </div>
          </div>
        </div>

        {/* Monthly totals */}
        <div className="flex gap-4 mb-5">
          {[
            { label: "Monthly Total", value: monthJobs.length },
            { label: "Scheduled", value: monthJobs.filter((j) => ["scheduled","in-progress","quoted"].includes(j.status)).length },
            { label: "Completed", value: monthJobs.filter((j) => ["complete","invoiced"].includes(j.status)).length },
          ].map(({ label, value }) => (
            <div key={label} className="flex-1 bg-white rounded-xl border border-paper-deep px-5 py-3.5 flex items-center justify-between">
              <p className="text-[13px] text-ink-quiet font-medium">{label} — {MONTHS[month]}</p>
              <p className="text-[24px] font-bold text-ink leading-none">{value}</p>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden mb-6">
          <div className="grid grid-cols-7 border-b border-paper-deep">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-ink-quiet uppercase tracking-wide border-r border-paper-deep last:border-r-0">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((date, idx) => {
              if (!date) return (
                <div key={`e-${idx}`} className="border-r border-b border-paper-deep last:border-r-0 min-h-[100px] bg-paper-warm/40" />
              );
              const iso = toISO(date.getFullYear(), date.getMonth(), date.getDate());
              const isToday = iso === todayISO;
              const isSelected = iso === selectedISO;
              const isCurrentMonth = date.getMonth() === month;
              const dayJobs = jobs.filter((j) => j.scheduled_date === iso);

              return (
                <div
                  key={iso}
                  onClick={() => setSelectedISO(iso === selectedISO ? null : iso)}
                  className={`border-r border-b border-paper-deep last:border-r-0 min-h-[100px] p-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                    isSelected
                      ? "ring-2 ring-inset ring-accent bg-accent/5"
                      : isToday
                      ? "bg-accent/5 hover:bg-accent/10"
                      : isCurrentMonth
                      ? "bg-white hover:bg-paper-warm"
                      : "bg-paper-warm/30 hover:bg-paper-warm/60"
                  }`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[13px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? "bg-accent text-white" : isCurrentMonth ? "text-ink" : "text-ink-quiet"
                    }`}>
                      {date.getDate()}
                    </span>
                    {dayJobs.length > 0 && (
                      <span className="text-[10px] text-ink-quiet">{dayJobs.length}</span>
                    )}
                  </div>
                  {dayJobs.slice(0, 3).map((job) => (
                    <div
                      key={job.id}
                      className={`rounded border px-1.5 py-1 text-[11px] font-medium leading-tight truncate ${
                        SERVICE_COLORS[job.service_type] ?? SERVICE_COLORS.custom
                      }`}
                    >
                      <span className="flex items-center gap-0.5">
                        {job.scheduled_time && <span className="opacity-70 font-normal">{job.scheduled_time}</span>}
                        <span className="truncate">{customerNames[job.customer_id] || job.title}</span>
                      </span>
                    </div>
                  ))}
                  {dayJobs.length > 3 && (
                    <span className="text-[10px] text-ink-quiet px-1">+{dayJobs.length - 3} more</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Day timeline panel */}
        {selectedISO && selectedDate && (
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                </p>
                <p className="text-[12px] text-ink-quiet mt-0.5">
                  {selectedDayJobs.length === 0
                    ? "No jobs scheduled"
                    : `${selectedDayJobs.length} job${selectedDayJobs.length > 1 ? "s" : ""} scheduled`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {[
                  { label: "Total", value: selectedDayJobs.length },
                  { label: "Scheduled", value: selectedDayJobs.filter((j) => ["scheduled","quoted"].includes(j.status)).length },
                  { label: "In Progress", value: selectedDayJobs.filter((j) => j.status === "in-progress").length },
                  { label: "Complete", value: selectedDayJobs.filter((j) => ["complete","invoiced"].includes(j.status)).length },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <p className="text-[20px] font-bold text-ink leading-none">{value}</p>
                    <p className="text-[11px] text-ink-quiet mt-0.5">{label}</p>
                  </div>
                ))}
                {(() => {
                  const addressed = selectedDayJobs.filter((j) => customerAddresses[j.customer_id]);
                  if (addressed.length < 2) return null;
                  const wps = addressed.slice(0, -1).map((j: any) => encodeURIComponent(customerAddresses[j.customer_id])).join("|");
                  const dest = encodeURIComponent(customerAddresses[addressed[addressed.length - 1].customer_id]);
                  return (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&waypoints=${wps}&destination=${dest}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb] transition-colors border border-[#90caf9]"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Route All
                    </a>
                  );
                })()}
                <button
                  onClick={() => setSelectedISO(null)}
                  className="ml-2 p-1.5 rounded-lg hover:bg-paper-dark transition-colors text-ink-quiet"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[480px]">
              {HOURS.map((hour) => {
                const jobsThisHour = selectedDayJobs.filter((j) => jobStartHour(j.scheduled_time) === hour);
                const isWorkHour = hour >= 6 && hour <= 20;
                const isCurrentHour = selectedISO === todayISO && new Date().getHours() === hour;

                return (
                  <div
                    key={hour}
                    className={`flex border-b border-paper-deep last:border-b-0 min-h-[52px] ${
                      isCurrentHour ? "bg-accent/5" : isWorkHour ? "" : "bg-paper-warm/30"
                    }`}
                  >
                    <div className="w-16 flex-shrink-0 px-3 py-2 text-right border-r border-paper-deep">
                      <span className={`text-[11px] font-medium ${isCurrentHour ? "text-accent font-semibold" : "text-ink-quiet"}`}>
                        {formatHour(hour)}
                      </span>
                      {isCurrentHour && <div className="mt-1 ml-auto w-1.5 h-1.5 rounded-full bg-accent" />}
                    </div>
                    <div className="flex-1 px-3 py-1.5 flex flex-col gap-1.5">
                      {jobsThisHour.map((job: any) => (
                        <div
                          key={job.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-[12px] font-medium ${
                            SERVICE_COLORS[job.service_type] ?? SERVICE_COLORS.custom
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{job.title}</p>
                            <p className="opacity-70 text-[11px] truncate">
                              {customerNames[job.customer_id] ?? ""}
                              {job.duration_minutes ? ` · ${job.duration_minutes}min` : ""}
                            </p>
                            {customerAddresses[job.customer_id] && (
                              <p className="opacity-60 text-[10px] truncate flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                {customerAddresses[job.customer_id]}
                              </p>
                            )}
                          </div>
                          {customerAddresses[job.customer_id] && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerAddresses[job.customer_id])}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-0.5 text-[10px] font-semibold opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
                            >
                              <Navigation className="w-2.5 h-2.5" /> Directions
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
