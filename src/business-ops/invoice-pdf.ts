import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type InvoicePdfInput = {
  invoice_number: string;
  business_name?: string | null;
  customer_name?: string | null;
  currency?: string | null;
  total: number;
  subtotal: number;
  status?: string | null;
  due_date?: Date | string | null;
  notes?: string | null;
  pay_url?: string | null;
  items: { description?: string; quantity?: number; amount?: number }[];
};

/** One-page invoice PDF. No external renderer. */
export async function renderInvoicePdf(inv: InvoicePdfInput) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const draw = (text: string, size = 12, heavy = false) => {
    page.drawText(text.slice(0, 110), {
      x: 48,
      y,
      size,
      font: heavy ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 8;
  };
  draw(inv.business_name || 'Invoice', 18, true);
  draw(inv.invoice_number, 14, true);
  draw(`Status: ${inv.status || 'draft'}`);
  if (inv.customer_name) draw(`Bill to: ${inv.customer_name}`);
  const due =
    inv.due_date instanceof Date
      ? inv.due_date.toISOString().slice(0, 10)
      : inv.due_date
        ? String(inv.due_date).slice(0, 10)
        : '';
  if (due) draw(`Due: ${due}`);
  y -= 8;
  for (const item of inv.items.slice(0, 18)) {
    draw(
      `${item.description || 'Item'}  x${item.quantity ?? 1}  ${Number(item.amount ?? 0).toFixed(2)}`,
    );
  }
  y -= 6;
  const currency = inv.currency || 'FARM';
  draw(`Total: ${Number(inv.total).toFixed(2)} ${currency}`, 14, true);
  if (inv.notes) draw(inv.notes);
  if (inv.pay_url) draw(inv.pay_url, 10);
  return doc.save();
}
