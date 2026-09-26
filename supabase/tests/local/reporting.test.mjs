import assert from 'node:assert/strict';
import { buildFinancialReport, collectReportPages, reportDate } from '../../../src/lib/reporting.ts';
const jobs = [{id:'job',title:'Fixture job',created_at:'2025-12-01'}];
const invoices = [
 {id:'i',job_id:'job',status:'sent',total:'100.30',paid_total:'40.10',due_at:'2026-01-01'},
 {id:'paid',job_id:'job',status:'paid',total:10,paid_total:10},
 {id:'draft',job_id:'job',status:'draft',total:999,paid_total:0},
 {id:'void',job_id:'job',status:'voided',total:500,paid_total:0},
 {id:'unlinked',status:'sent',total:20,paid_total:0,due_at:'2026-09-26'},
];
const payments = [
 {id:'p',invoice_id:'i',amount:'40.10',paid_at:'2026-01-01T00:00:00Z'},
 {id:'old',invoice_id:'paid',amount:10,paid_at:'2025-12-31T12:00:00Z'},
];
const expenses = [
 {id:'e',job_id:'job',amount:'0.10',date:'2026-01-01'},
 {id:'e2',job_id:'job',amount:'0.20',date:'2026-01-02'},
 {id:'e3',amount:5,date:'2026-01-03'},
 {id:'old',job_id:'job',amount:15,date:'2025-12-01'},
];
const result = buildFinancialReport(invoices,payments,expenses,jobs,2026,'2026-09-26');
assert.equal(result.revenue,40.10); assert.equal(result.expenses,5.30); assert.equal(result.cash,34.80);
assert.equal(result.billed,130.30); assert.equal(result.collected,50.10);
assert.equal(result.outstanding,80.20); assert.equal(result.overdue,60.20); // Due today is not overdue.
assert.equal(result.billed,result.collected+result.outstanding);
assert.equal(result.ledgerMismatches,0); assert.equal(result.orphanPayments,0); assert.equal(result.invalidPayments,0);
assert.equal(result.jobRows[0].billed,110.30); assert.equal(result.jobRows[0].costs,15.30);
assert.equal(result.jobRows[0].contribution,95); assert.equal(result.jobRows[0].cash,34.80);
assert.equal(result.unassignedExpenses,5); assert.equal(result.unassignedBilled,20);
assert.equal(result.monthly[0].revenue,40.10); assert.equal(result.monthly[0].expenses,5.30);
assert.equal(reportDate('2025-12-31T23:30:00-08:00'),'2026-01-01');
assert.equal(buildFinancialReport([],[],[],[],2026).cash,0);
assert.equal(buildFinancialReport([],[],[{id:'loss',amount:2,date:'2026-01-01'}],[],2026).cash,-2);
assert.equal(buildFinancialReport([{...invoices[0],paid_total:0}],payments,[],[],2026).ledgerMismatches,1);
assert.equal(buildFinancialReport([],payments,[],[],2026).orphanPayments,2);
assert.equal(buildFinancialReport([{...invoices[0],status:'draft'}],payments.slice(0,1),[],[],2026).invalidPayments,1);
assert.equal(buildFinancialReport([{...invoices[0],total:1}],payments.slice(0,1),[],[],2026).invalidPayments,1);
// Server may cap pages below the requested 500 rows. Continue from the actual count.
const rows = Array.from({length:1207},(_,i)=>({id:String(i)}));
let calls=0;
const loaded = await collectReportPages(async (from,to) => {calls++;return {data:rows.slice(from,Math.min(to+1,from+200)),count:rows.length,error:null};});
assert.deepEqual(loaded,rows); assert.equal(calls,7);
await assert.rejects(collectReportPages(async()=>({data:null,count:null,error:{message:'Denied'}})),/Denied/);
await assert.rejects(collectReportPages(async()=>({data:[],count:1,error:null})),/all records/);
await assert.rejects(collectReportPages(async()=>({data:[{id:'repeat'}],count:2,error:null})),/Records changed/);
await assert.rejects(collectReportPages(async from=>({data:[{id:String(from)}],count:from?3:2,error:null})),/Records changed/);
assert.deepEqual(await collectReportPages(async()=>({data:[],count:0,error:null})),[]);
console.log('PASS: cash vs billed reconciliation, job contributions, date boundaries, excluded invoices, ledger anomalies, precision, and complete pagination.');

