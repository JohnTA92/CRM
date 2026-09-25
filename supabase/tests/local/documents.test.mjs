import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createDocumentPdf} from '../../../src/lib/customerDocumentPdf.ts';
// Local render fixtures only, never imported by the application or seeded in Supabase.
const dir='/private/tmp/crm-document-pdf-check';
mkdirSync(dir,{recursive:true});
const base={id:'local-render-verification',kind:'invoice',status:'sent',business_name:'Document layout verification',customer_name:'José Martin',customer_address:'Test-only address',service_address:'Test-only service location',created_at:'2026-09-25',due_at:'2026-10-09',total:50,paid_total:15,balance_due:35,line_items:[{description:'Exterior service with a longer description that wraps naturally.',quantity:2,unitPrice:25}],notes:'Local PDF layout check. Not a live invoice.'};
for(const [name,doc] of [['invoice',base],['long-estimate',{...base,kind:'estimate',status:'approved',due_at:null,total:2000,paid_total:0,balance_due:2000,line_items:Array.from({length:80},(_,i)=>({description:`Line ${i+1}: Long service description with access notes, materials and preparation instructions. Café façade inspection.`,quantity:1,unitPrice:25})),notes:'Final notes remain visible after the last line item.',decision:{decision:'approved',signer_name:'Local test signer',decided_at:'2026-09-25T05:00:00Z'}}]]) {
 const pdf=await createDocumentPdf(doc);
 const bytes=await pdf.getBuffer();
 assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
 writeFileSync(`${dir}/${name}.pdf`,bytes);
}
console.log(`PASS: invoice and multipage estimate PDFs generated in ${dir}; no live records created.`);
