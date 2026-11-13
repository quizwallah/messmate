export function normalizeScholarNumber(value: unknown) {
  const scholarNumber = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{3,32}$/.test(scholarNumber) ? scholarNumber : null;
}

export function scholarEmail(scholarNumber: string) {
  return `${scholarNumber.toLowerCase()}@stu.manit.ac.in`;
}

export function maskScholarEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}••••@${domain}`;
}
