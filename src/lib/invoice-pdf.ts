/**
 * Invoice PDF for one order (walk-in or customer). Pure layout: the caller passes
 * everything to print. jsPDF is loaded only when an invoice is generated.
 */
export type InvoiceLine = { description: string; quantity: number; unitPrice: number; discount: number; total: number; promo: boolean };
export type InvoiceInput = {
  number: string;
  date: string; // YYYY-MM-DD
  business: { name: string; legalName?: string | undefined; phone?: string | undefined; email?: string | undefined };
  billTo: { name: string; lines: string[] };
  servedBy: string;
  branch: string;
  items: InvoiceLine[];
  /** customer orders: what has been paid towards this order so far */
  paid?: number | undefined;
  payment: { accountNumber: string; bankName?: string | undefined; accountName?: string | undefined };
};

const naira = (n: number) => `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const INK: [number, number, number] = [23, 23, 23];
const MUTED: [number, number, number] = [110, 110, 110];
const LINE: [number, number, number] = [228, 228, 231];
const ORANGE: [number, number, number] = [249, 115, 22];
const GREEN: [number, number, number] = [22, 163, 74];

export async function buildInvoicePdf(inv: InvoiceInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  let y = 0;

  // Header band
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 112, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 112, W, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(inv.business.name || "Invoice", M, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 200, 200);
  const contact = [inv.business.legalName && inv.business.legalName !== inv.business.name ? inv.business.legalName : "", inv.business.phone, inv.business.email].filter(Boolean).join("  ·  ");
  if (contact) doc.text(contact, M, 72);
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("INVOICE", W - M, 54, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 220, 220);
  doc.text(inv.number, W - M, 74, { align: "right" });

  // Bill to / details
  y = 152;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("BILL TO", M, y);
  doc.text("INVOICE DETAILS", W / 2 + 20, y);
  doc.setTextColor(...INK);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(inv.billTo.name, M, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  inv.billTo.lines.filter(Boolean).forEach((l, i) => doc.text(l, M, y + 34 + i * 13));
  const details: [string, string][] = [["Date", longDate(inv.date)], ["Branch", inv.branch], ["Served by", inv.servedBy]];
  details.forEach(([k, v], i) => {
    doc.setTextColor(...MUTED);
    doc.text(k, W / 2 + 20, y + 18 + i * 15);
    doc.setTextColor(...INK);
    doc.text(v, W - M, y + 18 + i * 15, { align: "right" });
  });

  // Items table
  y = 250;
  const cols = { item: M, qty: W - M - 250, price: W - M - 170, disc: W - M - 90, total: W - M };
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(M - 8, y - 14, W - 2 * M + 16, 24, 4, 4, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text("ITEM", cols.item, y + 2);
  doc.text("QTY", cols.qty, y + 2, { align: "right" });
  doc.text("UNIT PRICE", cols.price, y + 2, { align: "right" });
  doc.text("DISCOUNT", cols.disc, y + 2, { align: "right" });
  doc.text("AMOUNT", cols.total, y + 2, { align: "right" });
  y += 28;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  for (const it of inv.items) {
    if (y > H - 230) { doc.addPage(); y = 64; }
    doc.setTextColor(...INK);
    const desc = doc.splitTextToSize(it.description + (it.promo ? "  (promo, free)" : ""), cols.qty - cols.item - 60) as string[];
    doc.text(desc, cols.item, y);
    doc.text(String(it.quantity), cols.qty, y, { align: "right" });
    doc.text(it.promo ? "—" : naira(it.unitPrice), cols.price, y, { align: "right" });
    doc.setTextColor(...(it.discount > 0 ? GREEN : MUTED));
    doc.text(it.discount > 0 ? `-${naira(it.discount)}` : "—", cols.disc, y, { align: "right" });
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(it.promo ? "Free" : naira(it.total), cols.total, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 14 * desc.length + 8;
    doc.setDrawColor(...LINE);
    doc.line(M, y - 10, W - M, y - 10);
  }

  // Totals
  const gross = inv.items.reduce((s, i) => s + (i.promo ? 0 : i.quantity * i.unitPrice), 0);
  const discount = inv.items.reduce((s, i) => s + i.discount, 0);
  const total = inv.items.reduce((s, i) => s + i.total, 0);
  y += 8;
  const row = (label: string, value: string, bold = false, color: [number, number, number] = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...MUTED);
    doc.text(label, W - M - 200, y);
    doc.setTextColor(...color);
    doc.text(value, W - M, y, { align: "right" });
    y += bold ? 22 : 16;
  };
  row("Subtotal", naira(gross));
  if (discount > 0) row("Discount", `-${naira(discount)}`, false, GREEN);
  doc.setDrawColor(...INK);
  doc.line(W - M - 200, y - 8, W - M, y - 8);
  y += 6;
  row("Total", naira(total), true);
  if (inv.paid !== undefined) {
    row("Paid", naira(inv.paid), false, GREEN);
    row("Balance due", naira(Math.max(total - inv.paid, 0)), true, total - inv.paid > 0 ? ORANGE : GREEN);
  }

  // Payment details
  y = Math.max(y + 18, H - 190);
  if (y > H - 190) { doc.addPage(); y = 64; }
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(...ORANGE);
  doc.roundedRect(M, y, W - 2 * M, 84, 6, 6, "FD");
  doc.setTextColor(...ORANGE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("PAYMENT DETAILS", M + 16, y + 20);
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const pay: [string, string][] = [
    ["Account number", inv.payment.accountNumber],
    ...(inv.payment.bankName ? [["Bank", inv.payment.bankName] as [string, string]] : []),
    ["Account name", inv.payment.accountName || inv.business.name],
  ];
  pay.forEach(([k, v], i) => {
    doc.setTextColor(...MUTED);
    doc.text(k, M + 16, y + 40 + i * 14);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", k === "Account number" ? "bold" : "normal");
    doc.text(v, M + 130, y + 40 + i * 14);
    doc.setFont("helvetica", "normal");
  });
  doc.setTextColor(...MUTED);
  doc.text(`Please use ${inv.number} as the payment reference.`, W - M - 16, y + 68, { align: "right" });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`Thank you for your business.  ${inv.business.name}`, W / 2, H - 32, { align: "center" });

  doc.save(`${inv.number}.pdf`);
}
