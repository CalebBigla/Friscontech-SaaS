import { guarantorStatusLabel, type Onboarding } from "@/data/onboarding";
import { fullName, isMarried, needsSecondContact } from "@/lib/onboarding";

type Rows = [string, string | undefined][];

const BRAND: [number, number, number] = [22, 128, 60];
const ACCENT: [number, number, number] = [212, 32, 39];
const MUTED: [number, number, number] = [100, 100, 100];

/** Every section of the employee data form, in print order. */
export function onboardingSections(o: Onboarding): { title: string; rows: Rows; confidential?: boolean }[] {
  const d = o.data;
  const g = o.guarantorResponse;
  const sections: { title: string; rows: Rows; confidential?: boolean }[] = [
    { title: "Personal", rows: [["Name", fullName(d)], ["Gender", d.gender], ["Birth date", d.birthDate], ["Marital status", d.maritalStatus], ["Phone", d.phone], ["Email", d.email], ["Address", d.address], ["Nationality", d.nationality], ["State of origin", d.stateOfOrigin], ["LGA", d.lga], ["Company e-mail ID", d.preferredEmailId]] },
    { title: "Job", rows: [["Job title", o.jobTitle], ["Employee ID", o.employeeId], ["Department", o.department], ["Start date", o.startDate]] },
    { title: "Previous job reference", rows: [["Referee", d.refName], ["Job title", d.refJobTitle], ["Company", d.refCompany], ["Email", d.refEmail]] },
  ];
  if (isMarried(d)) sections.push({ title: "Family", rows: [["Spouse", fullName(d, "spouse")], ["Phone", d.spousePhone], ["Email", d.spouseEmail], ["Work address", d.spouseWorkAddress], ["Spouse is first emergency contact", d.spouseIsEmergency]] });
  if (!(isMarried(d) && d.spouseIsEmergency === "Yes")) sections.push({ title: "Emergency contact", rows: [["Name", fullName(d, "ec")], ["Relationship", d.ecRelationship], ["Phone", d.ecPhone], ["Alternate phone", d.ecAltPhone], ["Occupation", d.ecOccupation], ["Address", d.ecAddress]] });
  if (needsSecondContact(d)) sections.push({ title: "Second emergency contact", rows: [["Name", fullName(d, "ec2")], ["Relationship", d.ec2Relationship], ["Phone", d.ec2Phone], ["Alternate phone", d.ec2AltPhone], ["Occupation", d.ec2Occupation], ["Address", d.ec2Address]] });
  sections.push(
    { title: "Statutory", rows: [["NIN", d.nin], ["Bank", d.bankName], ["Account number", d.accountNumber]] },
    { title: "Guarantor", rows: [["Name", [d.guarantorFirstName, d.guarantorSurname].filter(Boolean).join(" ")], ["Email", d.guarantorEmail], ["Phone", d.guarantorPhone], ["Address", d.guarantorAddress], ["Status", guarantorStatusLabel[o.guarantorStatus]]] },
  );
  if (g) sections.push({
    title: "Guarantor response (confidential)", confidential: true,
    rows: [["Filled in by", g.filledBy === "staff" ? "The applicant, on the guarantor's behalf" : "The guarantor"], ["Known the employee for", g.yearsKnown], ["Relationship", g.relationship], ["Character", g.character], ["Comments", g.comments], ["Signature / date", `${g.signature} · ${g.signedDate}`]],
  });
  sections.push({ title: "Declaration", rows: [["Accepted", d.declarationAccepted === "yes" ? "Yes" : "No"], ["Signature", d.signature], ["Date", d.signedDate], ["Credentials attached", [String(o.credentials.length), ...o.credentials.map((f) => f.name)].join(" · ")]] });
  return sections;
}

/** The passport photo as a data URL jsPDF can embed, or null when it can't be loaded. */
async function photoData(o: Onboarding): Promise<{ data: string; format: "JPEG" | "PNG" } | null> {
  if (!o.photo?.dataUrl) return null;
  try {
    const blob = await (await fetch(o.photo.dataUrl)).blob();
    const format = blob.type === "image/png" ? "PNG" : blob.type === "image/jpeg" ? "JPEG" : null;
    if (!format) return null;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

/** Company-branded PDF of the whole onboarding record. */
export async function buildOnboardingPdf(o: Onboarding): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const labelW = 170;
  let y = M;

  const footer = () => {
    doc.setFontSize(8).setTextColor(...MUTED).setFont("helvetica", "normal");
    doc.text("Friscon Tech Limited · Confidential staff record", W / 2, H - 20, { align: "center" });
  };
  const ensure = (h: number) => {
    if (y + h > H - 40) { footer(); doc.addPage(); y = M; }
  };

  // Header
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...BRAND).text("Friscon", M, y + 16);
  doc.setTextColor(...ACCENT).text("tech", M + doc.getTextWidth("Friscon"), y + 16);
  doc.setFontSize(13).setTextColor(20, 20, 20).text("Employee Data Form", M, y + 38);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED)
    .text([o.employeeId, o.jobTitle, o.department].filter(Boolean).join(" · "), M, y + 54);
  const photo = await photoData(o);
  if (photo) doc.addImage(photo.data, photo.format, W - M - 80, y, 80, 96);
  y += photo ? 108 : 66;
  doc.setDrawColor(...BRAND).setLineWidth(2).line(M, y, W - M, y);
  y += 18;

  for (const section of onboardingSections(o)) {
    ensure(40);
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...(section.confidential ? ACCENT : BRAND))
      .text(section.title.toUpperCase(), M, y);
    y += 14;
    for (const [label, value] of section.rows) {
      const lines = doc.setFont("helvetica", "normal").setFontSize(9).splitTextToSize(value?.trim() || "—", W - M * 2 - labelW);
      const h = Math.max(1, lines.length) * 12 + 4;
      ensure(h);
      doc.setFont("helvetica", "bold").setTextColor(...MUTED).text(label, M, y);
      doc.setFont("helvetica", "normal").setTextColor(20, 20, 20).text(lines, M + labelW, y);
      y += h;
      doc.setDrawColor(235, 235, 235).setLineWidth(0.5).line(M, y - 8, W - M, y - 8);
    }
    y += 10;
  }
  footer();
  return doc.output("blob");
}

export const onboardingPdfName = (o: Onboarding) =>
  `${[o.employeeId, o.data.firstName, o.data.lastName].filter(Boolean).join("-").replace(/[^\w.-]+/g, "_")}.pdf`;

/** Build the PDF and save it to the owner's device. */
export async function downloadOnboardingPdf(o: Onboarding) {
  const url = URL.createObjectURL(await buildOnboardingPdf(o));
  const a = document.createElement("a");
  a.href = url;
  a.download = onboardingPdfName(o);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
