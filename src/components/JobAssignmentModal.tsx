import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { jobConflictsWith, type ScheduledJob } from "@/lib/scheduling";
import { Button } from "@/design-system/primitives/Button";
import { X, AlertCircle, CheckCircle2 } from "lucide-react";

export interface AssignableJob extends ScheduledJob {
  title: string;
  customerName?: string;
}

interface CrewOption {
  id: string;
  name: string;
}

interface JobAssignmentModalProps {
  job: AssignableJob;
  crew: CrewOption[];
  boardJobs: ScheduledJob[];
  businessId: string;
  onClose: () => void;
  onSaved: (updated: ScheduledJob) => void;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

/**
 * Shared dispatcher-side modal for assigning crew and/or rescheduling a job from
 * either the crew board (SchedulingPage) or the calendar (SchedulePage). Writes
 * directly to the jobs table — the same trusted path JobDetailPage uses — so all
 * server-side validation (crew membership, duration bounds, time-without-date,
 * tenant scoping) still applies. Conflict preview is a warning, not a block,
 * matching the crew board's existing "warnings, not booking locks" convention.
 */
export function JobAssignmentModal({ job, crew, boardJobs, businessId, onClose, onSaved }: JobAssignmentModalProps) {
  const [date, setDate] = useState(job.scheduled_date ?? "");
  const [time, setTime] = useState(job.scheduled_time ?? "");
  const [duration, setDuration] = useState(String(job.duration_minutes ?? 60));
  const [crewIds, setCrewIds] = useState<string[]>(job.crew_member_ids ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationNum = Number(duration);
  const durationInvalid = !Number.isInteger(durationNum) || durationNum < 1 || durationNum > 1440;

  const candidate: ScheduledJob = {
    id: job.id,
    status: job.status,
    scheduled_date: date || null,
    scheduled_time: time || null,
    duration_minutes: durationInvalid ? undefined : durationNum,
    crew_member_ids: crewIds,
  };

  const conflicts = useMemo(
    () => jobConflictsWith(boardJobs, candidate),
    [boardJobs, candidate.scheduled_date, candidate.scheduled_time, candidate.duration_minutes, crewIds.join(",")],
  );

  function toggleCrew(id: string) {
    setCrewIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function save() {
    if (saving) return;
    if (durationInvalid) { setError("Duration must be 1–1440 whole minutes."); return; }
    if (time && !date) { setError("Choose a date before setting a time."); return; }
    setSaving(true);
    setError(null);
    const { data, error: saveErr } = await supabase
      .from("jobs")
      .update({
        scheduled_date: date || null,
        scheduled_time: time || null,
        duration_minutes: durationNum,
        crew_member_ids: crewIds,
      })
      .eq("id", job.id)
      .eq("business_id", businessId)
      .select("id, status, scheduled_date, scheduled_time, duration_minutes, crew_member_ids")
      .single();
    setSaving(false);
    if (saveErr) { setError(saveErr.message); return; }
    if (data) onSaved(data as ScheduledJob);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-[var(--shadow-modal)] w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-paper-deep">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-ink truncate">Assign &amp; Reschedule</h2>
            <p className="text-[12px] text-ink-quiet truncate">{job.title}{job.customerName ? ` · ${job.customerName}` : ""}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-paper-warm text-ink-quiet flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 text-[14px] border border-paper-deep rounded-lg bg-white focus:outline-none focus:border-ink transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="1440"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={`w-full px-3 py-2.5 text-[14px] border rounded-lg bg-white focus:outline-none transition-colors ${
                durationInvalid ? "border-accent" : "border-paper-deep focus:border-ink"
              }`}
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-ink-quiet mb-1.5">Crew</label>
            {crew.length === 0 ? (
              <p className="text-[13px] text-ink-quiet">No active crew members.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {crew.map((m) => {
                  const assigned = crewIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleCrew(m.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px] font-medium transition-colors ${
                        assigned ? "bg-ink text-white border-ink" : "bg-white text-ink-soft border-paper-deep hover:bg-paper-warm"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${assigned ? "bg-white/20 text-white" : "bg-paper-dark text-ink-soft"}`}>
                        {initials(m.name)}
                      </span>
                      {m.name}
                      {assigned && <CheckCircle2 className="w-3.5 h-3.5 opacity-70" />}
                    </button>
                  );
                })}
              </div>
            )}
            {crewIds.length === 0 && <p className="text-[11px] text-ink-quiet mt-1.5">No crew assigned — this job will show as unassigned.</p>}
          </div>

          <p className="text-[11px] text-ink-quiet">Overlap checks use assigned crew, start time and duration. Visits without a time cannot be checked.</p>

          {conflicts.length > 0 && (
            <div role="alert" className="p-3 border border-orange-300 rounded-lg bg-[#fff8e1]">
              <p className="text-[12px] font-semibold text-[#e65100] flex items-center gap-1.5 mb-1">
                <AlertCircle className="w-3.5 h-3.5" /> Possible schedule conflict
              </p>
              {conflicts.map((c) => (
                <p key={c.id} className="text-[12px] text-[#e65100]">
                  Overlaps a job on {c.scheduled_date} at {c.scheduled_time}. Review crew, time or duration.
                </p>
              ))}
            </div>
          )}

          {error && (
            <div role="alert" className="bg-[#ffebee] border border-[#ef9a9a] rounded-lg px-4 py-3 text-[13px] text-[#b71c1c]">{error}</div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-paper-deep">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>
    </div>
  );
}
