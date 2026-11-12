import { useMemo, useState, type FormEvent } from "react";
import { BarChart3, Boxes, Clock, Download, FileBarChart, Loader2, Lock, Send, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { DataGate, EmptyState, ErrorState, FieldError, FilterSelect, LoadingState, Panel, StatTile } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBranches } from "@/hooks/use-branches";
import {
  isOpenable,
  useReportData,
  useReportRequests,
  useRequestReport,
  type ReportData,
  type ReportRequest,
  type ReportRequestType,
} from "@/hooks/use-report-requests";
import { formatDate, formatNaira, formatNumber } from "@/lib/format";
import { fieldErrorsFrom } from "@/lib/supabase-helpers";
import { todayInTimezone } from "@/lib/type-adapters";

const TODAY = () => todayInTimezone("Africa/Lagos");
const reportName: Record<ReportRequestType, string> = { sales: "Sales report", inventory: "Inventory report" };

/** Supervisor home: ask for a report, follow its approval, open it once approved. */
export function SupervisorReportsPage() {
  const { data: requests = [], isLoading, error } = useReportRequests();
  const { data: branches = [] } = useBranches();
  const [openId, setOpenId] = useState<string | null>(null);
  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? "Branch") : "All branches");
  const pending = requests.filter((r) => r.status === "pending").length;
  const ready = requests.filter((r) => isOpenable(r)).length;

  return (
    <AppShell title="Reports" subtitle="Request reports for the Owner's approval">
      <div className="mb-5">
        <h1 className="text-xl font-bold">Reports</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask for a report, the Owner approves it, then it opens here for 7 days.
        </p>
      </div>
      <DataGate isLoading={isLoading} error={error}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Ready to open" value={String(ready)} tone="success" detail="Approved in the last 7 days" />
          <StatTile label="Waiting for the Owner" value={String(pending)} tone="warning" />
          <StatTile label="All requests" value={String(requests.length)} />
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <RequestForm branches={branches} />
          <Panel title="Your requests" subtitle="Newest first">
            {requests.length ? (
              <ul className="divide-y divide-border">
                {requests.map((r) => (
                  <RequestRow key={r.id} r={r} branch={branchName(r.branchId)} open={openId === r.id} onOpen={() => setOpenId(openId === r.id ? null : r.id)} />
                ))}
              </ul>
            ) : (
              <EmptyState icon={FileBarChart} title="No requests yet" detail="Request a sales or inventory report to get started." />
            )}
          </Panel>
        </div>
        {openId && <ReportViewer key={openId} requestId={openId} onClose={() => setOpenId(null)} />}
      </DataGate>
    </AppShell>
  );
}

