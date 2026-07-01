import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { serviceTypeLabel, type Job } from "@/data/crm";
import { supabase } from "@/lib/supabase";
import { ChevronLeft, ChevronRight, Clock, X, Loader2 } from "lucide-react";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

const SERVICE_COLORS: Record<string, string> = {
  lawn: "bg-[#e8f5e9] border-[#a5d6a7] text-[#1b5e20]",
  "pressure-washing": "bg-[#e3f2fd] border-[#90caf9] text-[#0d47a1]",
  "window-cleaning": "bg-[#fff3e0] border-[#ffcc80] text-[#e65100]",
  custom: "bg-paper-warm border-paper-deep text-ink",
};

export function SchedulePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [crewFilter, setCrewFilter] = useState("all");
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [jobRes, custRes] = await Promise.all([
      supabase.from("jobs").select("*"),
      supabase.from("customers").select("id, name"),
    ]);
    if (jobRes.data) {
      setJobs(jobRes.data.map((row: any): Job => ({
        id: row.id,
        customerId: row.customer_id,
        serviceType: row.service_type,
        title: row.title,
        status: row.status,
        scheduledDate: row.scheduled_date,
        scheduledTime: row.scheduled_time,
        durationMinutes: row.duration_minutes ?? 60,
        assignedTo: row.assigned_to,
        notes: row.notes ?? "",
        estimateId: row.estimate_id,
        invoiceId: row.invoice_id,
        recurring: row.recurring ?? "none",
        createdAt: row.created_at?.split("T")[0] ?? "",
      })));
    }
    if (custRes.data) {
      const map: Record<string, string> = {};
      custRes.data.forEach((c: any) => { map[c.id] = c.name; });
      setCustomers(map);
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

  const getCustomerName = (id: string) => customers[id] ?? "";

  const unassigned = jobs.filter(
    (j) => !j.assignedTo && j.scheduledDate && ["scheduled", "in-progress"].includes(j.status),
  );

  const selectedDayJobs = selectedISO
    ? jobs.filter((j) => {
        return (
          j.scheduledDate === selectedISO &&
          (crewFilter === "all" || j.assignedTo === crewFilter) &&
          ["scheduled", "in-progress", "complete", "quoted"].includes(j.status)
        );
      })
    : [];

  const selectedDate = selectedISO ? new Date(selectedISO + "T12:00:00") : null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[22px] font-semibold text-ink flex items-center gap-2">
          Schedule
          {loading && <Loader2 className="w-4 h-4 animate-spin text-ink-quiet" />}
        </h1>
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
      {(() => {
        const monthISOs = grid.filter(Boolean).map((d) => toISO(d!.getFullYear(), d!.getMonth(), d!.getDate()));
        const monthJobs = jobs.filter((j) => j.scheduledDate && monthISOs.includes(j.scheduledDate));
        const scheduled = monthJobs.filter((j) => ["scheduled", "in-progress", "quoted"].includes(j.status)).length;
        const completed = monthJobs.filter((j) => j.status === "complete" || j.status === "invoiced").length;
        const total = monthJobs.length;
        return (
          <div className="flex gap-4 mb-5">
            {[
              { label: "Monthly Total", value: total },
              { label: "Scheduled", value: scheduled },
              { label: "Completed", value: completed },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 bg-white rounded-xl border border-paper-deep px-5 py-3.5 flex items-center justify-between">
                <p className="text-[13px] text-ink-quiet font-medium">{label} — {MONTHS[month]}</p>
                <p className="text-[24px] font-bold text-ink leading-none">{value}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Crew filter */}
      {crewMembers.length > 0 && (
        <div className="flex gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setCrewFilter("all")}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              crewFilter === "all" ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"
            }`}
          >
            All crew
          </button>
          {crewMembers.map((cm) => (
            <button
              key={cm.id}
              onClick={() => setCrewFilter(cm.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                crewFilter === cm.id ? "bg-ink text-white" : "bg-paper-warm text-ink-soft hover:bg-paper-dark"
              }`}
            >
              {cm.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-5">
        {/* Calendar grid */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-paper-deep overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-paper-deep">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-ink-quiet uppercase tracking-wide border-r border-paper-deep last:border-r-0">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="grid grid-cols-7">
            {grid.map((date, idx) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="border-r border-b border-paper-deep last:border-r-0 min-h-[100px] bg-paper-warm/40"
                  />
                );
              }

              const iso = toISO(date.getFullYear(), date.getMonth(), date.getDate());
              const isToday = iso === todayISO;
              const isSelected = iso === selectedISO;
              const isCurrentMonth = date.getMonth() === month;

              const dayJobs = jobs.filter((j) =>
                j.scheduledDate === iso &&
                (crewFilter === "all" || j.assignedTo === crewFilter) &&
                ["scheduled", "in-progress", "complete", "quoted"].includes(j.status)
              );

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
                    <span
                      className={`text-[13px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                        isToday
                          ? "bg-accent text-white"
                          : isCurrentMonth
                          ? "text-ink"
                          : "text-ink-quiet"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayJobs.length > 0 && (
                      <span className="text-[10px] text-ink-quiet">{dayJobs.length}</span>
                    )}
                  </div>

                  {dayJobs.slice(0, 3).map((job) => (
                    <div
                      key={job.id}
                      onClick={(e) => e.stopPropagation()}
                      className="contents"
                    >
                      <Link
                        to={`/jobs/${job.id}`}
                        className={`block rounded border px-1.5 py-1 text-[11px] font-medium leading-tight hover:shadow-sm transition-shadow truncate ${
                          SERVICE_COLORS[job.serviceType] ?? SERVICE_COLORS.custom
                        }`}
                      >
                        <span className="flex items-center gap-0.5">
                          {job.scheduledTime && (
                            <span className="opacity-70 font-normal">{job.scheduledTime}</span>
                          )}
                          <span className="truncate">{getCustomerName(job.customerId) || job.title}</span>
                        </span>
                      </Link>
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

        {/* Unassigned sidebar */}
        {unassigned.length > 0 && (
          <div className="w-48 flex-shrink-0">
            <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
              <div className="px-4 py-3 border-b border-paper-deep bg-paper-warm">
                <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide">Unassigned</p>
                <p className="text-[11px] text-ink-quiet mt-0.5">{unassigned.length} job{unassigned.length > 1 ? "s" : ""}</p>
              </div>
              <div className="divide-y divide-paper-deep">
                {unassigned.map((job) => (
                  <Link key={job.id} to={`/jobs/${job.id}`} className="block px-4 py-3 hover:bg-paper-warm transition-colors">
                    <p className="text-[12px] font-semibold text-ink truncate">{getCustomerName(job.customerId)}</p>
                    <p className="text-[11px] text-ink-quiet truncate">{job.title}</p>
                    {job.scheduledDate && (
                      <p className="text-[11px] text-ink-quiet mt-0.5">{job.scheduledDate}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Day timeline panel */}
      {selectedISO && selectedDate && (
        <div className="mt-6 bg-white rounded-xl border border-paper-deep overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
            <div>
              <p className="text-[14px] font-semibold text-ink">
                {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
              <p className="text-[12px] text-ink-quiet mt-0.5">
                {selectedDayJobs.length === 0 ? "No jobs scheduled" : `${selectedDayJobs.length} job${selectedDayJobs.length > 1 ? "s" : ""} scheduled`}
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
              <button
                onClick={() => setSelectedISO(null)}
                className="ml-2 p-1.5 rounded-lg hover:bg-paper-dark transition-colors text-ink-quiet"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 24-hour timeline */}
          <div className="overflow-y-auto max-h-[480px]">
            {HOURS.map((hour) => {
              const jobsThisHour = selectedDayJobs.filter((j) => jobStartHour(j.scheduledTime) === hour);
              const isWorkHour = hour >= 6 && hour <= 20;
              const now = new Date();
              const isCurrentHour =
                selectedISO === todayISO && now.getHours() === hour;

              return (
                <div
                  key={hour}
                  className={`flex border-b border-paper-deep last:border-b-0 min-h-[52px] ${
                    isCurrentHour ? "bg-accent/5" : isWorkHour ? "" : "bg-paper-warm/30"
                  }`}
                >
                  {/* Hour label */}
                  <div className="w-16 flex-shrink-0 px-3 py-2 text-right border-r border-paper-deep">
                    <span className={`text-[11px] font-medium ${isCurrentHour ? "text-accent font-semibold" : "text-ink-quiet"}`}>
                      {formatHour(hour)}
                    </span>
                    {isCurrentHour && (
                      <div className="mt-1 ml-auto w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                  </div>

                  {/* Job slots */}
                  <div className="flex-1 px-3 py-1.5 flex flex-col gap-1.5">
                    {jobsThisHour.map((job) => (
                      <Link
                        key={job.id}
                        to={`/jobs/${job.id}`}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-[12px] font-medium hover:shadow-sm transition-shadow ${
                          SERVICE_COLORS[job.serviceType] ?? SERVICE_COLORS.custom
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{job.title}</p>
                          <p className="opacity-70 text-[11px] truncate">
                            {getCustomerName(job.customerId)}
                            {job.durationMinutes ? ` · ${job.durationMinutes}min` : ""}
                          </p>
                        </div>
                        <span className="text-[11px] opacity-60 flex-shrink-0">{serviceTypeLabel(job.serviceType)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
