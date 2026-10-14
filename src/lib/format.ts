const naira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

export const formatNaira = (value: number) => naira.format(value).replace("NGN", "₦");
export function formatCompactNaira(value: number) {
  if (Math.abs(value) >= 1_000_000_000) return `₦${(value / 1_000_000_000).toFixed(2)}bn`;
  if (Math.abs(value) >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `₦${(value / 1_000).toFixed(0)}k`;
  return `₦${value}`;
}
export const formatPercent = (value: number, digits = 1) => `${Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$/, "") : "0"}%`;
export const formatNumber = (value: number) => value.toLocaleString("en-NG");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(date: string) {
  const [y = 0, m = 1, d = 1] = date.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
export function formatShortDate(date: string) {
  const [, m = 1, d = 1] = date.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
export const formatTime = (iso: string) => iso.slice(11, 16);
export function formatMonth(month: string) {
  const [y = 0, m = 1] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export const roleLabel = { owner: "Owner", manager: "Manager", storekeeper: "Storekeeper", sales_rep: "Sales Representative" } as const;
export const initials = (name: string) => name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
/** "Today, 10:42" / "Yesterday, 15:15" / "Sep 24, 11:20" relative to the tenant reference date. */
export function formatDayTime(iso: string, today: string) {
  const day = iso.slice(0, 10);
  const y = new Date(`${today}T00:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  const label = day === today ? "Today" : day === y.toISOString().slice(0, 10) ? "Yesterday" : formatShortDate(day);
  return `${label}, ${formatTime(iso)}`;
}
export const formatUnits = (n: number) => `${n.toLocaleString("en-NG")} ${Math.abs(n) === 1 ? "unit" : "units"}`;
