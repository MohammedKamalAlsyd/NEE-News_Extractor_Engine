import {
  createPlaywrightRouter,
  Dataset,
  PlaywrightCrawlingContext,
} from 'crawlee';
import { Page } from 'playwright';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs/promises';
import { RawNewsRecord } from './utils/getCountryNews.js';
import { loadConfig, Config } from '../src/config/config.js';
import { logInfo, logWarning, logError } from './utils/logger.js'; // Unified logging
import { ARTICLES_LINKS_DIR } from './meta/constants.js';
import { extractNewsFromDomain } from './utils/CrawlNewsWebsites.js';

export const router = createPlaywrightRouter();

const EXCLUSION_LIST = ['facebook.com', 'reddit.com', 'twitter.com', 'x.com', 'youtube.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com'];
const GOOGLE_DOMAINS = ['google.com', 'googleusercontent.com', 'accounts.google.com', 'support.google.com', 'policies.google.com', 'maps.google.com'];

// Unified logging wrapper
const createLogger = (source: string) => ({
  info: (message: string) => logInfo(`[${source}] ${message}`),
  warning: (message: string) => logWarning(`[${source}] ${message}`),
  error: (message: string, error?: unknown) => logError(`[${source}] ${message}`, undefined, error),
});

function extractDomain(href: string): string | null {
  try {
    if (href.startsWith('//')) href = 'https:' + href;
    if (!href.startsWith('http://') && !href.startsWith('https://')) return null;
    const urlObj = new URL(href);
    let hostname = urlObj.hostname.replace(/^www\./i, '');
    if (
      !hostname ||
      EXCLUSION_LIST.some(ex => hostname === ex || hostname.endsWith(`.${ex}`)) ||
      GOOGLE_DOMAINS.some(gd => hostname === gd || hostname.endsWith(`.${gd}`))
    ) return null;
    return hostname;
  } catch (err) {
    const errorMsg = `Invalid URL encountered during domain extraction: "${href}" - ${(err as Error).message}`;
    logWarning(errorMsg);
    return null;
  }
}

function getFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

async function handleConsentPopups(page: Page, logger: ReturnType<typeof createLogger>): Promise<void> {
  const consentSelectors = [
    'button[aria-label*="Accept all"i]',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text(" Agree")',
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

  for (const selector of consentSelectors) {
    try {
      const locator = page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout: 1500 });
      await locator.click({ timeout: 3000 });
      logger.info(`Clicked consent button with selector: ${selector}`);
      await page.waitForTimeout(500 + Math.random() * 500);
      return;
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') continue;
      logger.warning(`Error with consent selector ${selector}: ${(error as Error).message}`);
    }
  }
  logger.info('No consent popup found or clicked.');
}

// --- Route Handlers ---

router.addHandler('AHREFS', async (ctx: PlaywrightCrawlingContext) => {
  const { request, page } = ctx;
  const logger = createLogger('AHREFS');
  logger.info(`Processing: ${request.url}`);
  const config = await loadConfig();

  try {
    const tableSelector = 'div.css-1eo1mva-scrollableTable table';
    await page.waitForSelector(tableSelector, { timeout: config.timeout, state: 'visible' });
    logger.info('Table container found. Extracting rows...');

    const rowSelector = `${tableSelector} > tbody > tr`;
    const records = await page.$$eval(rowSelector, (rows) => {
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
            faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            additionalInfo: { searchUrl: window.location.href },
          });
        }
      });
      return results;
    });

    const dataset = await Dataset.open(request.userData.datasetName as string);
    if (records.length > 0) {
      await dataset.pushData(records.map(record => ({ ...record, source: 'AHREFS' as const })));
      logger.info(`Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      logger.warning(`No records found on page: ${request.url}`);
    }
  } catch (error) {
    logger.error(`Failed to scrape page ${request.url}: ${(error as Error).message}`);
  }
});

router.addHandler('SIMILARWEB', async (ctx: PlaywrightCrawlingContext) => {
  const { request, page } = ctx;
  const logger = createLogger('SIMILARWEB');
  logger.info(`Processing: ${request.url}`);
  await handleConsentPopups(page, logger);
  const config = await loadConfig();

  const expectedPathSegment = `/top-websites/${(request.userData.country as string)?.toLowerCase()}/news-and-media`;
  const currentUrl = page.url();
  if (!currentUrl.includes(expectedPathSegment)) {
    logger.warning(`Possible redirect or wrong page detected. Expected "${expectedPathSegment}" not in "${currentUrl}". Skipping.`);
    return;
  }

  try {
    const tableSelector = 'div[data-rank-table] table.tw-table';
    await page.waitForSelector(tableSelector, { timeout: config.timeout, state: 'visible' });
    logger.info('Table container found. Extracting rows...');

    const rowSelector = `${tableSelector} tbody tr.tw-table__row`;
    const records = await page.$$eval(rowSelector, (rows) => {
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
            faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            additionalInfo: { searchUrl: window.location.href },
          });
        }
      });
      return results;
    });

    const dataset = await Dataset.open(request.userData.datasetName as string);
    if (records.length > 0) {
      await dataset.pushData(records.map(record => ({ ...record, source: 'SIMILARWEB' as const })));
      logger.info(`Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      logger.warning(`No records found on page: ${request.url}`);
    }
  } catch (error) {
    logger.error(`Failed to scrape page ${request.url}: ${(error as Error).message}`);
  }
});

