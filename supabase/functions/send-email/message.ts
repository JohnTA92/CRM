export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function validEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
}
export function buildMessage(doc: any) {
  const money = (v: unknown) => {
    const n=Number(v); if (!Number.isFinite(n) || n<0) throw new Error('Invalid document amount');
    return '$'+n.toFixed(2);
  };
  if (!Array.isArray(doc.line_items) || !doc.line_items.length || Number(doc.total)<=0) throw new Error('A priced document is required');
  const title=doc.kind==='invoice'?'Invoice':'Estimate';
  const amount=doc.kind==='invoice'?doc.balance_due:doc.total;
  const rows=doc.line_items.map((li:any)=>`<tr><td>${escapeHtml(li.description)}</td><td>${escapeHtml(li.quantity)}</td><td>${money(li.unitPrice)}</td></tr>`).join('');
  const subject=`${title} — ${money(amount)}${doc.kind==='invoice'?' remaining':''}`;
  const html=`<!doctype html><html><body><h1>${escapeHtml(doc.business_name)} — ${title}</h1><p>Hello ${escapeHtml(doc.customer_name)},</p><p>Reference: ${escapeHtml(doc.id)}</p><table><thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th></tr></thead><tbody>${rows}</tbody></table><p>Total: ${money(doc.total)}</p>${doc.kind==='invoice'?`<p>Payments recorded: ${money(doc.paid_total)}<br>Balance due: ${money(doc.balance_due)}</p>`:''}${doc.due_at?`<p>Due: ${escapeHtml(doc.due_at)}</p>`:''}${doc.service_address?`<p>Service location: ${escapeHtml(doc.service_address)}</p>`:''}<p style="white-space:pre-wrap">${escapeHtml(doc.notes)}</p><p>Reply to this email with questions.</p></body></html>`;
  return {subject,html};
}
