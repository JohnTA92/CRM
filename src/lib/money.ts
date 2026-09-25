type ItemInput = { id?: string; description: string; quantity: string | number; unitPrice: string | number; type: string };

function scaled(value: string | number, places: number): bigint {
  const text = String(value).trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(text)) throw new Error(`Enter a number with no more than ${places} decimal places.`);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}

export function moneyCents(value: string | number): number {
  const cents = scaled(value, 2);
  if (cents > 9999999999n) throw new Error("Amount is too large.");
  return Number(cents);
}

export function lineAmount(quantity: string | number, unitPrice: string | number): number {
  try { return Number((scaled(quantity, 3) * scaled(unitPrice, 2) + 500n) / 1000n) / 100; }
  catch { return 0; }
}

export function previewTotal(items: { quantity: string | number; unitPrice: string | number }[]): number {
  return items.reduce((cents, item) => cents + Math.round(lineAmount(item.quantity, item.unitPrice) * 100), 0) / 100;
}

export function normalizeLineItems(items: ItemInput[]) {
  if (!items.length) throw new Error("Add at least one line item.");
  const normalized = items.map((item, index) => {
    const prefix = `Item ${index + 1}: `;
    if (!item.description.trim()) throw new Error(prefix + "enter a description.");
    if (!["service", "labor", "material", "other"].includes(item.type)) throw new Error(prefix + "choose a valid type.");
    let quantity: bigint;
    let price: number;
    try { quantity = scaled(item.quantity, 3); price = moneyCents(item.unitPrice); }
    catch { throw new Error(prefix + "use a positive quantity (up to 3 decimals) and a price with up to 2 decimals."); }
    if (quantity <= 0n || quantity > 1000000000n) throw new Error(prefix + "quantity must be greater than zero and no more than 1,000,000.");
    return { ...item, description: item.description.trim(), quantity: Number(quantity) / 1000, unitPrice: price / 100 };
  });
  const total = previewTotal(normalized);
  if (total > 99999999.99) throw new Error("Document total is too large.");
  return { items: normalized, total };
}

export function balanceDue(invoice: { total?: number; paid_total?: number; paidTotal?: number; status?: string }): number {
  if (invoice.status === "voided") return 0;
  return Math.max(0, Math.round(Number(invoice.total ?? 0) * 100) - Math.round(Number(invoice.paid_total ?? invoice.paidTotal ?? 0) * 100)) / 100;
}

export function sumMoney<T>(records: T[], amount: (record: T) => number): number {
  return records.reduce((cents, record) => cents + Math.round(Number(amount(record)) * 100), 0) / 100;
}
