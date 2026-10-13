import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown, CheckCircle2, Eye, Layers, MoreHorizontal, Package, Pencil, Plus, Power, Trash2, XCircle } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ALL, EmptyState, FilterSelect, MetricCard, Panel, SearchBox, StockStatusBadge } from "@/components/shared";
import { ProductFormDialog } from "@/components/products/add-product-dialog";
import { ProductStatusDialog, ProductStatusBadge } from "@/components/products/product-status";
import type { Product } from "@/data/mock-db";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getProductCategories, getProductSummary, sortProducts, type ProductSortKey } from "@/lib/catalog-calculations";
import { getInventoryRows } from "@/lib/inventory-calculations";
import { formatDate, formatNaira, formatNumber } from "@/lib/format";

const sortOptions: { value: ProductSortKey; label: string }[] = [
  { value: "name", label: "Product" }, { value: "price", label: "Selling price" }, { value: "category", label: "Category" }, { value: "created", label: "Created date" }, { value: "status", label: "Status" },
];

export function ProductsPage() {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const manage = scope.canManageProducts;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [status, setStatus] = useState(manage ? ALL : "active");
  const [sort, setSort] = useState<ProductSortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [toggling, setToggling] = useState<Product | null>(null);

  const summary = getProductSummary(db);
  const categories = getProductCategories(db);
  const branchRows = scope.canManageProducts ? [] : getInventoryRows(db, { branchIds: scope.branchIds });
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = db.products.filter((p) => (!needle || `${p.name} ${p.sku}`.toLowerCase().includes(needle)) && (category === ALL || p.category === category) && (status === ALL || p.status === status));
    return sortProducts(filtered, sort, dir);
  }, [db.products, query, category, status, sort, dir]);

  const actions = (p: Product) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/products/$productId" params={{ productId: p.id }}><Eye className="size-4" />View</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditing(p)}><Pencil className="size-4" />Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setToggling(p)} className={scope.user.role === "owner" && p.status === "active" ? "text-destructive" : ""}>
          {scope.user.role === "owner" && p.status === "active" ? <Trash2 className="size-4" /> : <Power className="size-4" />}
          {p.status === "active" ? (scope.user.role === "owner" ? "Delete" : "Deactivate") : "Activate"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AppShell title="Products" subtitle={manage ? "Central product catalogue" : "Products you can sell"} actions={manage ? <Button onClick={() => setEditing("new")}><Plus className="size-4" /><span className="hidden sm:inline">Add Product</span></Button> : undefined}>
      <div className="mb-5"><h1 className="text-xl font-bold">Products</h1><p className="mt-1 text-xs text-muted-foreground">{manage ? "Manage your product catalogue and product information." : "Active products and what's available at your branch."}</p></div>
      {manage && <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={Package} tone="brand" label="Total products" value={formatNumber(summary.total)} detail="In the tenant catalogue" />
        <MetricCard icon={CheckCircle2} tone="success" label="Active products" value={formatNumber(summary.active)} detail="Available for operations" />
        <MetricCard icon={XCircle} tone="warning" label="Inactive products" value={formatNumber(summary.inactive)} detail="Kept for history only" />
        <MetricCard icon={Layers} tone="violet" label="Categories" value={formatNumber(summary.categories)} detail="Unique product categories" />
      </div>}
      <Panel className="overflow-hidden" title="Catalogue" subtitle={`${list.length} of ${db.products.length} products`} action={
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchBox value={query} onChange={setQuery} placeholder="Search name or SKU" />
          <FilterSelect label="Category filter" className="w-full sm:w-40" value={category} onChange={setCategory} options={[{ value: ALL, label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          {manage && <FilterSelect label="Status filter" className="w-full sm:w-32" value={status} onChange={setStatus} options={[{ value: ALL, label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />}
          <div className="flex gap-2"><FilterSelect label="Sort by" className="w-full sm:w-36" value={sort} onChange={(v) => setSort(v as ProductSortKey)} options={sortOptions} /><Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} aria-label={`Sort ${dir === "asc" ? "descending" : "ascending"}`}><ArrowUpDown className="size-4" /></Button></div>
        </div>}>
        {/* desktop / tablet table */}
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[880px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Product</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Unit</th><th className="px-5 py-3 text-right">Selling price</th>{manage ? <><th className="px-5 py-3 text-right">Unit cost</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3 text-right">Actions</th></> : <><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3">Stock</th></>}</tr></thead>
          <tbody>{list.map((p) => { const row = branchRows.find((r) => r.product.id === p.id); return (
            <tr key={p.id} className="border-t border-border text-xs">
              <td className="px-5 py-3 font-bold">{manage ? <Link to="/products/$productId" params={{ productId: p.id }} className="hover:text-primary">{p.name}</Link> : p.name}</td>
              <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px] text-muted-foreground">{p.sku}</td><td className="px-5 py-3">{p.category}</td><td className="px-5 py-3">{p.unit}</td>
              <td className="px-5 py-3 text-right font-semibold">{formatNaira(p.unitPrice)}</td>
              {manage ? <>
                <td className="px-5 py-3 text-right text-muted-foreground">{formatNaira(p.unitCost)}</td><td className="px-5 py-3"><ProductStatusBadge status={p.status} /></td>
                <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDate(p.createdAt.slice(0, 10))}</td><td className="px-5 py-3 text-right">{actions(p)}</td>
              </> : <><td className="px-5 py-3 text-right font-bold">{row ? formatNumber(row.available) : "—"}</td><td className="px-5 py-3">{row ? <StockStatusBadge status={row.status} /> : <span className="text-muted-foreground">Not stocked</span>}</td></>}
            </tr>); })}</tbody>
        </table></div>
        {/* mobile cards */}
        <div className="divide-y divide-border md:hidden">{list.map((p) => { const row = branchRows.find((r) => r.product.id === p.id); return (
          <div key={p.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0"><p className="truncate text-sm font-bold">{p.name}</p><p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{p.sku} · {p.category} · {p.unit}</p>
              <p className="mt-2 text-sm font-semibold">{formatNaira(p.unitPrice)}{manage && <span className="ml-2 text-[11px] font-normal text-muted-foreground">cost {formatNaira(p.unitCost)}</span>}</p>
              <div className="mt-2">{manage ? <ProductStatusBadge status={p.status} /> : row ? <span className="flex items-center gap-2 text-xs"><StockStatusBadge status={row.status} />{formatNumber(row.available)} available</span> : <span className="text-xs text-muted-foreground">Not stocked</span>}</div></div>
            {manage && actions(p)}
          </div>); })}</div>
        {!list.length && <EmptyState title="No products found." detail="Try a different search, category or status." />}
      </Panel>
      {manage && <ProductFormDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} actorId={userId} product={editing === "new" ? null : editing} categories={categories} />}
      {manage && <ProductStatusDialog product={toggling} onClose={() => setToggling(null)} actorId={userId} />}
    </AppShell>
  );
}
