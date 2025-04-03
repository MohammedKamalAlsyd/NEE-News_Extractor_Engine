import {
  createPlaywrightRouter,
  Dataset,
  log as crawleeLog,
  PlaywrightCrawlingContext,
  Dictionary
} from 'crawlee';
import { Page } from 'playwright';
import * as cheerio from 'cheerio';
import { RawNewsRecord } from './utils/getCountryNews.js';
import { loadConfig, Config } from './config.js';
import { logWarning as appLogWarning, logError as appLogError } from './utils/logger.js';

export const router = createPlaywrightRouter();

const EXCLUSION_LIST = ['facebook.com', 'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com'];
const GOOGLE_DOMAINS = ['google.com', 'googleusercontent.com', 'accounts.google.com', 'support.google.com', 'policies.google.com', 'maps.google.com'];

function extractDomain(href: string): string | null {
  try {
    if (href.startsWith('//')) {
      href = 'https:' + href;
    }
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      crawleeLog.debug(`Skipping non-HTTP URL: ${href}`);
      return null;
    }
    const urlObj = new URL(href);
    let hostname = urlObj.hostname.replace(/^www\./i, '');
    if (
      !hostname ||
      EXCLUSION_LIST.some(ex => hostname === ex || hostname.endsWith(`.${ex}`)) ||
      GOOGLE_DOMAINS.some(gd => hostname === gd || hostname.endsWith(`.${gd}`))
    ) {
      crawleeLog.debug(`Excluding domain: ${hostname} from URL: ${href}`);
      return null;
    }
    return hostname;
  } catch (err) {
    const errorMsg = `Invalid URL encountered during domain extraction: "${href}" - ${err instanceof Error ? err.message : String(err)}`;
    crawleeLog.warning(errorMsg);
    appLogWarning(errorMsg);
    return null;
  }
}

function getFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

async function handleConsentPopups(page: Page): Promise<void> {
  const consentSelectors = [
    'button[aria-label*="Accept all"i]',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Allow all")',
    'button:has-text("Akzeptieren")',
    'button:has-text("Zustimmen")',
    'button:has-text("J\'accepte")',
    'button:has-text("Accepter")',
    'button:has-text("Aceptar")',
    'button[id*="consent" i]',
    'button[class*="consent" i]',
    'div[aria-modal="true"] button:has-text("Accept")',
    '#onetrust-accept-btn-handler',
    '[data-testid="accept-button"]',
  ];

  crawleeLog.debug('Attempting to find and click consent popups...');
  for (const selector of consentSelectors) {
    try {
      const locator = page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout: 1500 });
      crawleeLog.debug(`Found potential consent button: ${selector}`);
      await locator.click({ timeout: 3000 });
      crawleeLog.info(`Clicked potential consent button matching selector: ${selector}`);
      await page.waitForTimeout(500 + Math.random() * 500);
      return;
    } catch (error: any) {
      if (error.name === 'TimeoutError') {
        crawleeLog.debug(`Consent selector not found or not visible within timeout: ${selector}`);
      } else {
        crawleeLog.debug(`Non-timeout error checking consent selector ${selector}: ${error.message}`);
      }
    }
  }
  crawleeLog.debug('Finished checking consent popups. None found or clicked.');
}

// --- Route Handlers ---

