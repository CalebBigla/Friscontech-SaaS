/**
 * Staff onboarding model (Phase 4). Demo-only: lives in the in-memory store.
 *
 * WHAT A REAL BACKEND MUST PROVIDE BEFORE THIS IS SECURE:
 * - Tokens: store only a hash of each onboarding/guarantor token server-side, check expiry
 *   and single use on the server, and never ship tokens to other users' browsers.
 * - Files: upload photos/credentials to private object storage (e.g. Cloudinary signed uploads)
 *   instead of in-memory data URLs; serve them through signed, expiring URLs.
 * - Passwords: hand the password to the auth provider over HTTPS; never keep it (or a hash) in app data.
 * - Email: send the onboarding and guarantor links by email instead of copy/paste.
 */
export type OnboardingStatus = "invited" | "in_progress" | "submitted" | "active";
export type GuarantorStatus = "not_sent" | "sent" | "completed";

export type StoredFile = { name: string; type: string; size: number; dataUrl: string };

export const employeeFieldKeys = [
  "lastName", "firstName", "middleInitial", "address", "gender", "phone", "email", "birthDate",
  "maritalStatus", "nationality", "stateOfOrigin", "lga", "preferredEmailId",
  "refName", "refJobTitle", "refCompany", "refEmail",
  "spouseLastName", "spouseFirstName", "spouseMiddleInitial", "spousePhone", "spouseEmail", "spouseWorkAddress",
  "spouseIsEmergency",
  "ecLastName", "ecFirstName", "ecMiddleInitial", "ecAddress", "ecPhone", "ecAltPhone", "ecRelationship", "ecOccupation",
  "ec2LastName", "ec2FirstName", "ec2MiddleInitial", "ec2Address", "ec2Phone", "ec2AltPhone", "ec2Relationship", "ec2Occupation",
  "nin", "bankName", "accountNumber",
  "guarantorFirstName", "guarantorSurname", "guarantorAddress", "guarantorEmail", "guarantorPhone",
  "declarationAccepted", "signature", "signedDate",
] as const;
export type EmployeeField = (typeof employeeFieldKeys)[number];
export type EmployeeData = Record<EmployeeField, string>;
export const emptyEmployeeData = (): EmployeeData =>
  Object.fromEntries(employeeFieldKeys.map((k) => [k, ""])) as EmployeeData;

export type GuarantorResponse = {
  yearsKnown: string;
  relationship: string;
  character: string;
  comments: string;
  signature: string;
  signedDate: string;
  submittedAt: string;
};

export type Onboarding = {
  id: string;
  tenantId: string;
  userId: string;
  employeeId: string;
  jobTitle: string;
  department: string;
  startDate: string;
  status: OnboardingStatus;
  /** Demo only — a real backend stores a hash, never the raw token. */
  token: string;
  tokenExpiresAt: string;
  tokenRevoked: boolean;
  tokenUsed: boolean;
  step: number;
  data: EmployeeData;
  photo: StoredFile | null;
  credentials: StoredFile[];
  /** Account password is never stored in app data; we only record that it was set. */
  passwordSet: boolean;
  correctionNote?: string | undefined;
  guarantorStatus: GuarantorStatus;
  guarantorToken: string | null;
  guarantorResponse: GuarantorResponse | null;
  createdAt: string;
  submittedAt?: string;
  activatedAt?: string;
};

export const onboardingStatusLabel: Record<OnboardingStatus, string> = {
  invited: "Invited", in_progress: "In progress", submitted: "Submitted", active: "Active",
};
export const guarantorStatusLabel: Record<GuarantorStatus, string> = {
  not_sent: "Not sent", sent: "Sent", completed: "Completed",
};
export const LINK_VALID_DAYS = 7;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const CREDENTIAL_MAX_BYTES = 5 * 1024 * 1024;

export const NIGERIAN_BANKS = [
  "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank", "First Bank of Nigeria",
  "First City Monument Bank (FCMB)", "Globus Bank", "Guaranty Trust Bank (GTBank)", "Heritage Bank",
  "Jaiz Bank", "Keystone Bank", "Kuda Microfinance Bank", "Moniepoint Microfinance Bank", "OPay",
  "PalmPay", "Parallex Bank", "Polaris Bank", "Providus Bank", "Stanbic IBTC Bank",
  "Standard Chartered Bank", "Sterling Bank", "SunTrust Bank", "Titan Trust Bank", "Union Bank of Nigeria",
  "United Bank for Africa (UBA)", "Unity Bank", "Wema Bank", "Zenith Bank",
];

export const GUARANTOR_INTRO =
  "We sincerely appreciate your time in completing this form. The above-named applicant has nominated you as his/her guarantor for employment with Friscon Tech Limited. Kindly provide honest answers to the questions below. All information provided will be treated as highly confidential.";
export const DECLARATION_TEXT =
  "I certify that all the information given are correct and hereby accept full responsibility for any misrepresentation or false information discovered. I accept the right of the Company to dismiss me without notice as a result of any false information stated herein.";
