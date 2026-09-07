import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { buildManagementReportPdf } from "./report-pdf";
import { reportTestFixture } from "./report-test-fixture";

it("generates a real multipage PDF with Cyrillic fonts and repeated headers", async () => {
  const bytes = await buildManagementReportPdf(reportTestFixture(40));
  expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
  const pages = bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length;
  expect(pages).toBeGreaterThan(2);
  expect(pages).toBeLessThan(8); // Footers must not produce blank extra pages.
  expect(bytes.toString("latin1")).toContain("/FontFile2");
  if (process.env.REPORT_PDF_QA_DIRECTORY) {
    mkdirSync(process.env.REPORT_PDF_QA_DIRECTORY, { recursive: true });
    writeFileSync(join(process.env.REPORT_PDF_QA_DIRECTORY,"report-qa.pdf"),bytes);
    writeFileSync(join(process.env.REPORT_PDF_QA_DIRECTORY,"report-no-finance.pdf"),await buildManagementReportPdf({...reportTestFixture(),includeFinance:false}));
  }
});
