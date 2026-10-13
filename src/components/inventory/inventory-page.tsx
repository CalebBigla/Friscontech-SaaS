import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Eye, History, Layers, MoreHorizontal, Package, PackageX, Plus, SlidersHorizontal, Wallet } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel, SearchBox, StockStatusBadge } from "@/components/shared";
import { AddStockDialog } from "@/components/inventory/add-stock-dialog";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { MovementsSheet } from "@/components/inventory/movements-sheet";
import type { InventoryRecord } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getInventoryRows, getInventorySummary, type InventoryRow, type InventoryStatus } from "@/lib/inventory-calculations";
import { formatCompactNaira, formatDayTime, formatNaira, formatNumber } from "@/lib/format";

type SortKey = "product" | "available" | "updated" | "status";
const statusRank: Record<InventoryStatus, number> = { out_of_stock: 0, low_stock: 1, in_stock: 2 };
const PAGE = 25;

export function InventoryPage({ initialBranch, initialStatus }: { initialBranch?: string | undefined; initialStatus?: InventoryStatus | undefined }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const navigate = useNavigate();
  const multiBranch = !scope.branchIds;
  const simple = !scope.canViewInventoryAdmin;
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState(multiBranch && initialBranch ? initialBranch : ALL);
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState<string>(initialStatus ?? ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [addDefaults, setAddDefaults] = useState<{ branchId?: string; productId?: string }>();
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [movesOpen, setMovesOpen] = useState(false);

  const activeBranch = multiBranch ? branch : ALL;
  const filterScope = { branchIds: scope.branchIds, branchId: activeBranch === ALL ? undefined : activeBranch, category: category === ALL ? undefined : category };
  const summary = getInventorySummary(db, filterScope);
  const rows = useMemo(() => getInventoryRows(db, filterScope), [db, scope.branchIds, activeBranch, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = [...new Set(db.products.map((p) => p.category))].sort();
  const branches = db.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((r) => (!needle || `${r.product.name} ${r.product.sku}`.toLowerCase().includes(needle)) && (status === ALL || r.status === status));
    const val = (r: InventoryRow) => sort.key === "product" ? r.product.name : sort.key === "available" ? r.available : sort.key === "updated" ? r.record.lastUpdated : statusRank[r.status] * 1e6 + r.available;
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, query, status, sort]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const shown = visible.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "product" || key === "status" ? 1 : -1 }));
  const SortHead = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`px-4 py-3 ${right ? "text-right" : ""}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">{label}
        {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}</button>
    </th>
  );
  const openAdd = (d?: { branchId?: string; productId?: string }) => { setAddDefaults(d); setAddOpen(true); };
  const actions = (r: InventoryRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${r.product.name}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild><Link to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }}><Eye className="size-4" />View details</Link></DropdownMenuItem>
        {scope.canManageStock && <DropdownMenuItem onClick={() => openAdd({ branchId: r.branch.id, productId: r.product.id })}><Plus className="size-4" />Add stock</DropdownMenuItem>}
        {scope.canManageStock && <DropdownMenuItem onClick={() => setAdjusting(r)}><SlidersHorizontal className="size-4" />Adjust stock</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const open = (rec: InventoryRecord) => void navigate({ to: "/inventory/$inventoryId", params: { inventoryId: rec.id } });
  const empty = rows.length === 0
    ? <EmptyState title="No inventory records found." detail="Stock will appear here once it is received at a branch." />
    : status === "low_stock" && !query ? <EmptyState title="All products are currently above their low-stock thresholds." />
    : status === "out_of_stock" && !query ? <EmptyState title="Nothing is out of stock." detail="Every product has available units in this selection." />
    : <EmptyState title="No inventory records found." detail="Try a different search or clear the filters." />;

  return (
    <AppShell title="Inventory" subtitle={simple ? "Products available to you" : "Monitor stock levels, availability, and inventory movement across your branches."}
      actions={<div className="flex gap-2">
        {!simple && <Button variant="outline" onClick={() => setMovesOpen(true)}><History className="size-4" /><span className="hidden sm:inline">View Movements</span></Button>}
        {scope.canManageStock && <Button onClick={() => openAdd()}><Plus className="size-4" /><span className="hidden sm:inline">Add Stock</span></Button>}
      </div>}>
      <div className="mb-5"><h1 className="text-xl font-bold">{simple ? "Available Products" : "Inventory"}</h1><p className="mt-1 text-xs text-muted-foreground">{simple ? "Products available to you and how much stock is on hand" : "Monitor stock levels, availability, and inventory movement across your branches"}{activeBranch !== ALL ? ` · ${db.branches.find((b) => b.id === activeBranch)?.name}` : scope.branchIds ? ` · ${branches[0]?.name ?? ""}` : " · All branches"}</p></div>

      <section className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 ${simple ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
        <MetricCard icon={Package} tone="brand" label="Total products" value={formatNumber(summary.products)} detail="Represented in inventory" />
        <MetricCard icon={Layers} tone="violet" label="Total units" value={formatNumber(summary.units)} detail="On hand in this selection" />
        <MetricCard icon={AlertTriangle} tone="warning" label="Low stock" value={formatNumber(summary.low)} detail="At or below threshold" badge={summary.low ? "Review" : undefined} />
        <MetricCard icon={PackageX} tone="warning" label="Out of stock" value={formatNumber(summary.out)} detail="Zero available units" />
        {!simple && <MetricCard icon={Wallet} tone="success" label="Inventory value" value={formatCompactNaira(summary.value)} detail="On hand × unit cost" />}
      </section>

      <Panel className="mt-4 overflow-hidden" title="Stock levels" subtitle={`${visible.length} of ${rows.length} records`}
        action={<div className="flex flex-col gap-2 lg:flex-row">
          <SearchBox value={query} onChange={reset(setQuery)} placeholder="Search product or SKU" className="lg:w-56" />
          <div className={`grid gap-2 ${multiBranch ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
            {multiBranch && <FilterSelect label="Branch filter" className="w-full lg:w-40" value={branch} onChange={reset(setBranch)} options={[{ value: ALL, label: "All branches" }, ...branches.map((b) => ({ value: b.id, label: b.name.replace(" Branch", "") }))]} />}
            <FilterSelect label="Category filter" className="w-full lg:w-36" value={category} onChange={reset(setCategory)} options={[{ value: ALL, label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
            <FilterSelect label="Stock status filter" className="w-full lg:w-36" value={status} onChange={reset(setStatus)} options={[{ value: ALL, label: "All statuses" }, { value: "in_stock", label: "In Stock" }, { value: "low_stock", label: "Low Stock" }, { value: "out_of_stock", label: "Out of Stock" }]} />
          </div>
          <div className="md:hidden"><FilterSelect label="Sort by" className="w-full" value={`${sort.key}:${sort.dir}`} onChange={(v) => { const [key, dir] = v.split(":"); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }}
            options={[["status:1", "Needs attention first"], ["product:1", "Product A–Z"], ["available:-1", "Most available"], ["available:1", "Least available"], ["updated:-1", "Recently updated"]].map(([value = "", label = ""]) => ({ value, label }))} /></div>
        </div>}>
        {simple && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><SortHead k="product" label="Product" /><th className="px-4 py-3">SKU</th><th className="hidden px-4 py-3 sm:table-cell">Category</th><th className="px-4 py-3 text-right">Selling price</th><SortHead k="available" label="Available" right /><SortHead k="status" label="Status" /></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.record.id} className="border-t border-border text-xs"><td className="px-4 py-3.5 font-bold">{r.product.name}</td><td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">{r.product.sku}</td><td className="hidden px-4 py-3.5 sm:table-cell">{r.product.category}</td><td className="px-4 py-3.5 text-right">{formatNaira(r.product.unitPrice)}</td><td className="px-4 py-3.5 text-right font-bold">{formatNumber(r.available)} <span className="font-normal text-muted-foreground">{r.product.unit}</span></td><td className="px-4 py-3.5"><StockStatusBadge status={r.status} /></td></tr>)}</tbody>
        </table></div>}
        {!simple && <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left">
            <thead><tr className="text-[10px] uppercase text-muted-foreground">
              <SortHead k="product" label="Product" /><th className="hidden px-4 py-3 xl:table-cell">SKU</th><th className="px-4 py-3">Branch</th>
              <th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reserved</th><SortHead k="available" label="Available" right /><th className="px-4 py-3 text-right">Threshold</th>
              <SortHead k="status" label="Status" /><SortHead k="updated" label="Last updated" /><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.record.id} onClick={() => open(r.record)} className="cursor-pointer border-t border-border text-xs transition-colors hover:bg-muted/60">
                <td className="px-4 py-3.5"><p className="font-bold">{r.product.name}</p><p className="text-[11px] text-muted-foreground"><span className="font-mono xl:hidden">{r.product.sku} · </span>{r.product.category} · {formatNaira(r.product.unitPrice)}</p></td>
                <td className="hidden px-4 py-3.5 font-mono text-[11px] text-muted-foreground xl:table-cell">{r.product.sku}</td>
                <td className="px-4 py-3.5">{r.branch.name}</td>
                <td className="px-4 py-3.5 text-right font-semibold">{formatNumber(r.record.quantityOnHand)}</td>
                <td className="px-4 py-3.5 text-right text-muted-foreground">{r.record.quantityReserved}</td>
                <td className="px-4 py-3.5 text-right font-bold">{formatNumber(r.available)}</td>
                <td className="px-4 py-3.5 text-right text-muted-foreground">{r.record.lowStockThreshold}</td>
                <td className="px-4 py-3.5"><StockStatusBadge status={r.status} /></td>
                <td className="px-4 py-3.5 text-muted-foreground">{formatDayTime(r.record.lastUpdated, db.tenant.referenceDate)}</td>
                <td className="px-4 py-2 text-right">{actions(r)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="divide-y divide-border md:hidden">{shown.map((r) => (
          <div key={r.record.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <Link to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className="min-w-0"><p className="truncate text-sm font-bold">{r.product.name}</p><p className="text-[11px] text-muted-foreground">{r.product.sku} · {r.branch.name}</p></Link>
              <div className="flex items-center gap-1"><StockStatusBadge status={r.status} />{actions(r)}</div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
              {[["On hand", r.record.quantityOnHand], ["Reserved", r.record.quantityReserved], ["Available", r.available], ["Threshold", r.record.lowStockThreshold]].map(([k, v]) => <div key={k}><p className="text-muted-foreground">{k}</p><p className="font-bold">{formatNumber(Number(v))}</p></div>)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Updated {formatDayTime(r.record.lastUpdated, db.tenant.referenceDate)}</p>
          </div>))}</div>
        </>}
        {visible.length === 0 && empty}
        {pages > 1 && <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs">
          <span className="text-muted-foreground">Page {Math.min(page, pages)} of {pages}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </div>}
      </Panel>

      <AddStockDialog open={addOpen} onOpenChange={setAddOpen} scope={scope} defaults={addDefaults} />
      <AdjustStockDialog record={adjusting?.record ?? null} productName={adjusting?.product.name ?? ""} onClose={() => setAdjusting(null)} actorId={userId} />
      {!simple && <MovementsSheet open={movesOpen} onOpenChange={setMovesOpen} branchIds={scope.branchIds} branchId={activeBranch === ALL ? undefined : activeBranch} />}
    </AppShell>
  );
}
