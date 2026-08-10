import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Map, Marker } from "pigeon-maps";
import {
  Loader2, AlertCircle, Leaf, ChevronLeft, ChevronRight,
  Clock, MapPin, Navigation, PlayCircle, StopCircle, History,
  Coffee, UtensilsCrossed, Bell, Camera, DollarSign, X,
} from "lucide-react";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SERVICE_COLORS: Record<string, string> = {
  lawn: "bg-[#e8f5e9] border-[#a5d6a7] text-[#1b5e20]",
  "pressure-washing": "bg-[#e3f2fd] border-[#90caf9] text-[#0d47a1]",
  "window-cleaning": "bg-[#fff3e0] border-[#ffcc80] text-[#e65100]",
  custom: "bg-paper-warm border-paper-deep text-ink",
};
const PIN_COLORS = ["#1565c0","#2e7d32","#e65100","#6a1b9a","#c62828","#00695c"];

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayISO() {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
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
function fmtDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMins = Math.floor(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
async function geocode(address: string): Promise<[number, number] | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
    const data = await res.json();
    if (data[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch (_) {}
  return null;
}

export function CrewPortalPage() {
  const { crewId } = useParams<{ crewId: string }>();
  const [member, setMember] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [customerAddresses, setCustomerAddresses] = useState<Record<string, string>>({});
  const [jobCoords, setJobCoords] = useState<Record<string, [number, number]>>({});
  const [punches, setPunches] = useState<any[]>([]);
  const [breaks, setBreaks] = useState<any[]>([]);
  const [breakSettings, setBreakSettings] = useState({ lunch_break_mins: 30, short_break_mins: 10 });
  const [clocking, setClocking] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [workElapsed, setWorkElapsed] = useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // job status updates
  const [updatingJob, setUpdatingJob] = useState<string | null>(null);

  // photo upload
  const [uploadingJob, setUploadingJob] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoJobId, setPhotoJobId] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedISO, setSelectedISO] = useState<string | null>(
    toISO(now.getFullYear(), now.getMonth(), now.getDate())
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const ISO_TODAY = todayISO();

  useEffect(() => { if (crewId) load(crewId); }, [crewId]);

  // tick every second
  useEffect(() => {
    const activePunch = punches.find((p) => !p.clocked_out_at);
    const activeBreak = breaks.find((b) => !b.clocked_out_at);
    if (activePunch || activeBreak) {
      const tick = () => {
        if (activePunch) setWorkElapsed(Date.now() - new Date(activePunch.clocked_in_at).getTime());
        if (activeBreak) setBreakElapsed(Date.now() - new Date(activeBreak.clocked_in_at).getTime());
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setWorkElapsed(0); setBreakElapsed(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [punches, breaks]);

  // geocode addresses for today's jobs whenever selectedISO or addresses change
  useEffect(() => {
    if (!selectedISO) return;
    const todayJobs = jobs.filter((j) => j.scheduled_date === selectedISO);
    todayJobs.forEach(async (job) => {
      const addr = customerAddresses[job.customer_id];
      if (!addr || jobCoords[job.id]) return;
      const coords = await geocode(addr);
      if (coords) setJobCoords((prev) => ({ ...prev, [job.id]: coords }));
    });
  }, [selectedISO, customerAddresses, jobs]);

  async function load(id: string) {
    setLoading(true);
    try {
      const { data: m } = await supabase.from("crew_members").select("*").eq("id", id).single();
      if (!m) { setNotFound(true); return; }
      setMember(m);

      const [jobRes, allEntriesRes, settingsRes, custRes] = await Promise.all([
        supabase.from("jobs")
          .select("id, title, status, scheduled_date, scheduled_time, service_type, duration_minutes, customer_id, notes")
          .contains("crew_member_ids", [id])
          .not("scheduled_date", "is", null)
          .order("scheduled_date"),
        supabase.from("time_entries")
          .select("*").eq("crew_member_id", id).is("job_id", null)
          .order("clocked_in_at", { ascending: false }),
        supabase.from("company_settings").select("*").eq("id", "default").single(),
        supabase.from("customers").select("id, name, address, city, state, zip"),
      ]);

      if (jobRes.data) {
        setJobs(jobRes.data);
        const custIds = [...new Set(jobRes.data.map((j: any) => j.customer_id).filter(Boolean))] as string[];
        const custs = (custRes.data ?? []).filter((c: any) => custIds.includes(c.id));
        const nameMap: Record<string, string> = {};
        const addrMap: Record<string, string> = {};
        custs.forEach((c: any) => {
          nameMap[c.id] = c.name;
          if (c.address) addrMap[c.id] = [c.address, c.city, c.state, c.zip].filter(Boolean).join(", ");
        });
        setCustomerNames(nameMap);
        setCustomerAddresses(addrMap);
      }
      if (allEntriesRes.data) {
        setPunches(allEntriesRes.data.filter((e: any) => !e.break_type));
        setBreaks(allEntriesRes.data.filter((e: any) => !!e.break_type));
      }
      if (settingsRes.data) setBreakSettings({
        lunch_break_mins: settingsRes.data.lunch_break_mins ?? 30,
        short_break_mins: settingsRes.data.short_break_mins ?? 10,
      });
    } catch (_) {}
    finally { setLoading(false); }
  }

  async function handleClockIn() {
    if (!crewId) return;
    setClocking(true);
    const { data, error } = await supabase.from("time_entries").insert({
      crew_member_id: crewId,
      clocked_in_at: new Date().toISOString(),
    }).select().single();
    if (error) console.error("Clock in error:", error.message);
    if (data) setPunches((prev) => [data, ...prev]);
    setClocking(false);
  }

  async function handleClockOut() {
    const active = punches.find((p) => !p.clocked_out_at);
    if (!active) return;
    const activeBreak = breaks.find((b) => !b.clocked_out_at);
    if (activeBreak) await endBreak(activeBreak.id);
    setClocking(true);
    const { data } = await supabase.from("time_entries")
      .update({ clocked_out_at: new Date().toISOString() })
      .eq("id", active.id).select().single();
    if (data) setPunches((prev) => prev.map((p) => p.id === active.id ? data : p));
    setClocking(false);
  }

  async function handleStartBreak(type: "lunch" | "short") {
    if (!crewId) return;
    setBreaking(true);
    const { data, error } = await supabase.from("time_entries").insert({
      crew_member_id: crewId, break_type: type,
      clocked_in_at: new Date().toISOString(),
    }).select().single();
    if (error) console.error("Break start error:", error.message);
    if (data) setBreaks((prev) => [data, ...prev]);
    setBreaking(false);
  }

  async function endBreak(entryId: string) {
    const { data } = await supabase.from("time_entries")
      .update({ clocked_out_at: new Date().toISOString() })
      .eq("id", entryId).select().single();
    if (data) setBreaks((prev) => prev.map((b) => b.id === entryId ? data : b));
  }

  async function handleEndBreak() {
    const active = breaks.find((b) => !b.clocked_out_at);
    if (!active) return;
    setBreaking(true);
    await endBreak(active.id);
    setBreaking(false);
  }

  async function updateJobStatus(jobId: string, status: string) {
    setUpdatingJob(jobId);
    const { data } = await supabase.from("jobs").update({ status }).eq("id", jobId).select().single();
    if (data) setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status: data.status } : j));
    setUpdatingJob(null);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !photoJobId || !crewId) return;
    setUploadingJob(photoJobId);
    const ext = file.name.split(".").pop();
    const path = `${photoJobId}/${crewId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("job-media").upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage.from("job-media").getPublicUrl(path);
      await supabase.from("job_media").insert({
        job_id: photoJobId,
        url: urlData.publicUrl,
        file_name: file.name,
        file_type: file.type,
        tag: "after",
        notes: `Uploaded by crew`,
      });
      setPhotoMsg("Photo uploaded!");
      setTimeout(() => setPhotoMsg(null), 3000);
    }
    setUploadingJob(null);
    setPhotoJobId(null);
    e.target.value = "";
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedISO(ISO_TODAY); };

  const grid = getMonthGrid(year, month);
  const monthISOs = grid.filter(Boolean).map((d) => toISO(d!.getFullYear(), d!.getMonth(), d!.getDate()));
  const monthJobs = jobs.filter((j) => j.scheduled_date && monthISOs.includes(j.scheduled_date));
  const selectedDayJobs = selectedISO
    ? jobs.filter((j) => j.scheduled_date === selectedISO).sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""))
    : [];
  const selectedDate = selectedISO ? new Date(selectedISO + "T12:00:00") : null;

  const activePunch = punches.find((p) => !p.clocked_out_at) ?? null;
  const activeBreak = breaks.find((b) => !b.clocked_out_at) ?? null;

  // upcoming job alert — within 60 mins
  const upcomingJob = (() => {
    if (!activePunch) return null;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return selectedDayJobs.find((j) => {
      if (!j.scheduled_time || j.status === "complete") return false;
      const [h, m] = j.scheduled_time.split(":").map(Number);
      const diff = (h * 60 + m) - nowMins;
      return diff > 0 && diff <= 60;
    }) ?? null;
  })();

  // today/week net time
  const todayWorkMs = punches.filter((p) => p.clocked_out_at && p.clocked_in_at?.startsWith(ISO_TODAY))
    .reduce((s: number, p: any) => s + (new Date(p.clocked_out_at).getTime() - new Date(p.clocked_in_at).getTime()), 0);
  const todayBreakMs = breaks.filter((b) => b.clocked_out_at && b.clocked_in_at?.startsWith(ISO_TODAY))
    .reduce((s: number, b: any) => s + (new Date(b.clocked_out_at).getTime() - new Date(b.clocked_in_at).getTime()), 0);
  const todayNetMs = todayWorkMs - todayBreakMs + (activePunch && !activeBreak ? workElapsed : 0);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const weekWorkMs = punches.filter((p) => p.clocked_out_at && new Date(p.clocked_in_at) >= weekStart)
    .reduce((s: number, p: any) => s + (new Date(p.clocked_out_at).getTime() - new Date(p.clocked_in_at).getTime()), 0);
  const weekBreakMs = breaks.filter((b) => b.clocked_out_at && new Date(b.clocked_in_at) >= weekStart)
    .reduce((s: number, b: any) => s + (new Date(b.clocked_out_at).getTime() - new Date(b.clocked_in_at).getTime()), 0);
  const weekNetMs = weekWorkMs - weekBreakMs + (activePunch && !activeBreak ? workElapsed : 0);

  // pay estimate
  const payEst = (() => {
    if (!member?.pay_rate || member.pay_type !== "hourly") return null;
    const hrs = weekNetMs / 3600000;
    return (hrs * member.pay_rate).toFixed(2);
  })();

  // end of day shift summary (clocked out today, has entries)
  const shiftDone = !activePunch && todayWorkMs > 0;

  // history grouped by date
  const allCompleted = [...punches.filter((p) => p.clocked_out_at), ...breaks.filter((b) => b.clocked_out_at)];
  const historyByDate: Record<string, any[]> = {};
  allCompleted.forEach((e) => {
    const d = e.clocked_in_at.slice(0, 10);
    if (!historyByDate[d]) historyByDate[d] = [];
    historyByDate[d].push(e);
  });
  const historyDates = Object.keys(historyByDate).sort().reverse().slice(0, 30);

  // map center for selected day
  const todayCoords = selectedDayJobs.map((j) => jobCoords[j.id]).filter(Boolean) as [number, number][];
  const mapCenter: [number, number] = todayCoords.length
    ? [todayCoords.reduce((s, c) => s + c[0], 0) / todayCoords.length, todayCoords.reduce((s, c) => s + c[1], 0) / todayCoords.length]
    : [39.5, -98.35]; // US center fallback

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
      {/* hidden file input for photos */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />

      <div className="bg-white border-b border-paper-deep">
        <div className="px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-moss flex items-center justify-center flex-shrink-0">
            <Leaf className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-ink">{member.name}</p>
            <p className="text-[12px] text-ink-quiet capitalize">{member.role} · My Schedule</p>
          </div>
          {payEst && (
            <div className="text-right flex-shrink-0">
              <p className="text-[13px] font-bold text-ink flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{payEst}</p>
              <p className="text-[10px] text-ink-quiet">est. this week</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">

        {/* ── Upcoming job alert ── */}
        {upcomingJob && (
          <div className="bg-[#fff8e1] border-2 border-[#ffe082] rounded-xl px-4 py-3 flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#f57f17] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#e65100]">
                Upcoming in {(() => {
                  const [h, m] = upcomingJob.scheduled_time.split(":").map(Number);
                  const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
                  return diff <= 1 ? "less than a minute" : `${diff} min`;
                })()}
              </p>
              <p className="text-[12px] text-ink truncate">{upcomingJob.title} · {customerNames[upcomingJob.customer_id] ?? ""}</p>
            </div>
          </div>
        )}

        {/* ── Shift summary (end of day) ── */}
        {shiftDone && (
          <div className="bg-white border border-paper-deep rounded-xl px-5 py-4">
            <p className="text-[12px] font-semibold text-ink-quiet uppercase tracking-wide mb-3">Today's Shift Summary</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Work Time", value: fmtDuration(todayWorkMs) },
                { label: "Break Time", value: fmtDuration(todayBreakMs) },
                { label: "Net Time", value: fmtDuration(todayNetMs) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-paper-warm rounded-lg px-3 py-2.5">
                  <p className="text-[20px] font-bold text-ink">{value}</p>
                  <p className="text-[11px] text-ink-quiet mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            {payEst && (
              <p className="text-center text-[12px] text-ink-quiet mt-3">
                Est. week earnings: <span className="font-bold text-ink">${payEst}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Photo upload feedback ── */}
        {photoMsg && (
          <div className="bg-[#e8f5e9] border border-[#a5d6a7] rounded-xl px-4 py-3 text-[13px] font-semibold text-[#2e7d32] flex items-center gap-2">
            <Camera className="w-4 h-4" /> {photoMsg}
          </div>
        )}

        {/* ── Daily Punch Clock ── */}
        <div className={`rounded-2xl border-2 overflow-hidden ${
          activeBreak ? "border-[#e65100] bg-[#fff3e0]"
          : activePunch ? "border-[#2e7d32] bg-[#e8f5e9]"
          : "border-paper-deep bg-white"
        }`}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide mb-1"
                  style={{ color: activeBreak ? "#e65100" : activePunch ? "#2e7d32" : undefined, opacity: (!activeBreak && !activePunch) ? 0.5 : 1 }}>
                  {activeBreak ? `On ${activeBreak.break_type === "lunch" ? "Lunch" : "Short"} Break`
                    : activePunch ? "Currently Clocked In" : "Daily Time Clock"}
                </p>
                <p className="text-[13px] text-ink-quiet">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                {activeBreak && (() => {
                  const limitMs = (activeBreak.break_type === "lunch" ? breakSettings.lunch_break_mins : breakSettings.short_break_mins) * 60000;
                  const remaining = Math.max(0, limitMs - breakElapsed);
                  const pct = Math.min(100, Math.round((breakElapsed / limitMs) * 100));
                  const over = breakElapsed > limitMs;
                  return (
                    <div className="text-right">
                      <p className={`text-[32px] font-bold leading-none tabular-nums ${over ? "text-[#c62828]" : "text-[#e65100]"}`}>{fmtDuration(breakElapsed)}</p>
                      <p className={`text-[11px] mt-0.5 ${over ? "text-[#c62828] font-semibold" : "text-[#e65100]"}`}>
                        {over ? `${fmtDuration(breakElapsed - limitMs)} over` : `${fmtDuration(remaining)} left`}
                      </p>
                      <div className="w-32 h-1.5 bg-white/50 rounded-full overflow-hidden mt-1.5 ml-auto">
                        <div className={`h-full rounded-full transition-all ${over ? "bg-[#c62828]" : "bg-[#e65100]"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {!activeBreak && activePunch && (
                  <>
                    <p className="text-[32px] font-bold text-[#2e7d32] leading-none tabular-nums">{fmtDuration(workElapsed)}</p>
                    <p className="text-[11px] text-[#2e7d32] mt-0.5">since {fmtTime(activePunch.clocked_in_at)}</p>
                  </>
                )}
                {!activePunch && todayNetMs > 0 && (
                  <>
                    <p className="text-[28px] font-bold text-ink leading-none">{fmtDuration(todayNetMs)}</p>
                    <p className="text-[11px] text-ink-quiet mt-0.5">net today</p>
                  </>
                )}
              </div>
            </div>

            <button onClick={activePunch ? handleClockOut : handleClockIn} disabled={clocking || breaking}
              className={`w-full py-3.5 rounded-xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
                activePunch ? "bg-[#c62828] hover:bg-[#b71c1c] text-white" : "bg-[#2e7d32] hover:bg-[#1b5e20] text-white"}`}>
              {clocking ? <Loader2 className="w-4 h-4 animate-spin" />
                : activePunch ? <><StopCircle className="w-5 h-5" /> Clock Out</>
                : <><PlayCircle className="w-5 h-5" /> Clock In</>}
            </button>

            {activePunch && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {activeBreak?.break_type === "lunch" ? (
                  <button onClick={handleEndBreak} disabled={breaking}
                    className="py-3 rounded-xl font-semibold text-[13px] flex flex-col items-center justify-center gap-0.5 bg-[#e65100] hover:bg-[#bf360c] text-white transition-colors disabled:opacity-60">
                    {breaking ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <><span className="flex items-center gap-1.5"><UtensilsCrossed className="w-4 h-4" /> Clock Out Lunch</span>
                      <span className="text-[12px] font-bold tabular-nums opacity-90">{fmtDuration(breakElapsed)}</span></>
                    )}
                  </button>
                ) : (
                  <button onClick={() => handleStartBreak("lunch")} disabled={breaking || !!activeBreak}
                    className="py-3 rounded-xl font-semibold text-[13px] flex flex-col items-center justify-center gap-0.5 bg-white border-2 border-[#ffcc80] text-[#e65100] hover:bg-[#fff3e0] transition-colors disabled:opacity-40">
                    <span className="flex items-center gap-1.5"><UtensilsCrossed className="w-4 h-4" /> Start Lunch</span>
                    <span className="text-[11px] font-medium opacity-70">{breakSettings.lunch_break_mins} min</span>
                  </button>
                )}
                {activeBreak?.break_type === "short" ? (
                  <button onClick={handleEndBreak} disabled={breaking}
                    className="py-3 rounded-xl font-semibold text-[13px] flex flex-col items-center justify-center gap-0.5 bg-[#e65100] hover:bg-[#bf360c] text-white transition-colors disabled:opacity-60">
                    {breaking ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <><span className="flex items-center gap-1.5"><Coffee className="w-4 h-4" /> Clock Out Break</span>
                      <span className="text-[12px] font-bold tabular-nums opacity-90">{fmtDuration(breakElapsed)}</span></>
                    )}
                  </button>
                ) : (
                  <button onClick={() => handleStartBreak("short")} disabled={breaking || !!activeBreak}
                    className="py-3 rounded-xl font-semibold text-[13px] flex flex-col items-center justify-center gap-0.5 bg-white border-2 border-[#ffcc80] text-[#e65100] hover:bg-[#fff3e0] transition-colors disabled:opacity-40">
                    <span className="flex items-center gap-1.5"><Coffee className="w-4 h-4" /> Start Break</span>
                    <span className="text-[11px] font-medium opacity-70">{breakSettings.short_break_mins} min</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={`grid grid-cols-2 divide-x border-t ${
            activeBreak ? "border-[#ffcc80] divide-[#ffcc80]"
            : activePunch ? "border-[#a5d6a7] divide-[#a5d6a7]"
            : "border-paper-deep divide-paper-deep"}`}>
            <div className="px-5 py-3 text-center">
              <p className="text-[22px] font-bold text-ink">{fmtDuration(todayNetMs)}</p>
              <p className="text-[11px] text-ink-quiet mt-0.5">Today (net)</p>
            </div>
            <div className="px-5 py-3 text-center">
              <p className="text-[22px] font-bold text-ink">{fmtDuration(weekNetMs)}</p>
              <p className="text-[11px] text-ink-quiet mt-0.5">This Week (net)</p>
            </div>
          </div>
        </div>

        {/* ── Time History ── */}
        {historyDates.length > 0 && (
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
            <button onClick={() => setShowHistory((h) => !h)}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-paper-warm transition-colors">
              <p className="text-[13px] font-semibold text-ink flex items-center gap-2">
                <History className="w-4 h-4 text-ink-quiet" /> Time History
              </p>
              <ChevronRight className={`w-4 h-4 text-ink-quiet transition-transform ${showHistory ? "rotate-90" : ""}`} />
            </button>
            {showHistory && (
              <div className="divide-y divide-paper-deep border-t border-paper-deep">
                {historyDates.map((date) => {
                  const dayEntries = historyByDate[date].sort((a: any, b: any) =>
                    new Date(a.clocked_in_at).getTime() - new Date(b.clocked_in_at).getTime());
                  const dayWorkMs = dayEntries.filter((e: any) => !e.break_type)
                    .reduce((s: number, e: any) => s + (new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime()), 0);
                  const dayBreakMs = dayEntries.filter((e: any) => e.break_type)
                    .reduce((s: number, e: any) => s + (new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime()), 0);
                  return (
                    <div key={date} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] font-semibold text-ink">{fmtDate(date)}</p>
                        <p className="text-[13px] font-bold text-ink">{fmtDuration(dayWorkMs - dayBreakMs)} net</p>
                      </div>
                      {dayEntries.map((e: any) => {
                        const durationMs = new Date(e.clocked_out_at).getTime() - new Date(e.clocked_in_at).getTime();
                        let breakColor = "";
                        if (e.break_type) {
                          const limitMs = (e.break_type === "lunch" ? breakSettings.lunch_break_mins : breakSettings.short_break_mins) * 60000;
                          breakColor = durationMs > limitMs ? "text-[#c62828]" : "text-ink";
                        }
                        return (
                          <div key={e.id} className={`flex items-center gap-2 text-[11px] pl-1 mb-0.5 ${e.break_type ? breakColor : "text-ink-quiet"}`}>
                            {e.break_type
                              ? (e.break_type === "lunch" ? <UtensilsCrossed className="w-3 h-3 flex-shrink-0" /> : <Coffee className="w-3 h-3 flex-shrink-0" />)
                              : <span className="w-1 h-1 rounded-full bg-ink-quiet flex-shrink-0 mt-0.5" />}
                            <span className="capitalize">{e.break_type ? `${e.break_type} break` : "Work"}</span>
                            <span>· {fmtTime(e.clocked_in_at)} – {fmtTime(e.clocked_out_at)}</span>
                            {e.break_type && durationMs > (e.break_type === "lunch" ? breakSettings.lunch_break_mins : breakSettings.short_break_mins) * 60000 && (
                              <span className="text-[10px] font-semibold text-[#c62828]">over</span>
                            )}
                            <span className="ml-auto font-semibold">{e.break_type ? "−" : ""}{fmtDuration(durationMs)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Calendar nav ── */}
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 text-[13px] font-medium text-ink-soft bg-white border border-paper-deep rounded-lg hover:bg-paper-warm transition-colors">
            Today
          </button>
          <div className="flex items-center border border-paper-deep rounded-lg overflow-hidden bg-white">
            <button onClick={prevMonth} className="p-2 hover:bg-paper-warm transition-colors">
              <ChevronLeft className="w-4 h-4 text-ink-soft" />
            </button>
            <span className="px-3 text-[14px] font-semibold text-ink min-w-36 text-center">{MONTHS[month]} {year}</span>
            <button onClick={nextMonth} className="p-2 hover:bg-paper-warm transition-colors">
              <ChevronRight className="w-4 h-4 text-ink-soft" />
            </button>
          </div>
        </div>

        {/* ── Monthly totals ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: monthJobs.length },
            { label: "Scheduled", value: monthJobs.filter((j) => ["scheduled","in-progress","quoted"].includes(j.status)).length },
            { label: "Completed", value: monthJobs.filter((j) => ["complete","invoiced"].includes(j.status)).length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-paper-deep px-4 py-3 flex items-center justify-between">
              <p className="text-[12px] text-ink-quiet font-medium">{label}</p>
              <p className="text-[22px] font-bold text-ink leading-none">{value}</p>
            </div>
          ))}
        </div>

        {/* ── Calendar grid ── */}
        <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
          <div className="grid grid-cols-7 border-b border-paper-deep">
            {DAY_HEADERS.map((d) => (
              <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-ink-quiet uppercase tracking-wide border-r border-paper-deep last:border-r-0">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((date, idx) => {
              if (!date) return <div key={`e-${idx}`} className="border-r border-b border-paper-deep last:border-r-0 min-h-[80px] bg-paper-warm/40" />;
              const iso = toISO(date.getFullYear(), date.getMonth(), date.getDate());
              const isToday = iso === ISO_TODAY;
              const isSelected = iso === selectedISO;
              const isCurrentMonth = date.getMonth() === month;
              const dayJobs = jobs.filter((j) => j.scheduled_date === iso);
              return (
                <div key={iso} onClick={() => setSelectedISO(iso === selectedISO ? null : iso)}
                  className={`border-r border-b border-paper-deep last:border-r-0 min-h-[80px] p-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                    isSelected ? "ring-2 ring-inset ring-accent bg-accent/5"
                    : isToday ? "bg-accent/5 hover:bg-accent/10"
                    : isCurrentMonth ? "bg-white hover:bg-paper-warm"
                    : "bg-paper-warm/30 hover:bg-paper-warm/60"}`}>
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[13px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-accent text-white" : isCurrentMonth ? "text-ink" : "text-ink-quiet"}`}>
                      {date.getDate()}
                    </span>
                    {dayJobs.length > 0 && <span className="text-[10px] text-ink-quiet">{dayJobs.length}</span>}
                  </div>
                  {dayJobs.slice(0, 2).map((job) => (
                    <div key={job.id} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium leading-tight truncate ${SERVICE_COLORS[job.service_type] ?? SERVICE_COLORS.custom}`}>
                      {customerNames[job.customer_id] || job.title}
                    </div>
                  ))}
                  {dayJobs.length > 2 && <span className="text-[10px] text-ink-quiet px-1">+{dayJobs.length - 2}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Selected day panel ── */}
        {selectedISO && selectedDate && (
          <div className="bg-white rounded-xl border border-paper-deep overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-paper-deep bg-paper-warm">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <p className="text-[12px] text-ink-quiet mt-0.5">
                  {selectedDayJobs.length === 0 ? "No jobs scheduled" : `${selectedDayJobs.length} job${selectedDayJobs.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {todayCoords.length > 0 && (
                  <button onClick={() => setShowMap((m) => !m)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white border border-paper-deep text-ink-soft hover:bg-paper-warm transition-colors">
                    <MapPin className="w-3.5 h-3.5" /> {showMap ? "Hide Map" : "Show Map"}
                  </button>
                )}
                {(() => {
                  const addressed = selectedDayJobs.filter((j) => customerAddresses[j.customer_id]);
                  if (addressed.length < 2) return null;
                  const wps = addressed.slice(0, -1).map((j: any) => encodeURIComponent(customerAddresses[j.customer_id])).join("|");
                  const dest = encodeURIComponent(customerAddresses[addressed[addressed.length - 1].customer_id]);
                  return (
                    <a href={`https://www.google.com/maps/dir/?api=1&waypoints=${wps}&destination=${dest}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb] transition-colors border border-[#90caf9]">
                      <Navigation className="w-3.5 h-3.5" /> Route All
                    </a>
                  );
                })()}
              </div>
            </div>

            {/* Map */}
            {showMap && todayCoords.length > 0 && (
              <div className="border-b border-paper-deep" style={{ height: 220 }}>
                <Map center={mapCenter} zoom={todayCoords.length === 1 ? 13 : 11} attribution={false}>
                  {selectedDayJobs.map((job, i) => {
                    const coords = jobCoords[job.id];
                    if (!coords) return null;
                    return (
                      <Marker key={job.id} anchor={coords} payload={job.id}>
                        <div
                          style={{ background: PIN_COLORS[i % PIN_COLORS.length] }}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-md border-2 border-white cursor-pointer"
                          title={customerNames[job.customer_id] ?? job.title}
                        >
                          {i + 1}
                        </div>
                      </Marker>
                    );
                  })}
                </Map>
              </div>
            )}

            {/* Job list */}
            {selectedDayJobs.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-ink-quiet">No jobs scheduled.</p>
            ) : (
              <div className="divide-y divide-paper-deep">
                {selectedDayJobs.map((job: any, i: number) => {
                  const addr = customerAddresses[job.customer_id];
                  const STATUS_NEXT: Record<string, string> = {
                    scheduled: "in-progress",
                    quoted: "in-progress",
                    "in-progress": "complete",
                  };
                  const STATUS_LABEL: Record<string, string> = {
                    scheduled: "Start Job",
                    quoted: "Start Job",
                    "in-progress": "Mark Done",
                    complete: "Done ✓",
                  };
                  const pinColor = PIN_COLORS[i % PIN_COLORS.length];
                  return (
                    <div key={job.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5"
                          style={{ background: pinColor }}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[14px] font-semibold text-ink">{job.title}</p>
                            {job.scheduled_time && (
                              <span className="flex items-center gap-1 text-[11px] text-ink-quiet">
                                <Clock className="w-3 h-3" />{job.scheduled_time}
                              </span>
                            )}
                          </div>
                          <p className="text-[12px] text-ink-quiet mt-0.5">{customerNames[job.customer_id] ?? ""}</p>
                          {addr && (
                            <p className="text-[11px] text-ink-quiet flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 flex-shrink-0" />{addr}
                            </p>
                          )}
                          {job.notes && (
                            <p className="text-[11px] text-ink-quiet bg-paper-warm rounded-lg px-2 py-1.5 mt-2 italic">"{job.notes}"</p>
                          )}
                        </div>
                      </div>
                      {/* Job actions */}
                      <div className="flex items-center gap-2 mt-3 pl-9">
                        {addr && (
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#e3f2fd] text-[#1565c0] hover:bg-[#bbdefb] transition-colors border border-[#90caf9]">
                            <Navigation className="w-3 h-3" /> Directions
                          </a>
                        )}
                        {STATUS_NEXT[job.status] && (
                          <button
                            onClick={() => updateJobStatus(job.id, STATUS_NEXT[job.status])}
                            disabled={updatingJob === job.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#e8f5e9] text-[#2e7d32] hover:bg-[#c8e6c9] transition-colors border border-[#a5d6a7] disabled:opacity-50">
                            {updatingJob === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : STATUS_LABEL[job.status]}
                          </button>
                        )}
                        {job.status === "complete" && (
                          <span className="text-[11px] font-semibold text-[#2e7d32]">✓ Complete</span>
                        )}
                        <button
                          onClick={() => { setPhotoJobId(job.id); fileInputRef.current?.click(); }}
                          disabled={uploadingJob === job.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-paper-warm text-ink-soft hover:bg-paper-dark transition-colors border border-paper-deep disabled:opacity-50">
                          {uploadingJob === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Camera className="w-3 h-3" /> Photo</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