function RequestForm({ branches }: { branches: { id: string; name: string; status: string }[] }) {
  const request = useRequestReport();
  const today = TODAY();
  const [type, setType] = useState<ReportRequestType>("sales");
  const [branchId, setBranchId] = useState("all");
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (type === "sales") {
      if (!from || !to) next["period"] = "Choose the dates the report covers";
      else if (from > to) next["period"] = "The start date is after the end date";
      else if (to > today) next["period"] = "The report can't cover future dates";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await request.mutateAsync({
        p_report_type: type,
        p_branch_id: branchId === "all" ? null : branchId,
        p_period_from: type === "sales" ? from : null,
        p_period_to: type === "sales" ? to : null,
        p_note: note.trim() || null,
      });
      toast.success("Request sent to the Owner", { description: "You'll be notified when it's approved." });
      setNote("");
    } catch (error) {
      setErrors(fieldErrorsFrom(error, ["reportType", "branchId", "period"] as const) as Record<string, string>);
    }
  }

  return (
    <Panel title="Request a report" subtitle="The Owner approves every report">
      <form onSubmit={(e) => void submit(e)} className="space-y-4 p-5" noValidate>
        <div>
          <Label className="text-xs">Report</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {([["sales", "Sales", BarChart3], ["inventory", "Inventory", Boxes]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                aria-pressed={type === value}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-[border-color,background-color,box-shadow] duration-150 ${type === value ? "border-primary bg-primary/5 text-foreground shadow-sm ring-1 ring-primary/30" : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"}`}
              >
                <Icon className="size-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <FieldError message={errors["reportType"]} />
        </div>
        <div>
          <Label className="text-xs">Branch</Label>
          <div className="mt-1.5">
            <FilterSelect label="Branch" className="w-full" value={branchId} onChange={setBranchId}
              options={[{ value: "all", label: "All branches" }, ...branches.filter((b) => b.status === "active").map((b) => ({ value: b.id, label: b.name }))]} />
          </div>
          <FieldError message={errors["branchId"]} />
        </div>
        {type === "sales" ? (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="rep-from" className="text-xs">From</Label><Input id="rep-from" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1.5" /></div>
              <div><Label htmlFor="rep-to" className="text-xs">To</Label><Input id="rep-to" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5" /></div>
            </div>
            <FieldError message={errors["period"]} />
          </div>
        ) : (
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">An inventory report shows stock on hand on the day you open it.</p>
        )}
        <div>
          <Label htmlFor="rep-note" className="text-xs">Note for the Owner (optional)</Label>
          <Textarea id="rep-note" value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5" rows={2} placeholder="e.g. For the monthly review" />
        </div>
        <FieldError message={errors["form"]} />
        <Button type="submit" className="w-full" disabled={request.isPending}>
          {request.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Send request
        </Button>
      </form>
    </Panel>
  );
}

function RequestRow({ r, branch, open, onOpen }: { r: ReportRequest; branch: string; open: boolean; onOpen: () => void }) {
  const openable = isOpenable(r);
  const expired = r.status === "approved" && !openable;
  const status = r.status === "pending"
    ? <span className="status status-warning whitespace-nowrap"><Clock className="size-3" />Waiting for the Owner</span>
    : r.status === "rejected"
      ? <span className="status status-danger whitespace-nowrap">Declined</span>
      : expired
        ? <span className="status status-muted whitespace-nowrap"><Lock className="size-3" />Access ended</span>
        : <span className="status status-success whitespace-nowrap">Approved</span>;
  return (
    <li className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{reportName[r.reportType]} · {branch}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {r.reportType === "sales" ? `${formatDate(r.periodFrom)} to ${formatDate(r.periodTo)}` : "Stock on hand"}
          {" · requested "}{formatDate(r.createdAt.slice(0, 10))}
          {openable && r.expiresAt && ` · open until ${formatDate(r.expiresAt.slice(0, 10))}`}
        </p>
        {r.status === "rejected" && r.rejectionReason && <p className="mt-1 text-xs text-destructive">Reason: {r.rejectionReason}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status}
        {openable && <Button size="sm" variant={open ? "outline" : "default"} onClick={onOpen}>{open ? "Hide" : "Open report"}</Button>}
      </div>
    </li>
  );
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
function downloadCsv(name: string, rows: (string | number)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportViewer({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const { data, isLoading, error } = useReportData(requestId);
  return (
    <section className="page-enter mt-5" aria-label="Report">
      {isLoading ? <LoadingState label="Preparing the report…" /> : error ? <ErrorState error={error} /> : data ? <ReportBody data={data} onClose={onClose} /> : null}
    </section>
  );
}

function ReportBody({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const product = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data.products]);
  const person = useMemo(() => new Map(data.people.map((p) => [p.id, p.name])), [data.people]);
  const branch = useMemo(() => new Map(data.branches.map((b) => [b.id, b.name])), [data.branches]);
  const req = data.request;
  const title = `${reportName[req.report_type as ReportRequestType]} · ${req.branch_id ? (branch.get(req.branch_id) ?? "Branch") : "All branches"}`;
  const header = (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {req.report_type === "sales" ? `${formatDate(req.period_from)} to ${formatDate(req.period_to)}` : `Stock on hand, ${formatDate(TODAY())}`} · approved by the Owner
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onClose}><X className="size-4" />Close</Button>
    </div>
  );

  if (req.report_type === "inventory") {
    const rows = data.inventory.map((r) => {
      const p = product.get(r.product_id);
      const available = r.quantity_on_hand - r.quantity_reserved;
      const status = available <= 0 ? "Out of stock" : available <= r.low_stock_threshold ? "Low stock" : "In stock";
      return { ...r, name: p?.name ?? "Product", sku: p?.sku ?? "", unit: p?.unit ?? "", branchName: branch.get(r.branch_id) ?? "", available, status };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const low = rows.filter((r) => r.status === "Low stock").length;
    const out = rows.filter((r) => r.status === "Out of stock").length;
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Products stocked" value={formatNumber(rows.length)} />
          <StatTile label="Units on hand" value={formatNumber(rows.reduce((s, r) => s + r.quantity_on_hand, 0))} tone="success" />
          <StatTile label="Low stock" value={formatNumber(low)} tone="warning" />
          <StatTile label="Out of stock" value={formatNumber(out)} tone="danger" />
        </div>
        <Panel className="mt-4 overflow-hidden" title="Stock position" action={
          <Button size="sm" variant="outline" onClick={() => downloadCsv("inventory-report.csv", [["Product", "SKU", "Branch", "On hand", "Available", "Status"], ...rows.map((r) => [r.name, r.sku, r.branchName, r.quantity_on_hand, r.available, r.status])])}>
            <Download className="size-4" />CSV
          </Button>
        }>
          <ReportTable head={["Product", "Branch", "On hand|r", "Available|r", "Status"]} rows={rows.map((r) => [r.name, r.branchName, formatNumber(r.quantity_on_hand), formatNumber(r.available), r.status])} />
        </Panel>
      </>
    );
  }

  const paid = data.sales.filter((s) => !s.is_promo);
  const promos = data.sales.filter((s) => s.is_promo);
  const revenue = paid.reduce((s, x) => s + Number(x.line_total), 0);
  const discounts = paid.reduce((s, x) => s + Number(x.discount_amount), 0);
  const byRep = [...paid.reduce((m, s) => m.set(s.sales_rep_id, (m.get(s.sales_rep_id) ?? 0) + Number(s.line_total)), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const byProduct = [...paid.reduce((m, s) => {
    const cur = m.get(s.product_id) ?? { units: 0, revenue: 0 };
    return m.set(s.product_id, { units: cur.units + s.quantity, revenue: cur.revenue + Number(s.line_total) });
  }, new Map<string, { units: number; revenue: number }>())].sort((a, b) => b[1].revenue - a[1].revenue);

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Revenue" value={formatNaira(revenue)} tone="success" detail={discounts > 0 ? `After ${formatNaira(discounts)} discounts` : undefined} />
        <StatTile label="Sales lines" value={formatNumber(paid.length)} />
        <StatTile label="Units sold" value={formatNumber(paid.reduce((s, x) => s + x.quantity, 0))} />
        <StatTile label="Promo units given" value={formatNumber(promos.reduce((s, x) => s + x.quantity, 0))} tone="warning" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By sales representative">
          <ReportTable head={["Seller", "Revenue|r", "Share|r"]} rows={byRep.map(([id, v]) => [person.get(id) ?? "Staff", formatNaira(v), revenue ? `${Math.round((v / revenue) * 100)}%` : "—"])} />
        </Panel>
        <Panel title="By product">
          <ReportTable head={["Product", "Units|r", "Revenue|r"]} rows={byProduct.map(([id, v]) => [product.get(id)?.name ?? "Product", formatNumber(v.units), formatNaira(v.revenue)])} />
        </Panel>
      </div>
      <Panel className="mt-4 overflow-hidden" title="All sales" subtitle={`${formatNumber(data.sales.length)} lines`} action={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("sales-report.csv", [
          ["Date", "Code", "Branch", "Seller", "Product", "Type", "Quantity", "Unit price", "Discount", "Line total"],
          ...data.sales.map((s) => [s.sale_date, s.code, branch.get(s.branch_id) ?? "", person.get(s.sales_rep_id) ?? "", product.get(s.product_id)?.name ?? "",
            s.is_promo ? "Promo" : s.is_customer_sale ? "Customer" : "Walk-in", s.quantity, Number(s.unit_price), Number(s.discount_amount), Number(s.line_total)]),
        ])}><Download className="size-4" />CSV</Button>
      }>
        <ReportTable
          head={["Date", "Seller", "Product", "Qty|r", "Revenue|r"]}
          rows={data.sales.slice(0, 200).map((s) => [formatDate(s.sale_date), person.get(s.sales_rep_id) ?? "Staff", `${product.get(s.product_id)?.name ?? "Product"}${s.is_promo ? " (promo)" : ""}`, formatNumber(s.quantity), s.is_promo ? "Free" : formatNaira(Number(s.line_total))])}
        />
        {data.sales.length > 200 && <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">Showing the latest 200 lines. The CSV has all {formatNumber(data.sales.length)}.</p>}
      </Panel>
    </>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing in this report.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-border bg-muted/40 text-[10px] uppercase text-muted-foreground">
          {head.map((h) => <th key={h} className={`px-5 py-2.5 font-semibold ${h.endsWith("|r") ? "text-right" : ""}`}>{h.replace("|r", "")}</th>)}
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className="border-t border-border transition-colors hover:bg-muted/40">
            {r.map((c, j) => <td key={j} className={`px-5 py-2.5 ${head[j]?.endsWith("|r") ? "text-right tabular-nums" : ""} ${j === 0 ? "font-semibold" : ""}`}>{c}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
