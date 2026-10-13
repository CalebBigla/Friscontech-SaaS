import type { Db, ManagerRemittance, Payment, PaymentStatus } from "@/data/mock-db";
import type { AccessScope } from "@/lib/session";
import { saleTotal } from "@/lib/calculations";
import { daysInMonth } from "@/lib/dates";

export type PaymentBreakdown = Pick<Payment, "cashAmount" | "transferAmount">;
const qualifyingManagerPayments = (rows: ManagerRemittance[]) =>
  rows.filter((row) => row.status !== "declined");
export const getTotalManagerCashPayments = (rows: ManagerRemittance[]) =>
  qualifyingManagerPayments(rows).reduce((sum, row) => sum + row.cashAmount, 0);
export const getTotalManagerTransferPayments = (rows: ManagerRemittance[]) =>
  qualifyingManagerPayments(rows).reduce((sum, row) => sum + row.transferAmount, 0);
export const getTotalManagerPayment = (rows: ManagerRemittance[]) =>
  getTotalManagerCashPayments(rows) + getTotalManagerTransferPayments(rows);
export function getOwnerManagerPaymentSummary(rows: ManagerRemittance[]) {
  const qualifying = qualifyingManagerPayments(rows);
  const latestByManager = new Map<string, ManagerRemittance>();
  for (const row of qualifying) {
    const previous = latestByManager.get(row.managerId);
    if (
      !previous ||
      (row.submittedAt ?? row.createdAt) > (previous.submittedAt ?? previous.createdAt)
    )
      latestByManager.set(row.managerId, row);
  }
  return {
    cash: getTotalManagerCashPayments(rows),
    transfer: getTotalManagerTransferPayments(rows),
    total: getTotalManagerPayment(rows),
    outstanding: [...latestByManager.values()].reduce((sum, row) => sum + row.outstandingAmount, 0),
    submitted: qualifying.filter((row) => row.status === "submitted").length,
    confirmed: qualifying.filter((row) => row.status === "confirmed").length,
    declined: rows.filter((row) => row.status === "declined").length,
  };
}
export type PaymentFilters = {
  period?: string;
  branchId?: string;
  salesRepId?: string;
  status?: PaymentStatus | "all";
};

export function isValidPaymentPeriod(period: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const [year, month] = period.split("-").map(Number) as [number, number];
  return year >= 2000 && year <= 9999 && month >= 1 && month <= 12;
}

export function getRepSalesForPeriod(db: Db, repId: string, period: string) {
  if (!isValidPaymentPeriod(period)) return [];
  const from = `${period}-01`;
  const to = `${period}-${String(daysInMonth(period)).padStart(2, "0")}`;
  return db.sales.filter(
    (sale) =>
      sale.tenantId === db.tenant.id &&
      sale.salesRepId === repId &&
      sale.status === "completed" &&
      sale.saleDate >= from &&
      sale.saleDate <= to,
  );
}

export const getRepTotalSales = (db: Db, repId: string, period: string) =>
  getRepSalesForPeriod(db, repId, period).reduce((sum, sale) => sum + saleTotal(sale), 0);

export const getPaymentOutstanding = (
  totalSales: number,
  cashAmount: number,
  transferAmount: number,
) => totalSales - cashAmount - transferAmount;
export const getPaymentTotal = (payment: PaymentBreakdown) =>
  payment.cashAmount + payment.transferAmount;
export const getPaymentTotalAccounted = (totalSales: number, payment: PaymentBreakdown) =>
  getPaymentTotal(payment) +
  getPaymentOutstanding(totalSales, payment.cashAmount, payment.transferAmount);
export function getRepPaymentSummary(db: Db, repId: string, period: string) {
  const rows = db.payments.filter(
    (payment) =>
      payment.tenantId === db.tenant.id &&
      payment.salesRepId === repId &&
      payment.period === period &&
      payment.status !== "declined",
  );
  const cash = rows.reduce((sum, payment) => sum + payment.cashAmount, 0);
  const transfer = rows.reduce((sum, payment) => sum + payment.transferAmount, 0);
  const totalSales = getRepTotalSales(db, repId, period);
  return { cash, transfer, totalSales, outstanding: Math.max(totalSales - cash - transfer, 0) };
}
export const getPaymentTotalSales = (db: Db, payment: Payment) =>
  getRepTotalSales(db, payment.salesRepId, payment.period);
