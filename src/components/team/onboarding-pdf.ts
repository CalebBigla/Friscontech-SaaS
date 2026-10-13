import type { Db } from "@/data/mock-db";
import { guarantorStatusLabel, type Onboarding } from "@/data/onboarding";
import { fullName, isMarried, needsSecondContact } from "@/lib/onboarding";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Opens a print-ready, company-branded copy of the onboarding record ("Save as PDF"). */
export function downloadOnboardingPdf(db: Db, o: Onboarding) {
  const d = o.data;
  const user = db.users.find((u) => u.id === o.userId);
  const sec = (title: string, rows: [string, string][]) =>
    `<h2>${esc(title)}</h2><table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v || "—")}</td></tr>`).join("")}</table>`;
  const g = o.guarantorResponse;
  const html = `<!doctype html><html><head><title>${esc(o.employeeId)} — ${esc(user?.name ?? "")}</title><style>
    body{font-family:Arial,sans-serif;color:#1a1a1a;margin:32px;font-size:12px}
    header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #16803c;padding-bottom:12px}
    .logo{font-size:22px;font-weight:800;color:#16803c}.logo span{color:#d42027}
    h1{font-size:16px;margin:0}h2{font-size:12px;text-transform:uppercase;color:#16803c;margin:18px 0 6px}
    table{width:100%;border-collapse:collapse}th{width:35%;text-align:left;color:#555;font-weight:600}th,td{padding:4px 6px;border-bottom:1px solid #eee;vertical-align:top}
    img{width:110px;height:130px;object-fit:cover;border:1px solid #ccc}.conf{border:1px solid #d42027;padding:8px;margin-top:12px}.conf b{color:#d42027}
    footer{margin-top:28px;border-top:1px solid #ccc;padding-top:8px;text-align:center;color:#666;font-size:11px}
  </style></head><body>
  <header><div><div class="logo">Friscon<span>tech</span></div><h1>Employee Data Form</h1><p>${esc(o.employeeId)} · ${esc(o.jobTitle)} · ${esc(o.department)}</p></div>${o.photo ? `<img src="${o.photo.dataUrl}" alt="Passport"/>` : ""}</header>
  ${sec("Personal", [["Name", fullName(d)], ["Gender", d.gender], ["Birth date", d.birthDate], ["Marital status", d.maritalStatus], ["Phone", d.phone], ["Email", d.email], ["Address", d.address], ["Nationality", d.nationality], ["State of origin", d.stateOfOrigin], ["LGA", d.lga], ["Preferred company e-mail ID", d.preferredEmailId]])}
  ${sec("Job", [["Job title", o.jobTitle], ["Employee ID", o.employeeId], ["Department", o.department], ["Start date", o.startDate]])}
  ${sec("Previous job reference", [["Referee", d.refName], ["Job title", d.refJobTitle], ["Company", d.refCompany], ["Email", d.refEmail]])}
  ${isMarried(d) ? sec("Family", [["Spouse", fullName(d, "spouse")], ["Phone", d.spousePhone], ["Email", d.spouseEmail], ["Work address", d.spouseWorkAddress], ["Spouse is first emergency contact", d.spouseIsEmergency]]) : ""}
  ${!(isMarried(d) && d.spouseIsEmergency === "Yes") ? sec("Emergency contact", [["Name", fullName(d, "ec")], ["Relationship", d.ecRelationship], ["Phone", d.ecPhone], ["Alternate phone", d.ecAltPhone], ["Occupation", d.ecOccupation], ["Address", d.ecAddress]]) : ""}
  ${needsSecondContact(d) ? sec("Second emergency contact", [["Name", fullName(d, "ec2")], ["Relationship", d.ec2Relationship], ["Phone", d.ec2Phone], ["Alternate phone", d.ec2AltPhone], ["Occupation", d.ec2Occupation], ["Address", d.ec2Address]]) : ""}
  ${sec("Statutory", [["NIN", d.nin], ["Bank", d.bankName], ["Account number", d.accountNumber]])}
  ${sec("Guarantor", [["Name", `${d.guarantorFirstName} ${d.guarantorSurname}`], ["Email", d.guarantorEmail], ["Phone", d.guarantorPhone], ["Address", d.guarantorAddress], ["Status", guarantorStatusLabel[o.guarantorStatus]]])}
  ${g ? `<div class="conf"><b>CONFIDENTIAL</b>${sec("Guarantor response", [["Known the employee for", g.yearsKnown], ["Relationship", g.relationship], ["Character", g.character], ["Comments", g.comments], ["Signature / date", `${g.signature} · ${g.signedDate}`]])}</div>` : ""}
  ${sec("Declaration", [["Accepted", d.declarationAccepted === "yes" ? "Yes" : "No"], ["Signature", d.signature], ["Date", d.signedDate], ["Credentials attached", String(o.credentials.length)]])}
  <footer>Friscon Tech Limited · Confidential staff record</footer>
  <script>window.onload=()=>setTimeout(()=>window.print(),200)</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