// Handler for Ahrefs pages
router.addHandler('AHREFS', async (ctx: PlaywrightCrawlingContext) => {
  const { request, page, log } = ctx;

  log.info(`[AHREFS] Processing: ${request.url}`);
  const config = await loadConfig();
  try {
    const tableSelector = 'div.css-1eo1mva-scrollableTable table';
    await page.waitForSelector(tableSelector, { timeout: config.timeout, state: 'visible' });
    log.info(`[AHREFS] Table container found. Extracting rows...`);

    const rowSelector = `${tableSelector} > tbody > tr`;
    const records = await page.$$eval(rowSelector, (rows, args) => {
      const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
      rows.forEach(row => {
        const rankText = row.querySelector('td:nth-child(1)')?.textContent?.trim();
        const domainElement = row.querySelector('td:nth-child(3) a');
        const domain = domainElement?.textContent?.trim();
        const rank = rankText ? parseInt(rankText.replace(/,/g, ''), 10) : null;

        if (rank !== null && !isNaN(rank) && domain) {
          results.push({
            rank,
            domain,
            faviconUrl: args.faviconBaseUrl + domain + '.ico',
            additionalInfo: { searchUrl: args.searchUrl },
          });
        }
      });
      return results;
    }, { searchUrl: request.url, faviconBaseUrl: 'https://icons.duckduckgo.com/ip3/' });

    // Open dataset using the datasetName provided in userData
    const dataset = await Dataset.open(request.userData.datasetName);
    if (records.length > 0) {
      await dataset.pushData(records.map(record => ({ ...record, source: 'AHREFS' })));
      log.info(`[AHREFS] Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      const warnMsg = `[AHREFS] No records found on page, selector might have changed or page is empty: ${request.url}`;
      log.warning(warnMsg);
      appLogWarning(warnMsg);
    }
  } catch (error: any) {
    const errorMsg = `[AHREFS] Failed to scrape page ${request.url}: ${error.message}. Source might be blocked, changed layout, or unavailable.`;
    log.error(errorMsg);
    appLogError(errorMsg);
  }
});

// Handler for SimilarWeb pages
router.addHandler('SIMILARWEB', async (ctx: PlaywrightCrawlingContext) => {
  const { request, page, log } = ctx;

  log.info(`[SIMILARWEB] Processing: ${request.url}`);
  await handleConsentPopups(page);
  const config = await loadConfig();

  const expectedPathSegment = `/top-websites/${request.userData.country?.toLowerCase()}/news-and-media`;
  const currentUrl = page.url();
  if (!currentUrl.includes(expectedPathSegment)) {
    const warnMsg = `[SIMILARWEB] Possible redirect or wrong page detected. Expected path "${expectedPathSegment}" not in current URL "${currentUrl}". Skipping.`;
    log.warning(warnMsg);
    appLogWarning(warnMsg);
    return;
  }

  try {
    const tableSelector = 'div[data-rank-table] table.tw-table';
    await page.waitForSelector(tableSelector, { timeout: config.timeout, state: 'visible' });
    log.info(`[SIMILARWEB] Table container found. Extracting rows...`);

    const rowSelector = `${tableSelector} tbody tr.tw-table__row`;
    const records = await page.$$eval(rowSelector, (rows, args) => {
      const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
      rows.forEach(row => {
        const rankElement = row.querySelector('span.tw-table__rank');
        const rankText = rankElement?.textContent?.trim();
        const domainElement = row.querySelector('span.tw-table__domain');
        const domain = domainElement?.textContent?.trim();
        const rank = rankText ? parseInt(rankText.replace(/,/g, ''), 10) : null;

        if (rank !== null && !isNaN(rank) && domain) {
          results.push({
            rank,
            domain,
            faviconUrl: args.faviconBaseUrl + domain + '.ico',
            additionalInfo: { searchUrl: args.searchUrl },
          });
        }
      });
      return results;
    }, { searchUrl: request.url, faviconBaseUrl: 'https://icons.duckduckgo.com/ip3/' });

    const dataset = await Dataset.open(request.userData.datasetName);
    if (records.length > 0) {
      await dataset.pushData(records.map(record => ({ ...record, source: 'SIMILARWEB' })));
      log.info(`[SIMILARWEB] Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      const warnMsg = `[SIMILARWEB] No records found on page, selector might have changed or page is empty: ${request.url}`;
      log.warning(warnMsg);
      appLogWarning(warnMsg);
    }
  } catch (error: any) {
    const errorMsg = `[SIMILARWEB] Failed to scrape page ${request.url}: ${error.message}. Source might be blocked, changed layout, or unavailable.`;
    log.error(errorMsg);
    appLogError(errorMsg);
  }
});

// Generic Search Engine Result Handler using Cheerio
async function handleSearchResultPage(
  sourceName: RawNewsRecord['source'],
  ctx: PlaywrightCrawlingContext,
  resultSelectors: { container: string; link: string; title?: string; snippet?: string },
  config: Config
): Promise<void> {
  const { request, page, log } = ctx;

  log.info(`[${sourceName}] Processing: ${request.url}`);
  await handleConsentPopups(page);

  try {
    await page.waitForSelector(resultSelectors.container, { timeout: config.timeout, state: 'attached' });
    log.info(`[${sourceName}] Results container "${resultSelectors.container}" found. Extracting links...`);

    const html = await page.content();
    const $ = cheerio.load(html);
    const items = $(resultSelectors.container);
    const records: RawNewsRecord[] = [];
    let rankCounter = request.userData.startRank || 1;

    items.find(resultSelectors.link).each((_, element) => {
      try {
        const url = $(element).attr('href')?.trim();
        if (!url) {
          log.debug(`[${sourceName}] Skipping element with no href.`);
          return;
        }

        const domain = extractDomain(url);
        if (domain) {
          if (!records.some(r => r.domain === domain)) {
            records.push({
              rank: rankCounter++,
              domain,
              faviconUrl: getFaviconUrl(domain),
              // Use searchUrl from request.userData
              additionalInfo: { searchUrl: request.userData.searchUrl },
              source: sourceName,
            });
          } else {
            log.debug(`[${sourceName}] Skipping duplicate domain on page: ${domain}`);
          }
        }
      } catch (err) {
        const warnMsg = `[${sourceName}] Error processing individual item: ${err instanceof Error ? err.message : String(err)}`;
        log.warning(warnMsg);
        appLogWarning(warnMsg);
      }
    });

    // Open dataset using datasetName from userData
    const dataset = await Dataset.open(request.userData.datasetName);
    if (records.length > 0) {
      await dataset.pushData(records);
      log.info(`[${sourceName}] Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      const warnMsg = `[${sourceName}] No valid records extracted using selectors (${resultSelectors.link} within ${resultSelectors.container}) on page: ${request.url}.`;
      log.warning(warnMsg);
      appLogWarning(warnMsg);
    }
  } catch (error: any) {
    const errorMsg = `[${sourceName}] Failed to scrape page ${request.url}: ${error.message}. Source might be blocked, changed layout, or unavailable.`;
    log.error(errorMsg);
    appLogError(errorMsg);

    if (error.name === 'TimeoutError') {
      const timeoutMsg = `[${sourceName}] Timeout waiting for selector "${resultSelectors.container}" on page ${request.url}.`;
      log.warning(timeoutMsg);
      appLogWarning(timeoutMsg);
    }
  }
}

// Handlers for search engines – they all use the generic helper
router.addHandler('GOOGLE', async (ctx: PlaywrightCrawlingContext) => {
  const config = await loadConfig();
  await handleSearchResultPage(
    'GOOGLE', ctx,
    { container: 'div#search', link: 'div[data-hveid][data-ved] a[href]' },
    config
  );
});

router.addHandler('BING', async (ctx: PlaywrightCrawlingContext) => {
  const config = await loadConfig();
  await handleSearchResultPage(
    'BING', ctx,
    { container: 'ol#b_results', link: 'li.b_algo h2 > a' },
    config
  );
});

router.addHandler('DUCKDUCKGO', async (ctx: PlaywrightCrawlingContext) => {
  const config = await loadConfig();
  await handleSearchResultPage(
    'DUCKDUCKGO', ctx,
    { container: 'div.results', link: 'a.result__a' },
    config
  );
});

router.addHandler('BRAVE', async (ctx: PlaywrightCrawlingContext) => {
  const config = await loadConfig();
  await handleSearchResultPage(
    'BRAVE', ctx,
    { container: 'div#results', link: 'div.snippet[data-pos] a.result-header' },
    config
  );
});

router.addHandler('ECOSIA', async (ctx: PlaywrightCrawlingContext) => {
  const config = await loadConfig();
  await handleSearchResultPage(
    'ECOSIA', ctx,
    { container: 'div.mainline-results', link: 'article.js-result a.result__link' },
    config
  );
});
