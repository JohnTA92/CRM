// Loaded only when a document is downloaded; PDF/font bundles stay out of startup.
export async function createDocumentPdf(doc: any) {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake.js"), import("pdfmake/build/vfs_fonts.js"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  const money = (value: number) => Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const text = (value: unknown) => String(value ?? "");
  const date = (value: unknown) => text(value).slice(0, 10);
  const heading = `${doc.kind === "estimate" ? "Estimate" : "Invoice"}${doc.status === "draft" ? " - DRAFT" : ""}`;
  const content: any[] = [
    { text: heading, fontSize: 24, bold: true, margin: [0,0,0,14] },
    { text: text(doc.business_name), bold: true, fontSize: 14 },
    { text: [doc.contact_email,doc.contact_phone].filter(Boolean).join(" | "), margin: [0,4,0,12] },
    { text: `Reference: ${doc.id}`, fontSize: 9 },
    { text: `Status: ${doc.status}`, margin: [0,5,0,5] },
    { text: `Created: ${date(doc.created_at)}${doc.expires_at ? ` | Expires: ${date(doc.expires_at)}` : ""}${doc.due_at ? ` | Due: ${date(doc.due_at)}` : ""}`, margin: [0,0,0,18] },
    { text: "Prepared for", bold: true },
    { text: text(doc.customer_name), margin: [0,4,0,4] },
    { text: text(doc.customer_address), margin: [0,0,0,8] },
  ];
  if (doc.service_address) content.push({ text: `Service address: ${doc.service_address}`, margin: [0,0,0,12] });
  const right = (value: string) => ({ text: value, alignment: "right" });
  content.push({ margin: [0,10,0,15], table: {
    headerRows: 1, widths: ["*",35,75,75],
    body: [
      [{ text: "Description", bold: true },right("Qty"),right("Unit price"),right("Amount")],
      ...doc.line_items.map((item: any) => [
        { text: text(item.description), margin: [0,5,0,5] },right(text(item.quantity)),right(money(item.unitPrice)),
        right(money(Math.round(Number(item.quantity) * Math.round(Number(item.unitPrice) * 100)) / 100)),
      ]),
    ],
  }, layout: "lightHorizontalLines" });
  const totals = [["Total",money(doc.total)]];
  if (doc.kind === "invoice") totals.push(["Payments recorded",money(doc.paid_total)],["Balance due",money(doc.balance_due)]);
  content.push({ unbreakable: true, columns: [{ text: "", width: "*" },{
    width: 245, table: { widths: ["*",85], body: totals.map(([label,value]) => [{ text: label, bold: true },right(value)]) },layout: "noBorders",
  }], margin: [0,0,0,20] });
  if (doc.notes) content.push({ text: "Notes",bold: true,margin: [0,0,0,6] },{ text: text(doc.notes),margin: [0,0,0,18] });
  if (doc.decision) content.push({ text: "Customer decision recorded",bold: true },{
    text: `${doc.decision.decision} by ${doc.decision.signer_name}\n${doc.decision.decided_at}`, margin: [0,6,0,0],
  });
  return pdfMake.createPdf({
    info: { title: `${heading} ${doc.id}`, author: text(doc.business_name) },
    pageSize: "LETTER", pageMargins: [42,42,42,48], defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
    content, footer: (page: number, count: number) => ({text: `Page ${page} of ${count}`, alignment: "right",fontSize: 9,margin: [42,12,42,0]}),
  });
}
