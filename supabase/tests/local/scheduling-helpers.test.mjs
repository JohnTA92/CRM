import assert from 'node:assert/strict';
import {jobConflictsWith} from '../../../src/lib/scheduling.ts';

const base={id:'a',status:'scheduled',scheduled_date:'2026-10-01',scheduled_time:'09:00',duration_minutes:60,crew_member_ids:['crew-1']};
const existing=[base,{...base,id:'b',scheduled_time:'10:30',crew_member_ids:['crew-2']}];

// Reassigning the unassigned/other-crew job to overlap crew-1 surfaces the conflict.
assert.deepEqual(jobConflictsWith(existing,{...existing[1],crew_member_ids:['crew-1'],scheduled_time:'09:30'}).map(j=>j.id),['a']);

// A non-overlapping time for the same crew has no conflict.
assert.deepEqual(jobConflictsWith(existing,{...existing[1],crew_member_ids:['crew-1'],scheduled_time:'11:00'}).map(j=>j.id),[]);

// The candidate never conflicts with itself.
assert.deepEqual(jobConflictsWith([base],{...base}),[]);

// Draft/quote-less statuses, missing time, or no crew never produce a preview.
assert.deepEqual(jobConflictsWith(existing,{...existing[1],crew_member_ids:['crew-1'],status:'draft'}),[]);
assert.deepEqual(jobConflictsWith(existing,{...existing[1],crew_member_ids:['crew-1'],scheduled_time:null}),[]);
assert.deepEqual(jobConflictsWith(existing,{...existing[1],crew_member_ids:[]}),[]);

// Existing cancelled/closed jobs on the board don't block a new assignment.
assert.deepEqual(jobConflictsWith([{...base,status:'cancelled'}],{...base,id:'c',crew_member_ids:['crew-1']}),[]);

// Midnight-crossing overlap is still detected (mirrors schedulingConflicts coverage).
const late={id:'d',status:'scheduled',scheduled_date:'2026-10-01',scheduled_time:'23:30',duration_minutes:90,crew_member_ids:['crew-3']};
assert.deepEqual(jobConflictsWith([late],{id:'e',status:'scheduled',scheduled_date:'2026-10-02',scheduled_time:'00:30',duration_minutes:30,crew_member_ids:['crew-3']}).map(j=>j.id),['d']);

console.log('PASS: single-job conflict preview for crew reassignment and rescheduling.');
