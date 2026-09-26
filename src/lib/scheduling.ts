export type ScheduledJob = { id: string; title?: string; status: string; scheduled_date: string | null; scheduled_time: string | null; duration_minutes?: number; crew_member_ids?: string[] };
export function schedulingConflicts(jobs: ScheduledJob[]): [ScheduledJob, ScheduledJob][] {
  const active = jobs.filter(j => ['scheduled','in-progress','quoted'].includes(j.status) && j.scheduled_date && j.scheduled_time && j.crew_member_ids?.length);
  const start = (j: ScheduledJob) => Date.parse(`${j.scheduled_date}T${j.scheduled_time}Z`);
  const conflicts: [ScheduledJob,ScheduledJob][] = [];
  for (let i=0;i<active.length;i++) for (let k=i+1;k<active.length;k++) {
    const a=active[i], b=active[k];
    if (a.crew_member_ids!.some(id=>b.crew_member_ids!.includes(id)) && start(a)<start(b)+(b.duration_minutes??60)*60000 && start(b)<start(a)+(a.duration_minutes??60)*60000) conflicts.push([a,b]);
  }
  return conflicts;
}
export function isClosedJob(status: string) { return ['complete','invoiced','cancelled'].includes(status); }

// Pre-save conflict preview for a single candidate job (new assignment or reschedule)
// against the rest of the board. Same overlap rule as schedulingConflicts, but scoped
// to one job so the UI can warn before committing rather than only after reload.
export function jobConflictsWith(jobs: ScheduledJob[], candidate: ScheduledJob): ScheduledJob[] {
  if (!['scheduled','in-progress','quoted'].includes(candidate.status) || !candidate.scheduled_date || !candidate.scheduled_time || !candidate.crew_member_ids?.length) return [];
  const start = (j: ScheduledJob) => Date.parse(`${j.scheduled_date}T${j.scheduled_time}Z`);
  const cStart = start(candidate);
  const cEnd = cStart + (candidate.duration_minutes ?? 60) * 60000;
  return jobs.filter((j) => {
    if (j.id === candidate.id) return false;
    if (!['scheduled','in-progress','quoted'].includes(j.status) || !j.scheduled_date || !j.scheduled_time || !j.crew_member_ids?.length) return false;
    if (!j.crew_member_ids.some((id) => candidate.crew_member_ids!.includes(id))) return false;
    const jStart = start(j);
    const jEnd = jStart + (j.duration_minutes ?? 60) * 60000;
    return cStart < jEnd && jStart < cEnd;
  });
}
