import { supabase } from "@/lib/supabase";

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  type?: string;
}

interface EmailEstimateParams {
  to: string;
  customerName: string;
  estimateId: string;
  lineItems: LineItem[];
  total: number;
  notes?: string;
  createdAt?: string;
}

interface EmailInvoiceParams {
  to: string;
  customerName: string;
  invoiceId: string;
  lineItems: LineItem[];
  total: number;
  dueAt?: string;
  notes?: string;
}

function emailShell(body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Email</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
        ${body}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function lineItemsTable(lineItems: LineItem[], total: number) {
  const rows = lineItems.map((li) => `
    <tr>
      <td style="padding:12px 24px;border-bottom:1px solid #f5f5f4;">
        <div style="font-size:14px;font-weight:500;color:#1c1917;">${li.description}</div>
        ${li.type ? `<div style="font-size:12px;color:#78716c;text-transform:capitalize;">${li.type}</div>` : ""}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f5f5f4;text-align:right;font-size:13px;color:#78716c;">${li.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #f5f5f4;text-align:right;font-size:13px;color:#78716c;">$${Number(li.unitPrice).toFixed(2)}</td>
      <td style="padding:12px 24px;border-bottom:1px solid #f5f5f4;text-align:right;font-size:13px;font-weight:600;color:#1c1917;">$${(li.quantity * li.unitPrice).toFixed(2)}</td>
    </tr>`).join("");

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#fafaf9;">
          <th style="padding:10px 24px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Description</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Unit Price</th>
          <th style="padding:10px 24px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#fafaf9;border-top:2px solid #e7e5e4;">
          <td colspan="3" style="padding:16px 24px;font-size:15px;font-weight:700;color:#1c1917;">Total</td>
          <td style="padding:16px 24px;text-align:right;font-size:20px;font-weight:700;color:#1c1917;">$${Number(total).toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>`;
}

export function buildEstimateEmail(params: EmailEstimateParams): { subject: string; html: string } {
  const subject = `Your Estimate — $${Number(params.total).toFixed(2)}`;
  const html = emailShell(`
    <tr>
      <td style="background:#16a34a;padding:24px 32px;">
        <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#bbf7d0;">Estimate</p>
        <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#ffffff;">$${Number(params.total).toFixed(2)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 16px;">
        <p style="margin:0;font-size:16px;color:#1c1917;">Hi <strong>${params.customerName}</strong>,</p>
        <p style="margin:12px 0 0;font-size:14px;color:#57534e;line-height:1.6;">
          Please review the estimate below. If you have any questions or are ready to move forward, just reply to this email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;">
        <div style="border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
          ${lineItemsTable(params.lineItems, params.total)}
        </div>
      </td>
    </tr>
    ${params.notes ? `
    <tr>
      <td style="padding:0 32px 24px;">
        <div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Notes</p>
          <p style="margin:0;font-size:13px;color:#57534e;">${params.notes}</p>
        </div>
      </td>
    </tr>` : ""}
    <tr>
      <td style="padding:0 32px 32px;">
        <p style="margin:0;font-size:12px;color:#a8a29e;line-height:1.6;">
          This estimate was created on ${params.createdAt ?? ""}. Prices are subject to change if scope changes.
        </p>
      </td>
    </tr>
  `);
  return { subject, html };
}

export function buildInvoiceEmail(params: EmailInvoiceParams): { subject: string; html: string } {
  const subject = `Invoice — $${Number(params.total).toFixed(2)} Due`;
  const html = emailShell(`
    <tr>
      <td style="background:#1d4ed8;padding:24px 32px;">
        <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#bfdbfe;">Invoice</p>
        <p style="margin:6px 0 0;font-size:28px;font-weight:700;color:#ffffff;">$${Number(params.total).toFixed(2)}</p>
        ${params.dueAt ? `<p style="margin:4px 0 0;font-size:13px;color:#bfdbfe;">Due ${params.dueAt}</p>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 16px;">
        <p style="margin:0;font-size:16px;color:#1c1917;">Hi <strong>${params.customerName}</strong>,</p>
        <p style="margin:12px 0 0;font-size:14px;color:#57534e;line-height:1.6;">
          Thank you for your business! Please find your invoice details below.${params.dueAt ? ` Payment is due by <strong>${params.dueAt}</strong>.` : ""}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;">
        <div style="border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
          ${lineItemsTable(params.lineItems, params.total)}
        </div>
      </td>
    </tr>
    ${params.notes ? `
    <tr>
      <td style="padding:0 32px 24px;">
        <div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:16px;">
          <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#a8a29e;">Notes</p>
          <p style="margin:0;font-size:13px;color:#57534e;">${params.notes}</p>
        </div>
      </td>
    </tr>` : ""}
    <tr>
      <td style="padding:0 32px 32px;">
        <p style="margin:0;font-size:13px;color:#57534e;">
          Please reply to this email if you have any questions about this invoice.
        </p>
      </td>
    </tr>
  `);
  return { subject, html };
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  type: "estimate" | "invoice";
  recordId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("send-email", {
    body: params,
  });
  if (error) return { success: false, error: error.message };
  if (data?.error) return { success: false, error: data.error };
  return { success: true };
}
