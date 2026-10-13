export type OwnerRemittancePayeeType = "supplier" | "service_provider" | "external_payee" | "other";
export type OwnerRemittancePaymentMethod = "cash" | "transfer";
export type OwnerRemittance = {
  id: string;
  tenantId: string;
  ownerId: string;
  branchId?: string;
  payeeType: OwnerRemittancePayeeType;
  payeeName: string;
  amount: number;
  paymentMethod: OwnerRemittancePaymentMethod;
  reference?: string;
  remittanceDate: string;
  purpose: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export const seedOwnerRemittances: OwnerRemittance[] = [];