export function getPaymentCollectedToDate(db: Db, payment: Payment) {
  return db.payments
    .filter(
      (item) =>
        item.tenantId === payment.tenantId &&
        item.salesRepId === payment.salesRepId &&
        item.period === payment.period &&
        item.status !== "declined" &&
        (item.submittedAt < payment.submittedAt ||
          (item.submittedAt === payment.submittedAt && item.id.localeCompare(payment.id) <= 0)),
    )
    .reduce((sum, item) => sum + item.cashAmount + item.transferAmount, 0);
}
export const getPaymentOutstandingAmount = (db: Db, payment: Payment) =>
  Math.max(getPaymentTotalSales(db, payment) - getPaymentCollectedToDate(db, payment), 0);
export const getPaymentAccountedAmount = (db: Db, payment: Payment) =>
  getPaymentCollectedToDate(db, payment) + getPaymentOutstandingAmount(db, payment);

export function validatePaymentReconciliation(totalSales: number, payment: PaymentBreakdown) {
  const outstanding = getPaymentOutstanding(totalSales, payment.cashAmount, payment.transferAmount);
  return {
    balanced:
      Number.isFinite(totalSales) &&
      totalSales >= 0 &&
      Number.isFinite(payment.cashAmount) &&
      Number.isFinite(payment.transferAmount) &&
      payment.cashAmount >= 0 &&
      payment.transferAmount >= 0 &&
      outstanding >= 0,
    outstanding,
  };
}

export function getPaymentsForScope(db: Db, scope: AccessScope, filters: PaymentFilters = {}) {
  return db.payments
    .filter((payment) => {
      if (payment.tenantId !== scope.user.tenantId || payment.tenantId !== db.tenant.id)
        return false;
      if (scope.user.role === "sales_rep" && payment.salesRepId !== scope.user.id) return false;
      if (
        scope.user.role === "manager" &&
        (payment.managerId !== scope.user.id || !scope.branchIds?.includes(payment.branchId))
      )
        return false;
      if (scope.user.role === "storekeeper") return false;
      return (
        (!filters.period || payment.period === filters.period) &&
        (!filters.branchId || payment.branchId === filters.branchId) &&
        (!filters.salesRepId || payment.salesRepId === filters.salesRepId) &&
        (!filters.status || filters.status === "all" || payment.status === filters.status)
      );
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function getManagerPaymentSummary(
  db: Db,
  rows: Payment[],
  managerId: string,
  period: string,
) {
  const manager = db.users.find(
    (user) => user.id === managerId && user.role === "manager" && user.tenantId === db.tenant.id,
  );
  const currentRows = rows.filter((payment) => payment.status !== "declined");
  const cashPayment = currentRows.reduce((sum, payment) => sum + payment.cashAmount, 0);
  const transferPayment = currentRows.reduce((sum, payment) => sum + payment.transferAmount, 0);
  const reps = manager?.branchId
    ? db.users.filter(
        (user) =>
          user.tenantId === db.tenant.id &&
          user.role === "sales_rep" &&
          user.branchId === manager.branchId,
      )
    : [];
  const totalSales = reps.reduce((sum, rep) => sum + getRepTotalSales(db, rep.id, period), 0);
  const outstanding = reps.reduce((sum, rep) => {
    const collected = currentRows
      .filter((payment) => payment.salesRepId === rep.id)
      .reduce((total, payment) => total + payment.cashAmount + payment.transferAmount, 0);
    return sum + Math.max(getRepTotalSales(db, rep.id, period) - collected, 0);
  }, 0);
  const collected = cashPayment + transferPayment;
  return {
    cashPayment,
    transferPayment,
    outstanding,
    totalSales,
    collectionRate: totalSales ? (collected / totalSales) * 100 : 0,
  };
}

export function getOwnerPaymentSummary(db: Db, rows: Payment[]) {
  const currentRows = rows.filter((payment) => payment.status !== "declined");
  const latestByRep = new Map<string, Payment>();
  for (const payment of currentRows) {
    const previous = latestByRep.get(payment.salesRepId);
    if (!previous || payment.submittedAt > previous.submittedAt)
      latestByRep.set(payment.salesRepId, payment);
  }
  return {
    cash: currentRows.reduce((sum, payment) => sum + payment.cashAmount, 0),
    transfer: currentRows.reduce((sum, payment) => sum + payment.transferAmount, 0),
    outstanding: [...latestByRep.values()].reduce(
      (sum, payment) => sum + getPaymentOutstandingAmount(db, payment),
      0,
    ),
    submitted: rows.filter((payment) => payment.status === "submitted").length,
    acknowledged: rows.filter((payment) => payment.status === "acknowledged").length,
    pendingConfirmation: rows.filter((payment) => payment.status === "acknowledged").length,
    reconciled: rows.filter((payment) => payment.status === "reconciled").length,
    declined: rows.filter((payment) => payment.status === "declined").length,
  };
}
