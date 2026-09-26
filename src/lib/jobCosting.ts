export type CostTime = { id: string; job_id?: string | null; crew_member_id?: string | null; clocked_in_at: string; clocked_out_at?: string | null; break_type?: string | null; labor_hourly_rate?: number | string | null };
export type LaborMonth = { jobId: string; month: string; milliseconds: number; costCents: number; missingRate: boolean };
const timestamp = (value: string) => new Date(value).getTime();

function subtractBreaks(start: number, end: number, breaks: [number,number][]) {
  let segments: [number,number][] = [[start,end]];
  for (const [a,b] of breaks) segments = segments.flatMap(([s,e]) => b<=s || a>=e ? [[s,e]] : [...(a>s ? [[s,a]] : []), ...(b<e ? [[b,e]] : [])]) as [number,number][];
  return segments;
}

export function calculateLabor(entries: CostTime[]) {
  const months: LaborMonth[] = [];
  const issues = new Set<string>();
  const work = entries.filter(e => e.job_id && !e.break_type);
  for (const entry of work) {
    if (!entry.clocked_out_at) { issues.add(entry.id); continue; }
    const start = timestamp(entry.clocked_in_at), end = timestamp(entry.clocked_out_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start || !entry.crew_member_id) { issues.add(entry.id); continue; }
    if (work.some(other => other.id!==entry.id && other.crew_member_id===entry.crew_member_id && timestamp(other.clocked_in_at)<end && (!other.clocked_out_at || timestamp(other.clocked_out_at)>start))) {
      issues.add(entry.id); continue;
    }
    if(entries.some(b=>b.break_type&&b.crew_member_id===entry.crew_member_id&&!b.clocked_out_at&&timestamp(b.clocked_in_at)<end)){issues.add(entry.id);continue;}
    const breaks = entries.filter(b => b.break_type && b.crew_member_id===entry.crew_member_id)
      .map(b => [timestamp(b.clocked_in_at), b.clocked_out_at ? timestamp(b.clocked_out_at) : end] as [number,number]).filter(([s,e])=>Number.isFinite(s)&&Number.isFinite(e)&&e>s);
    const durationByMonth = new Map<string,number>();
    for (const [s,e] of subtractBreaks(start,end,breaks)) {
      let cursor = s;
      while (cursor<e) {
        const d = new Date(cursor);
        const stop = Math.min(e,Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));
        const month = d.toISOString().slice(0,7);
        durationByMonth.set(month,(durationByMonth.get(month) ?? 0)+stop-cursor);
        cursor=stop;
      }
    }
    const rate = entry.labor_hourly_rate;
    const missingRate = rate===null || rate===undefined || !Number.isFinite(Number(rate)) || Number(rate)<0;
    for (const [month,milliseconds] of durationByMonth) months.push({jobId:entry.job_id!,month,milliseconds,costCents:missingRate ? 0 : Number((BigInt(milliseconds)*BigInt(Math.round(Number(rate)*100))+1800000n)/3600000n),missingRate});
  }
  return {months,issues:issues.size,issueJobs:new Set(work.filter(e=>issues.has(e.id)).map(e=>e.job_id!)),unassignedShifts:entries.filter(e=>!e.job_id&&!e.break_type).length};
}

// Largest remainders distribute every cent exactly once, with stable job-ID tie breaking.
export function allocateOverhead(cents: number, weights: Map<string,number>) {
  const eligible = [...weights].filter(([,weight])=>weight>0).sort(([a],[b])=>a.localeCompare(b));
  const totalWeight = eligible.reduce((sum,[,weight])=>sum+weight,0);
  if (!totalWeight) return new Map<string,number>();
  const sign = cents<0 ? -1 : 1;
  const rows = eligible.map(([id,weight])=> {const exact=Math.abs(cents)*weight/totalWeight; return {id,value:Math.floor(exact),remainder:exact-Math.floor(exact)};});
  let left = Math.abs(cents)-rows.reduce((sum,row)=>sum+row.value,0);
  const byRemainder=[...rows].sort((a,b)=>b.remainder-a.remainder || a.id.localeCompare(b.id));
  for (let i=0;left>0;i++,left--) byRemainder[i%byRemainder.length].value++;
  return new Map(rows.map(row=>[row.id,row.value*sign]));
}
