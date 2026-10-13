export type DateRange = { from: string; to: string };
export type PeriodKey = "today" | "week" | "month" | "quarter" | "custom";

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
export function daysInMonth(month: string) {
  const [y = 2026, m = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthOf = (date: string) => date.slice(0, 7);

/** Resolves a named period to an inclusive date range ending on the reference date. */
export function getPeriodRange(period: PeriodKey, today: string, custom?: { from?: string | undefined; to?: string | undefined }): DateRange {
  switch (period) {
    case "today": return { from: today, to: today };
    case "week": return { from: addDays(today, -6), to: today };
    case "month": return { from: `${monthOf(today)}-01`, to: today };
    case "quarter": {
      const [y = 2026, m = 1] = today.split("-").map(Number);
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(qm).padStart(2, "0")}-01`, to: today };
    }
    case "custom": {
      const from = custom?.from || `${monthOf(today)}-01`;
      const to = custom?.to || today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
  }
}
/** Same-length range immediately before the given one. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}
export function isoWeek(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
