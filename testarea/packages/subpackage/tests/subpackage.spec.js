const { test, expect } = require('@playwright/test');

test('basic test', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  const name = await page.innerText('.navbar__title');
  expect(name).toBe('Playwright');
});

test('hoge', async ({page}) => {

  // Go to https://www.google.co.jp/
  await page.goto('https://www.google.co.jp/');

  // Click [aria-label="検索"]
  await page.click('[aria-label="検索"]');

  // Fill [aria-label="検索"]
  await page.fill('[aria-label="検索"]', 'aaaa');

  // Press Enter
  await Promise.all([
    page.waitForNavigation(/*{ url: 'https://www.google.co.jp/search?q=aaaa&source=hp&ei=DxHfYIzRLMKSr7wPu8ma2AI&iflsig=AINFCbYAAAAAYN8fH6nDbEoAuZD4DC2rgyHyNz2gJKbp&oq=aaaa&gs_lcp=Cgdnd3Mtd2l6EAMyBwgAELEDEAQyBAgAEAQyBAgAEAQyBAgAEAQyBAgAEAQyAggAMgIIADICCAA6CggAELEDEIMBEAQ6BQgAELEDOggIABCxAxCDAVDwD1jNE2DPMWgBcAB4AIABmAGIAcEEkgEDMC40mAEAoAEBqgEHZ3dzLXdperABAA&sclient=gws-wiz&ved=0ahUKEwjMlNnQu8TxAhVCyYsBHbukBisQ4dUDCAk&uact=5' }*/),
    page.press('[aria-label="検索"]', 'Enter')
  ]);

  // Click [aria-label="Google アプリ"]
  await page.click('[aria-label="Google アプリ"]');

  // Click li:nth-child(2) .tX9u1b .CgwTDb .MrEfLc
  await Promise.all([
    page.waitForNavigation(/*{ url: 'https://www.google.co.jp/webhp?tab=ww' }*/),
    page.frame({
      url: 'https://ogs.google.co.jp/widget/app/so?bc=1&origin=https%3A%2F%2Fwww.google.co.jp&cn=app&pid=1&spid=1&hl=ja'
    }).click('li:nth-child(2) .tX9u1b .CgwTDb .MrEfLc')
  ]);
});