import type { CertificateRow } from "@/lib/courses/types";

const escapePdfText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

const padOffset = (value: number): string => String(value).padStart(10, "0");

const encodeUtf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

const concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
};

export const generateCertificateCode = (): string => {
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `CERT-${token}`;
};

export const buildCertificatePdf = (params: {
  studentName: string;
  courseTitle: string;
  issuedAt: string;
  verificationCode: string;
  brandName: string;
}): Uint8Array => {
  const issueDate = new Date(params.issuedAt);
  const safeDate = Number.isNaN(issueDate.getTime()) ? new Date() : issueDate;
  const displayDate = safeDate.toISOString().slice(0, 10);

  const lines = [
    { text: "Certificate of Completion", size: 32, x: 100, y: 700 },
    { text: "This certifies that", size: 16, x: 230, y: 650 },
    { text: params.studentName, size: 24, x: 160, y: 615 },
    { text: "has successfully completed", size: 16, x: 190, y: 575 },
    { text: params.courseTitle, size: 22, x: 120, y: 540 },
    { text: `Issued by ${params.brandName} on ${displayDate}`, size: 14, x: 150, y: 490 },
    { text: `Verification Code: ${params.verificationCode}`, size: 14, x: 150, y: 455 },
  ];

  const content = [
    "BT",
    ...lines.flatMap((line) => [
      `/F1 ${line.size} Tf`,
      `1 0 0 1 ${line.x} ${line.y} Tm`,
      `(${escapePdfText(line.text)}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const contentBytes = encodeUtf8(content);

  const objects: Uint8Array[] = [
    encodeUtf8("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encodeUtf8("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    encodeUtf8(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    ),
    encodeUtf8("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"),
    concatBytes([
      encodeUtf8(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`),
      contentBytes,
      encodeUtf8("\nendstream\nendobj\n"),
    ]),
  ];

  const outputChunks: Uint8Array[] = [encodeUtf8("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let outputLength = outputChunks[0].length;

  for (const object of objects) {
    offsets.push(outputLength);
    outputChunks.push(object);
    outputLength += object.length;
  }

  const xrefOffset = outputLength;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n"];

  for (let objectNumber = 1; objectNumber <= objects.length; objectNumber += 1) {
    xrefLines.push(`${padOffset(offsets[objectNumber] ?? 0)} 00000 n \n`);
  }

  xrefLines.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  outputChunks.push(encodeUtf8(xrefLines.join("")));

  return concatBytes(outputChunks);
};

export const getCertificateCode = (certificate: CertificateRow): string | null => {
  if (certificate.certificate_number?.trim()) return certificate.certificate_number.trim();
  const maybeCode = (certificate.metadata as { verification_code?: unknown } | null)?.verification_code;
  if (typeof maybeCode === "string" && maybeCode.trim()) return maybeCode.trim();
  return null;
};
