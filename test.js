const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    for (let i = 0; i < msg.args().length; ++i)
      console.log(`[CONSOLE] ${i}: ${msg.args()[i]}`);
  });
  page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err);
  });
  page.on('requestfailed', request => {
    console.log(`[REQUEST FAILED] ${request.url()} - ${request.failure().errorText}`);
  });

  await page.goto('http://localhost:3000', {waitUntil: 'networkidle2'});

  console.log('Page loaded. Clicking search button...');
  await page.click('#srb');

  // Wait for either the results or the error block to become visible
  await page.waitForFunction(() => {
    const rs = document.getElementById('ra');
    const ea = document.getElementById('ea');
    return (rs && rs.style.display === 'block') || (ea && ea.style.display === 'block');
  }, {timeout: 10000});

  console.log('Search finished.');
  
  const resultsText = await page.evaluate(() => document.getElementById('rs')?.textContent);
  console.log('Results text:', resultsText);

  const errorText = await page.evaluate(() => document.getElementById('ea')?.textContent);
  if (errorText && errorText.trim()) console.log('Error text:', errorText.trim());

  await browser.close();
})();