const { calculateLabor, allocateOverhead } = await import('../../../src/lib/jobCosting.ts');
const time=(id,job,crew,start,end,rate=20,breakType=null)=>({id,job_id:job,crew_member_id:crew,clocked_in_at:start,clocked_out_at:end,labor_hourly_rate:rate,break_type:breakType});
const laborTimes=[
 time('a','a','c','2026-01-02T08:00:00Z','2026-01-02T10:00:00Z'),
 time('break',null,'c','2026-01-02T08:30:00Z','2026-01-02T09:00:00Z',null,'lunch'),
 time('overlap-break',null,'c','2026-01-02T08:45:00Z','2026-01-02T09:00:00Z',null,'short'),
 time('b','b','d','2026-01-02T08:00:00Z','2026-01-02T08:30:00Z',40),
 time('shift',null,'c','2026-01-02T07:00:00Z','2026-01-02T11:00:00Z'),
];
const labor=calculateLabor(laborTimes);
assert.equal(labor.months[0].costCents,3000);assert.equal(labor.months[0].milliseconds,5400000);
assert.equal(labor.unassignedShifts,1);
assert.deepEqual([...allocateOverhead(101,new Map([['a',1],['b',1],['c',1]]))],[['a',34],['b',34],['c',33]]);
assert.equal(allocateOverhead(100,new Map()).size,0);
const crossing=calculateLabor([time('cross','a','c','2026-01-31T23:30:00Z','2026-02-01T00:30:00Z')]);
assert.deepEqual(crossing.months.map(m=>[m.month,m.costCents]),[['2026-01',1000],['2026-02',1000]]);
assert.equal(calculateLabor([time('missing','a','c','2026-01-01T00:00:00Z','2026-01-01T01:00:00Z',null)]).months[0].missingRate,true);
assert.equal(calculateLabor([time('open','a','c','2026-01-01T00:00:00Z',null)]).issues,1);
assert.equal(calculateLabor([laborTimes[0],{...laborTimes[0],id:'dup',job_id:'b'}]).issues,2);
assert.equal(calculateLabor([laborTimes[0],{...laborTimes[1],clocked_out_at:null}]).issues,1);
const jobSet=[{id:'a',title:'A',created_at:'2026-01-01',labor_cost_source:'time'},{id:'b',title:'B',created_at:'2026-01-01',labor_cost_source:'expenses'}];
const costExpenses=[{id:'oh',amount:100,date:'2026-01-03',category:'overhead'},{id:'future-oh',amount:20,date:'2026-02-03',category:'overhead'},
 {id:'manual-a',job_id:'a',amount:50,date:'2026-01-03',category:'labor'}, {id:'manual-b',job_id:'b',amount:25,date:'2026-01-03',category:'labor'},
 {id:'materials',job_id:'a',amount:10,date:'2026-01-03',category:'materials'}];
const costReport=buildFinancialReport([],[],costExpenses,jobSet,2026,undefined,{timeEntries:laborTimes});
const a=costReport.jobRows.find(j=>j.id==='a'),b=costReport.jobRows.find(j=>j.id==='b');
assert.equal(a.laborCost,30);assert.equal(a.overhead,75);assert.equal(a.costs,115);assert.equal(a.cashCosts,60);
assert.equal(b.laborCost,25);assert.equal(b.overhead,25);assert.equal(b.costs,50);
assert.equal(costReport.allocatedOverhead,100);assert.equal(costReport.unallocatedOverhead,20);assert.equal(costReport.unassignedExpenses,20);
assert.equal(costReport.expenses,205); // Automatic labor/overhead not added again to cash expenses.
const refund=[{id:'r',invoice_id:'i',payment_id:'p',amount:10,refunded_at:'2027-01-01T00:00:00Z'}];
const withRefund=buildFinancialReport(invoices.map(i=>i.id==='i'?{...i,refunded_total:10}:i),payments,expenses,jobs,2027,'2027-01-01',{refunds:refund});
assert.equal(withRefund.revenue,-10);assert.equal(withRefund.refunds,10);assert.equal(withRefund.billed,120.30);assert.equal(withRefund.collected,40.10);assert.equal(withRefund.outstanding,80.20);assert.equal(withRefund.refundMismatches,0);
assert.equal(withRefund.jobRows[0].contribution,85);assert.equal(withRefund.jobRows[0].cash,24.80);
console.log('PASS: saved-rate labor, break unions, overlapping/open time, month splits, hour-weighted overhead to the cent, manual labor fallback, cash non-duplication, and cross-year refunds.');