async function handleSearchResultPage(
  sourceName: RawNewsRecord['source'],
  ctx: PlaywrightCrawlingContext,
  resultSelectors: { container: string; link: string },
  config: Config
): Promise<void> {
  const { request, page } = ctx;
  const logger = createLogger(sourceName);
  logger.info(`Processing: ${request.url}`);
  await handleConsentPopups(page, logger);

  try {
    await page.waitForSelector(resultSelectors.container, { timeout: config.timeout, state: 'attached' });
    logger.info(`Results container "${resultSelectors.container}" found. Extracting links...`);

    const html = await page.content();
    const $ = cheerio.load(html);
    const items = $(resultSelectors.container);
    const records: RawNewsRecord[] = [];
    let rankCounter = (request.userData.startRank as number) || 1;

    items.find(resultSelectors.link).each((_, element) => {
      const url = $(element).attr('href')?.trim();
      if (!url) return;

      const domain = extractDomain(url);
      if (domain && !records.some(r => r.domain === domain)) {
        records.push({
          rank: rankCounter++,
          domain,
          faviconUrl: getFaviconUrl(domain),
          additionalInfo: { searchUrl: request.userData.searchUrl as string },
          source: sourceName,
        });
      }
    });

    const dataset = await Dataset.open(request.userData.datasetName as string);
    if (records.length > 0) {
      await dataset.pushData(records);
      logger.info(`Successfully extracted and saved ${records.length} records from: ${request.url}`);
    } else {
      logger.warning(`No valid records extracted using selectors (${resultSelectors.link} within ${resultSelectors.container}) on page: ${request.url}`);
    }
  } catch (error) {
    logger.error(`Failed to scrape page ${request.url}: ${(error as Error).message}`);
  }
}

router.addHandler('GOOGLE', async (ctx) => {
  const config = await loadConfig();
  await handleSearchResultPage('GOOGLE', ctx, { container: 'div#search', link: 'div[data-hveid][data-ved] a[href]' }, config);
});

router.addHandler('BING', async (ctx) => {
  const config = await loadConfig();
  await handleSearchResultPage('BING', ctx, { container: 'ol#b_results', link: 'li.b_algo h2 > a' }, config);
});

router.addHandler('DUCKDUCKGO', async (ctx) => {
  const config = await loadConfig();
  await handleSearchResultPage('DUCKDUCKGO', ctx, { container: 'div.results', link: 'a.result__a' }, config);
});

router.addHandler('BRAVE', async (ctx) => {
  const config = await loadConfig();
  await handleSearchResultPage('BRAVE', ctx, { container: 'div#results', link: 'div.snippet[data-pos] a.result-header' }, config);
});

router.addHandler('ECOSIA', async (ctx) => {
  const config = await loadConfig();
  await handleSearchResultPage('ECOSIA', ctx, { container: 'div.mainline-results', link: 'article.js-result a.result__link' }, config);
});

router.addHandler('ARTICLES', async (ctx: PlaywrightCrawlingContext) => {
  const { request } = ctx;
  const logger = createLogger('ARTICLES');
  const domain = request.userData.domain as string;
  logger.info(`Processing domain: ${domain}`);
  const config = await loadConfig();

  try {
    const articles = await extractNewsFromDomain(domain, config.articlesPerDomain || 50, config.pagesToCrawlPerDomain || 10);
    logger.info(`Extracted ${articles.length} articles for ${domain}`);
    const outputPath = path.join(process.cwd(), ARTICLES_LINKS_DIR, `${domain}.json`);
    await fs.mkdir(ARTICLES_LINKS_DIR, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(articles, null, 2), 'utf-8');
    logger.info(`Saved ${articles.length} articles to ${outputPath}`);
  } catch (error) {
    logger.error(`Failed to extract articles for ${domain}: ${(error as Error).message}`);
  }
});