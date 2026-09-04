import { describe, expect, it } from "vitest";

import {
  isExpenseReceiptStorageReference,
  isSupportAttachmentStorageReference,
} from "./private-storage-reference";

const organizationId = "10000000-0000-4000-8000-000000000001";
const expenseId = "20000000-0000-4000-8000-000000000002";
const creatorId = "30000000-0000-4000-8000-000000000003";
const ticketId = "40000000-0000-4000-8000-000000000004";
const fileId = "50000000-0000-4000-8000-000000000005";

describe("private storage references", () => {
  it("accepts only a receipt inside its organization and expense prefix", () => {
    expect(isExpenseReceiptStorageReference({
      organizationId,
      expenseId,
      bucket: "expense-receipts",
      path: `${organizationId}/${expenseId}/receipt-${fileId}.jpg`,
    })).toBe(true);
  });

  it.each([
    ["wrong bucket", "other-private-bucket", `${organizationId}/${expenseId}/receipt-${fileId}.jpg`],
    ["foreign organization", "expense-receipts", `90000000-0000-4000-8000-000000000009/${expenseId}/receipt-${fileId}.jpg`],
    ["foreign expense", "expense-receipts", `${organizationId}/90000000-0000-4000-8000-000000000009/receipt-${fileId}.jpg`],
    ["nested path", "expense-receipts", `${organizationId}/${expenseId}/../receipt-${fileId}.jpg`],
    ["unexpected file", "expense-receipts", `${organizationId}/${expenseId}/contract.pdf`],
  ])("rejects a receipt reference with %s", (_case, bucket, path) => {
    expect(isExpenseReceiptStorageReference({ organizationId, expenseId, bucket, path })).toBe(false);
  });

  it("accepts only a support attachment owned by the ticket creator", () => {
    expect(isSupportAttachmentStorageReference({
      organizationId,
      creatorId,
      ticketId,
      bucket: "support-attachments",
      path: `${organizationId}/${creatorId}/${ticketId}.webp`,
    })).toBe(true);
  });

  it.each([
    ["wrong bucket", "expense-receipts", `${organizationId}/${creatorId}/${ticketId}.png`],
    ["foreign organization", "support-attachments", `90000000-0000-4000-8000-000000000009/${creatorId}/${ticketId}.png`],
    ["foreign creator", "support-attachments", `${organizationId}/90000000-0000-4000-8000-000000000009/${ticketId}.png`],
    ["foreign ticket", "support-attachments", `${organizationId}/${creatorId}/90000000-0000-4000-8000-000000000009.png`],
    ["nested path", "support-attachments", `${organizationId}/${creatorId}/extra/${ticketId}.png`],
    ["unexpected type", "support-attachments", `${organizationId}/${creatorId}/${ticketId}.html`],
  ])("rejects a support reference with %s", (_case, bucket, path) => {
    expect(isSupportAttachmentStorageReference({ organizationId, creatorId, ticketId, bucket, path })).toBe(false);
  });
});
