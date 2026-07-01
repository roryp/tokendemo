const { chromium } = require('playwright');
const path = require('path');

const outputDir = __dirname;
const baseUrl = process.env.ARTICLE_CAPTURE_URL || 'http://localhost:8080/';

function outputPath(name) {
  return path.join(outputDir, name);
}

async function applyDesktopCaptureStyles(page) {
  await page.addStyleTag({
    content: `
      html, body {
        margin: 0 !important;
        min-width: 1280px !important;
        overflow-x: hidden !important;
        scrollbar-width: none !important;
      }

      body::-webkit-scrollbar,
      *::-webkit-scrollbar {
        display: none !important;
      }

      .shell {
        width: 1180px !important;
        padding: 28px 0 !important;
      }

      .intro {
        grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr) !important;
      }

      .config-strip {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }

      .workspace {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }

      .metrics {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    `,
  });
}

async function loadDashboard(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#modelValue')?.textContent?.includes('gpt-chat-latest'));
  await applyDesktopCaptureStyles(page);
}

// Drive the real dashboard UI so screenshots always match the shipped
// renderers. Each demo issues live model + pricing calls, so point
// ARTICLE_CAPTURE_URL at a running instance (local or the deployed app).
async function runDemo(page, buttonSelector, readySelector) {
  await page.locator(buttonSelector).click();
  await page.waitForSelector(readySelector, { state: 'attached', timeout: 180000 });
  // Let the reveal animation and token counters finish before capturing.
  await page.waitForTimeout(2600);
}

async function applySinglePanelStyles(page) {
  await page.addStyleTag({
    content: `
      .shell { width: 760px !important; }
      .workspace { grid-template-columns: 1fr !important; }
    `,
  });
}

async function freezeAnimations(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-play-state: paused !important; }`,
  });
}

async function screenshotPanel(page, selector, name) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  await locator.screenshot({ path: outputPath(name), animations: 'disabled' });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });

  // 1. Dashboard overview in the three-column desktop layout.
  await loadDashboard(page);
  await page.screenshot({
    path: outputPath('instant-models-dashboard.png'),
    clip: { x: 110, y: 18, width: 1220, height: 740 },
    animations: 'disabled',
  });

  // Switch to a single, readable column for the per-panel result captures.
  await applySinglePanelStyles(page);

  // 2. Instant demo — live pricing showcase.
  await runDemo(page, '#instantButton', '#instantResult .price-headline');
  await freezeAnimations(page);
  await screenshotPanel(page, '.instant-panel', 'instant-models-results.png');

  // 3. Prompt cache demo — real-time cache warming (two model calls).
  await runDemo(page, '#cacheButton', '#cacheResult .cache-headline');
  await freezeAnimations(page);
  await screenshotPanel(page, '.cache-panel', 'prompt-cache-results.png');

  // 4. Compaction demo.
  await runDemo(page, '#compactButton', '#compactResult .compaction-headline');
  await freezeAnimations(page);
  await screenshotPanel(page, '.compact-panel', 'compaction-results.png');

  // 5. Caveman speak demo (two model calls: normal + caveman).
  await runDemo(page, '#cavemanButton', '#cavemanResult .caveman-headline');
  await freezeAnimations(page);
  await screenshotPanel(page, '.caveman-panel', 'caveman-results.png');

  await browser.close();
  console.log('Captured live dashboard screenshots in article-assets.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
