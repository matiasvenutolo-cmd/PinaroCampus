/** "Agregar licencia o certificación" de LinkedIn con los datos prellenados (docs/06). */
export function linkedInAddUrl({
  courseTitle,
  issuerName,
  issuedAt,
  code,
  verifyUrl,
}: {
  courseTitle: string;
  issuerName: string;
  issuedAt: Date;
  code: string;
  verifyUrl: string;
}): string {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: courseTitle,
    organizationName: issuerName,
    issueYear: String(issuedAt.getUTCFullYear()),
    issueMonth: String(issuedAt.getUTCMonth() + 1),
    certId: code,
    certUrl: verifyUrl,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}
