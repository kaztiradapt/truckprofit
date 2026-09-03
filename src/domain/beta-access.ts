export type BetaInviteType = "EMAIL" | "TELEGRAM";

export function normalizeBetaContact(type: BetaInviteType, rawValue: unknown): string | null {
  const value = String(rawValue ?? "").trim();
  if (type === "EMAIL") {
    const normalized = value.toLocaleLowerCase("en-US");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  }
  const normalized = value.replace(/^@/, "").toLocaleLowerCase("en-US");
  return /^[a-z0-9_]{5,32}$/.test(normalized) ? normalized : null;
}

export function maskBetaContact(type: BetaInviteType, contact: string): string {
  if (type === "TELEGRAM") return `@${contact}`;
  const [local, domain] = contact.split("@");
  if (!domain) return contact;
  return `${local.slice(0, 2)}${local.length > 2 ? "***" : ""}@${domain}`;
}
