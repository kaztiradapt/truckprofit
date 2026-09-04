export const expenseReceiptBucket = "expense-receipts";
export const supportAttachmentBucket = "support-attachments";

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const expenseReceiptName = new RegExp(`^receipt-${uuidPattern}\\.(?:jpg|png)$`, "i");
const supportAttachmentName = new RegExp(`^${uuidPattern}\\.(?:jpg|png|webp)$`, "i");

function exactSegments(path: string, count: number): string[] | null {
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("\\")) return null;
  const segments = path.split("/");
  if (segments.length !== count || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  return segments;
}

export function isExpenseReceiptStorageReference(input: {
  organizationId: string;
  expenseId: string;
  bucket: string;
  path: string;
}): boolean {
  if (input.bucket !== expenseReceiptBucket) return false;
  const segments = exactSegments(input.path, 3);
  return Boolean(
    segments
    && segments[0] === input.organizationId
    && segments[1] === input.expenseId
    && expenseReceiptName.test(segments[2]),
  );
}

export function isSupportAttachmentStorageReference(input: {
  organizationId: string;
  creatorId: string;
  ticketId: string;
  bucket: string;
  path: string;
}): boolean {
  if (input.bucket !== supportAttachmentBucket) return false;
  const segments = exactSegments(input.path, 3);
  return Boolean(
    segments
    && segments[0] === input.organizationId
    && segments[1] === input.creatorId
    && segments[2] === `${input.ticketId}.${segments[2]?.split(".").at(-1)}`
    && supportAttachmentName.test(segments[2]),
  );
}
