import { expect, test } from "@playwright/test";

test("PDF and CSV buttons produce download events and fit the viewport", async ({page}, info) => {
  await page.goto('/');
  for (const format of ['PDF','CSV']) {
    const downloadEvent=page.waitForEvent('download');
    await page.getByRole('button',{name:`Скачать ${format}`,exact:true}).click();
    const download=await downloadEvent;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
    const path=info.outputPath(`report.${format.toLowerCase()}`);
    await download.saveAs(path);
    expect(await download.failure()).toBeNull();
    await expect(page.getByRole('status')).toContainText('Файл подготовлен');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('buttons.png'),fullPage:true});
});

test("Mini App sends a file request with filters, not window.print or a popup", async ({page}) => {
  await page.goto('/?telegram');
  const requestEvent=page.waitForRequest(request=>request.url().includes('/api/reports/export') && request.method()==='POST');
  await page.getByRole('button',{name:'Скачать PDF',exact:true}).click();
  const request=await requestEvent;
  expect(request.postDataJSON()).toMatchObject({format:'pdf',dateFrom:'2026-09-01',dateTo:'2026-09-07'});
  await expect(page.getByRole('status')).toContainText('личный чат с ботом');
});

test("server errors are visible and the controls become available for retry", async ({page}) => {
  await page.route('**/api/reports/export*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Не удалось сформировать полный отчёт.'})}));
  await page.goto('/');
  await page.getByRole('button',{name:'Скачать CSV',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('полный отчёт');
  await expect(page.getByRole('button',{name:'Скачать CSV',exact:true})).toBeEnabled();
});
