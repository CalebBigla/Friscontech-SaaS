import { Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, ShoppingCart, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { Db, InventoryMovement } from "@/data/mock-db";
import { EmptyState } from "@/components/shared";
import { movementTypeLabel } from "@/lib/inventory-calculations";
import { formatDayTime, formatUnits } from "@/lib/format";

const icon: Record<InventoryMovement["type"], { Icon: LucideIcon; tone: string }> = {
  stock_added: { Icon: ArrowDownLeft, tone: "bg-success-soft text-success" },
  stock_issued: { Icon: ArrowUpRight, tone: "bg-warning-soft text-warning" },
  sale: { Icon: ShoppingCart, tone: "bg-muted text-primary" },
  adjustment: { Icon: SlidersHorizontal, tone: "bg-violet-soft text-violet" },
};

/** Renders movements with resolved references (request, sale, actor) — no static copy. */
export function MovementList({ db, movements, showItem = false }: { db: Db; movements: InventoryMovement[]; showItem?: boolean }) {
  if (!movements.length) return <EmptyState title="No stock movements yet" detail="Stock additions, issues, sales and adjustments will appear here." />;
  const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? "Unknown user";
  return (
    <ol className="divide-y divide-border">
      {movements.map((m) => {
        const { Icon, tone } = icon[m.type];
        const request = m.referenceType === "stock_request" ? db.stockRequests.find((r) => r.id === m.referenceId) : undefined;
        const sale = m.referenceType === "sale" ? db.sales.find((s) => s.id === m.referenceId) : undefined;
        const product = db.products.find((p) => p.id === m.productId);
        const branch = db.branches.find((b) => b.id === m.branchId);
        const inv = db.inventory.find((i) => i.branchId === m.branchId && i.productId === m.productId);
        const who = m.type === "sale" ? `Sold by ${name(m.performedBy)}` : m.type === "stock_issued" && request ? `Issued to ${name(request.repId)} by ${name(m.performedBy)}` : m.type === "stock_added" ? `Received by ${name(m.performedBy)}` : `Adjusted by ${name(m.performedBy)}`;
        return (
          <li key={m.id} className="flex gap-3 px-5 py-3.5">
            <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${tone}`}><Icon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-xs font-semibold">{movementTypeLabel[m.type]}{showItem && product && <span className="font-normal text-muted-foreground"> · {inv ? <Link to="/inventory/$inventoryId" params={{ inventoryId: inv.id }} className="hover:text-primary">{product.name}</Link> : product.name} · {branch?.name}</span>}</p>
                <span className={`text-sm font-bold ${m.quantity > 0 ? "text-success" : "text-destructive"}`}>{m.quantity > 0 ? "+" : "−"}{formatUnits(Math.abs(m.quantity))}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDayTime(m.createdAt, db.tenant.referenceDate)} · {who}
                {request && <> · <Link to="/stock-requests/$requestId" params={{ requestId: request.id }} className="font-medium text-primary hover:underline">Stock Request #{request.id}</Link></>}
                {sale && <> · Sale {sale.code}</>}
              </p>
              {m.note && m.type !== "stock_issued" && <p className="mt-1 text-[11px] text-muted-foreground">“{m.note}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
