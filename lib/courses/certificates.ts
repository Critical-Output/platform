import crypto from "node:crypto";

const escapePdfText = (value: string): string => {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
};

export const generateCertificateNumber = (): string => {
  const year = new Date().getUTCFullYear();
  const random = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `CERT-${year}-${random}`;
};

export const canAccessCertificatePdf = (params: {
  isBrandAdmin: boolean;
  customerId: string | null;
  certificateCustomerId: string;
}): boolean => {
  if (params.isBrandAdmin) return true;
  if (!params.customerId) return false;
  return params.customerId === params.certificateCustomerId;
};

export const applyCertificateCourseLookupFilters = <T extends {
  eq: (column: string, value: unknown) => T;
  is: (column: string, value: null) => T;
}>(query: T, courseId: string): T => {
  return query.eq("id", courseId).is("deleted_at", null);
};

export const buildCertificatePdf = (params: {
  certificateNumber: string;
  studentName: string;
  courseTitle: string;
  issuedAt: string;
  brandName: string;
}): Buffer => {
  const { certificateNumber, studentName, courseTitle, issuedAt, brandName } = params;

  const lines = [
    `Completion Certificate`,
    `Awarded to: ${studentName}`,
    `Course: ${courseTitle}`,
    `Issued: ${issuedAt}`,
    `Verification code: ${certificateNumber}`,
    `Brand: ${brandName}`,
  ];

  const textCommands = lines
    .map((line, index) => `BT /F1 16 Tf 60 ${750 - index * 40} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const contentStream = `${textCommands}\n`;
  const contentLength = Buffer.byteLength(contentStream, "utf8");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${contentLength} >> stream\n${contentStream}endstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i <= objects.length; i += 1) {
    const offset = offsets[i] ?? 0;
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
};
