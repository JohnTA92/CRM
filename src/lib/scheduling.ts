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
