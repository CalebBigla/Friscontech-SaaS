import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel } from "@/components/shared";
import type { Db } from "@/data/mock-db";
import { getRepStockHoldings } from "@/lib/inventory-calculations";
import { formatDayTime, formatNumber } from "@/lib/format";

/** Storekeeper view: stock each sales rep is currently holding (issued through requests minus sold). */
export function RepHoldingsPanel({ db, branchIds }: { db: Db; branchIds: string[] | null }) {
  const rows = getRepStockHoldings(db, branchIds);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.rep.id === openId);
  const today = db.tenant.referenceDate;
  const product = (id: string) => db.products.find((p) => p.id === id);
  return (
    <Panel className="mt-4 overflow-hidden" title="Stock with sales reps" subtitle="Issued through stock requests, minus what each rep has sold">
      {rows.length === 0 ? <EmptyState title="No sales reps at this branch" /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
          <thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="px-5 py-3">Sales rep</th><th className="px-5 py-3 text-right">Holding</th><th className="px-5 py-3 text-right">Issued</th><th className="px-5 py-3 text-right">Products</th><th className="px-5 py-3 text-right">Open requests</th><th className="px-5 py-3">Last issued</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.rep.id} onClick={() => setOpenId(r.rep.id)} className="cursor-pointer border-t border-border text-xs hover:bg-muted/60" data-testid="rep-holding-row">
              <td className="px-5 py-3 font-semibold">{r.rep.name}{r.awaitingAck > 0 && <span className="status status-warning ml-2">{r.awaitingAck} unacknowledged</span>}</td>
              <td className="px-5 py-3 text-right font-bold">{formatNumber(r.heldUnits)}</td>
              <td className="px-5 py-3 text-right text-muted-foreground">{formatNumber(r.issuedUnits)}</td>
              <td className="px-5 py-3 text-right">{r.holdings.filter((h) => h.held > 0).length}</td>
              <td className="px-5 py-3 text-right">{r.openRequests}</td>
              <td className="px-5 py-3 text-muted-foreground">{r.lastIssuedAt ? formatDayTime(r.lastIssuedAt, today) : "—"}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{open?.rep.name}</DialogTitle><DialogDescription className="text-xs">{formatNumber(open?.heldUnits ?? 0)} units currently held · {formatNumber(open?.issuedUnits ?? 0)} issued in total</DialogDescription></DialogHeader>
          {open && (open.holdings.length === 0 ? <EmptyState title="No stock issued to this rep yet" /> : (
            <table className="w-full text-left text-xs"><thead><tr className="text-[10px] uppercase text-muted-foreground"><th className="py-2">Product</th><th className="py-2 text-right">Issued</th><th className="py-2 text-right">Sold</th><th className="py-2 text-right">Holding</th></tr></thead>
              <tbody>{open.holdings.map((h) => <tr key={h.productId} className="border-t border-border"><td className="py-2.5"><p className="font-semibold">{product(h.productId)?.name}</p><p className="text-[10px] text-muted-foreground">Last issued {formatDayTime(h.lastIssuedAt, today)}</p></td><td className="py-2.5 text-right">{h.issued}</td><td className="py-2.5 text-right">{h.sold}</td><td className="py-2.5 text-right font-bold">{h.held}</td></tr>)}</tbody></table>
          ))}
          {open && <Link to="/stock-requests" className="text-xs font-semibold text-primary">View stock requests</Link>}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
