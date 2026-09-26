import assert from 'node:assert/strict';
import {normalizePhone,normalizeEmail,normalizeName,normalizeAddress,matchesCustomerQuery,findDuplicateGroups} from '../../../src/lib/customerMatching.ts';

// Normalization
for(const phone of ['(555) 123-4567','555.123.4567','555 123 4567','+1 555-123-4567','1-555-123-4567'])
  assert.equal(normalizePhone(phone),'5551234567');
assert.equal(normalizePhone(null),'');
assert.equal(normalizePhone('2025550147'),'2025550147');
// A genuine 11-digit non-US-prefixed number keeps every digit.
assert.equal(normalizePhone('25551234567'),'25551234567');

assert.equal(normalizeEmail('  Jane@Example.COM '),'jane@example.com');
assert.equal(normalizeEmail(undefined),'');
assert.equal(normalizeName('  Jane   SMITH '),'jane smith');
assert.equal(normalizeAddress({id:'a',address:' 634 Flaming Rd ',city:'Grants Pass',state:'OR',zip:'97526'}),'634 flaming rd grants pass or 97526');
assert.equal(normalizeAddress({id:'a'}),'');

// Search: formatting-insensitive phone, out-of-order name tokens, tags, empty query
const jane={id:'1',name:'Jane Smith',email:'Jane@Example.com',phone:'(555) 123-4567',address:'634 Flaming Rd',city:'Grants Pass',state:'OR',zip:'97526',tags:['VIP']};
for(const q of ['5551234567','555-123-4567','(555) 123','555 123 4567'])
  assert.equal(matchesCustomerQuery(jane,q),true);
assert.equal(matchesCustomerQuery(jane,'smith jane'),true);
assert.equal(matchesCustomerQuery(jane,'JANE'),true);
assert.equal(matchesCustomerQuery(jane,'jane@example.com'),true);
assert.equal(matchesCustomerQuery(jane,'flaming'),true);
assert.equal(matchesCustomerQuery(jane,'grants pass'),true);
assert.equal(matchesCustomerQuery(jane,'vip'),true);
assert.equal(matchesCustomerQuery(jane,'   '),true);
assert.equal(matchesCustomerQuery(jane,'nomatch'),false);
assert.equal(matchesCustomerQuery(jane,'9995550000'),false);
// Fewer than three digits must not fall through to a phone scan.
assert.equal(matchesCustomerQuery({id:'2',phone:'5551234567'},'55'),false);
// Missing fields must never throw.
assert.equal(matchesCustomerQuery({id:'3'},'anything'),false);

// Duplicates: one group per reason, strongest first, weaker restatements suppressed
const a={id:'a',name:'Jane Smith',email:'jane@example.com',phone:'555-123-4567'};
const b={id:'b',name:'Jane  SMITH',email:'JANE@example.com',phone:'(555) 123 4567'};
const shared=findDuplicateGroups([a,b]);
assert.equal(shared.length,1);
assert.equal(shared[0].reason,'phone');
assert.equal(shared[0].label,'Same phone number');
assert.equal(shared[0].customers.length,2);

// Email-only overlap is reported on its own.
assert.deepEqual(findDuplicateGroups([
  {id:'a',name:'Jane Smith',email:'shared@example.com',phone:'5551110000'},
  {id:'b',name:'Bob Jones',email:'Shared@Example.com',phone:'5552220000'},
]).map(g=>g.reason),['email']);

// Same name at the same address outranks the bare name rule and is reported once.
assert.deepEqual(findDuplicateGroups([
  {id:'a',name:'Jane Smith',address:'634 Flaming Rd',city:'Grants Pass'},
  {id:'b',name:'jane smith',address:'634 flaming rd',city:'grants pass'},
]).map(g=>g.reason),['name-address']);

// Same name at different addresses still surfaces, as the weakest reason.
assert.deepEqual(findDuplicateGroups([
  {id:'a',name:'Jane Smith',address:'1 First St'},
  {id:'b',name:'Jane Smith',address:'2 Second Ave'},
]).map(g=>g.reason),['name']);

// Negative cases: distinct people, and blank fields never group on emptiness.
assert.deepEqual(findDuplicateGroups([
  {id:'a',name:'Jane Smith',email:'jane@example.com',phone:'5551110000'},
  {id:'b',name:'Bob Jones',email:'bob@example.com',phone:'5552220000'},
]),[]);
assert.deepEqual(findDuplicateGroups([{id:'a',name:'Solo Person',phone:'5551110000'}]),[]);
assert.deepEqual(findDuplicateGroups([{id:'a'},{id:'b'},{id:'c'}]),[]);
assert.deepEqual(findDuplicateGroups([
  {id:'a',name:'Jane Smith',email:'',phone:''},
  {id:'b',name:'Bob Jones',email:'',phone:''},
]),[]);
assert.deepEqual(findDuplicateGroups([]),[]);

// Three-way phone group stays a single group, not three pairs.
const triple=findDuplicateGroups([
  {id:'a',name:'C Person',phone:'5551234567'},
  {id:'b',name:'A Person',phone:'(555) 123-4567'},
  {id:'c',name:'B Person',phone:'+1 555 123 4567'},
]);
assert.equal(triple.length,1);
assert.equal(triple[0].customers.length,3);
// Members are name-sorted for stable rendering.
assert.deepEqual(triple[0].customers.map(c=>c.id),['b','c','a']);

console.log('PASS: customer phone/email/name normalization, forgiving search and explained duplicate grouping.');
