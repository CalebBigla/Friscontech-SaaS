import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Boxes, CircleDollarSign, Pencil, Power, ShoppingCart, Trash2 } from "lucide-react";

import { AppShell, RestrictedNotice } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { DetailItem, EmptyState, MetricCard, Panel, StockStatusBadge } from "@/components/shared";
import { MovementList } from "@/components/inventory/movement-list";
import { ProductFormDialog } from "@/components/products/add-product-dialog";
import { ProductStatusBadge, ProductStatusDialog } from "@/components/products/product-status";
import { useDb } from "@/services/mock-store";
import { getAccessScope, useCurrentUserId } from "@/lib/session";
import { getProduct, getProductCategories, getProductInventory, getProductSales, getProductStockMovements } from "@/lib/catalog-calculations";
import { monthRange } from "@/lib/calculations";
import { monthOf } from "@/lib/dates";
import { formatCompactNaira, formatMonth, formatNaira, formatNumber } from "@/lib/format";

export function ProductDetailPage({ productId }: { productId: string }) {
  const db = useDb();
  const userId = useCurrentUserId();
  const scope = getAccessScope(db, userId);
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const product = getProduct(db, productId);
  if (!product) return <AppShell title="Product"><RestrictedNotice message="This product does not exist." /><div className="mt-4 text-center"><Button variant="outline" asChild><Link to="/products"><ArrowLeft className="size-4" />Back to products</Link></Button></div></AppShell>;

  const month = monthOf(db.tenant.referenceDate);
  const inventory = getProductInventory(db, productId, scope.branchIds);
  const mtd = getProductSales(db, productId, monthRange(month, db.tenant.referenceDate), scope.branchIds);
  const all = getProductSales(db, productId, undefined, scope.branchIds);
  const movements = getProductStockMovements(db, productId, scope.branchIds).slice(0, 12);
  const totals = inventory.reduce((t, r) => ({ onHand: t.onHand + r.record.quantityOnHand, available: t.available + r.available }), { onHand: 0, available: 0 });

  return (
    <AppShell title={product.name} subtitle={`${product.sku} · ${product.category}`} actions={scope.canManageProducts || scope.canDeactivateProducts ? <div className="flex gap-2"><Button variant="outline" className={scope.user.role === "owner" && product.status === "active" ? "border-destructive/40 text-destructive" : undefined} onClick={() => setToggling(true)}>{scope.user.role === "owner" && product.status === "active" ? <Trash2 className="size-4" /> : <Power className="size-4" />}<span className="hidden sm:inline">{product.status === "active" ? (scope.user.role === "owner" ? "Delete" : scope.canDeactivateProducts ? "Deactivate" : "Request deactivation") : "Activate"}</span></Button>{scope.canManageProducts && <Button onClick={() => setEditing(true)}><Pencil className="size-4" /><span className="hidden sm:inline">Edit</span></Button>}</div> : undefined}>
      <Link to="/products" className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Products</Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3"><h1 className="text-xl font-bold">{product.name}</h1><ProductStatusBadge status={product.status} /></div>
      {product.status === "inactive" && <div className="alert-warning mb-5 rounded-lg p-4 text-xs">This product is inactive. It stays in historical records but can't be used for new sales, stock requests or stock additions.</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} tone="success" label={`Revenue · ${formatMonth(month)}`} value={formatCompactNaira(mtd.revenue)} detail={`${formatNumber(mtd.count)} sales this month`} />
        <MetricCard icon={ShoppingCart} tone="brand" label="Units sold this month" value={formatNumber(mtd.units)} detail={`${formatNumber(all.units)} units all time`} />
        <MetricCard icon={CircleDollarSign} tone="violet" label="All-time revenue" value={formatCompactNaira(all.revenue)} detail={`${formatNumber(all.count)} completed sales`} />
        <MetricCard icon={Boxes} tone="warning" label="Available stock" value={formatNumber(totals.available)} detail={`${formatNumber(totals.onHand)} on hand across ${inventory.length} branches`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Product information">
          <div className="grid grid-cols-2 gap-5 p-5">
            <DetailItem label="Name">{product.name}</DetailItem><DetailItem label="SKU"><span className="font-mono">{product.sku}</span></DetailItem>
            <DetailItem label="Category">{product.category}</DetailItem><DetailItem label="Unit">{product.unit}</DetailItem>
            <DetailItem label="Selling price">{formatNaira(product.unitPrice)}</DetailItem><DetailItem label="Unit cost">{formatNaira(product.unitCost)}</DetailItem>
            <DetailItem label="Low-stock threshold">{formatNumber(product.lowStockThreshold)} units</DetailItem><DetailItem label="Status"><ProductStatusBadge status={product.status} /></DetailItem>
            <div className="col-span-2"><p className="text-[11px] text-muted-foreground">Description</p><p className="mt-1 text-sm">{product.description ?? <span className="text-muted-foreground">No description</span>}</p></div>
          </div>
        </Panel>
        <Panel className="overflow-hidden" title="Inventory overview" subtitle="Stock by branch, from inventory records">
          {inventory.length ? <>
            <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[520px] text-left">
              <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Branch</th><th className="px-5 py-3 text-right">On hand</th><th className="px-5 py-3 text-right">Reserved</th><th className="px-5 py-3 text-right">Available</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody>{inventory.map((r) => (
                <tr key={r.record.id} className="border-t border-border text-xs">
                  <td className="px-5 py-3 font-bold"><Link to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className="hover:text-primary">{r.branch.name}</Link>{r.branch.status === "inactive" && <span className="ml-2 text-[10px] text-muted-foreground">(inactive)</span>}</td>
                  <td className="px-5 py-3 text-right">{formatNumber(r.record.quantityOnHand)}</td><td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(r.record.quantityReserved)}</td>
                  <td className="px-5 py-3 text-right font-bold">{formatNumber(r.available)}</td><td className="px-5 py-3"><StockStatusBadge status={r.status} /></td>
                </tr>))}</tbody>
            </table></div>
            <div className="divide-y divide-border sm:hidden">{inventory.map((r) => (
              <Link key={r.record.id} to="/inventory/$inventoryId" params={{ inventoryId: r.record.id }} className="flex items-center justify-between gap-3 p-4 text-xs">
                <div><p className="font-bold">{r.branch.name}</p><p className="mt-0.5 text-muted-foreground">{r.record.quantityOnHand} on hand · {r.record.quantityReserved} reserved</p></div>
                <div className="text-right"><p className="font-bold">{formatNumber(r.available)}</p><StockStatusBadge status={r.status} /></div>
              </Link>))}</div>
          </> : <EmptyState title="No inventory records found for this product." detail="Add stock from Inventory to create one." />}
        </Panel>
      </div>

      <Panel className="mt-5" title="Recent stock movements" subtitle="Latest additions, issues, sales and adjustments">
        <MovementList db={db} movements={movements} showItem />
      </Panel>

      {scope.canManageProducts && <ProductFormDialog open={editing} onOpenChange={setEditing} actorId={userId} product={product} categories={getProductCategories(db)} />}
      {(scope.canManageProducts || scope.canDeactivateProducts) && <ProductStatusDialog product={toggling ? product : null} onClose={() => setToggling(false)} actorId={userId} />}
    </AppShell>
  );
}
