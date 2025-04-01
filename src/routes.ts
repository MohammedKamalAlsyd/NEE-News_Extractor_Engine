import { createPlaywrightRouter, Dataset, log as crawleeLog } from 'crawlee';
import { Page } from 'playwright';
import * as cheerio from 'cheerio';
import { RawNewsRecord } from './utils/getCountryNews.js';
import { logInfo, logError } from './utils/logger.js';
import { loadConfig } from './config.js';

// Create the router
export const router = createPlaywrightRouter();

// Helper function to extract domain
function extractDomain(href: string): string | null {
  try {
    if (href.startsWith('/')) {
      crawleeLog.info(`Skipping relative URL: ${href}`);
      return null;
    }
    const urlObj = new URL(href, 'https://dummy.com');
    let hostname = urlObj.hostname.replace(/^www\./i, '');
    const exclusionList = ['facebook.com', 'reddit.com', 'twitter.com', 'x.com'];
    if (
      !hostname ||
      exclusionList.some(ex => hostname === ex || hostname.endsWith(`.${ex}`)) ||
      hostname.includes('google.com') ||
      hostname.includes('googleusercontent.com') ||
      hostname.includes('accounts.google.com')
    ) {
      return null;
    }
    return hostname;
  } catch (err) {
    crawleeLog.error(`Invalid URL during extraction: ${href} - ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Helper function to get favicon URL
function getFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

// Helper function to handle consent popups
async function handleConsentPopups(page: Page): Promise<void> {
  const consentSelectors = [
    'button[aria-label*="Accept all"]',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text(" Agree")',
    'button[id*="consent"]',
    'div[aria-modal="true"] button:has-text("Accept")',
  ];

  for (const selector of consentSelectors) {
    try {
      await page.locator(selector).click({ timeout: 3000 });
      crawleeLog.info(`Clicked consent button: ${selector}`);
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      // Continue to next selector if not found
    }
  }
  crawleeLog.debug('No consent popups found or clicked.');
}

// Handler for Ahrefs pages
router.addHandler('AHREFS', async ({ request, page, log }) => {
  log.info(`Processing Ahrefs: ${request.url}`);
  const config = await loadConfig();
  try {
    const rowSelector = 'div.css-1eo1mva-scrollableTable table > tbody > tr';
    await page.waitForSelector(rowSelector, { timeout: config.timeout });
    const records = await page.$$eval(rowSelector, (rows, args) => {
      const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
      rows.forEach(row => {
        const rankText = row.querySelector('td:nth-child(1)')?.textContent?.trim();
        const domainElement = row.querySelector('td:nth-child(3) a');
        const domain = domainElement?.textContent?.trim();
        const rank = rankText ? parseInt(rankText, 10) : null;
        if (rank !== null && !isNaN(rank) && domain) {
          results.push({
            rank,
            domain,
            faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            additionalInfo: { searchUrl: args.searchUrl },
          });
        }
      });
      return results;
    }, { searchUrl: request.url });

    // Push records to dataset
    await Dataset.pushData(records.map(record => ({ ...record, source: 'AHREFS' })));
    log.info(`Processed ${records.length} records from Ahrefs: ${request.url}`);
  } catch (error) {
    log.warning(`Failed to scrape Ahrefs page ${request.url}: ${error instanceof Error ? error.message : error}`);
  }
});

// Handler for SimilarWeb pages
router.addHandler('SIMILARWEB', async ({ request, page, log }) => {
  log.info(`Processing SimilarWeb: ${request.url}`);
  await handleConsentPopups(page);
  const config = await loadConfig();
  const expectedPath = `/top-websites/${request.userData.country.toLowerCase()}/news-and-media`;
  const currentUrl = page.url();
  if (!currentUrl.includes(expectedPath)) {
    log.warning(`Redirected or wrong page on SimilarWeb? Expected path "${expectedPath}" not in "${currentUrl}". Skipping.`);
    return;
  }
  try {
    const rowSelector = 'table.top-table__content tbody.top-table__body tr.top-table__row';
    await page.waitForSelector(rowSelector, { timeout: config.timeout });
    const records = await page.$$eval(rowSelector, (rows, args) => {
      const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
      rows.forEach(row => {
        const rankText = row.querySelector('td.top-table__column--rank span.tw-table__rank')?.textContent?.trim();
        const domain = row.querySelector('td.top-table__column--website span.tw-table__domain')?.textContent?.trim();
        const rank = rankText ? parseInt(rankText, 10) : null;
        if (rank !== null && !isNaN(rank) && domain) {
          results.push({
            rank,
            domain,
            faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
            additionalInfo: { searchUrl: args.searchUrl },
          });
        }
      });
      return results;
    }, { searchUrl: request.url });

    // Push records to dataset
    await Dataset.pushData(records.map(record => ({ ...record, source: 'SIMILARWEB' })));
    log.info(`Processed ${records.length} records from SimilarWeb: ${request.url}`);
  } catch (error) {
    log.warning(`Failed to scrape SimilarWeb page ${request.url}: ${error instanceof Error ? error.message : error}`);
  }
});

// Handler for Google search pages
router.addHandler('GOOGLE', async ({ request, page, log }) => {
  log.info(`Processing Google: ${request.url}`);
  await handleConsentPopups(page);
  const config = await loadConfig();
  try {
    await page.waitForSelector('div#search', { timeout: config.timeout });
    const html = await page.content();
    const $ = cheerio.load(html);
    const items = $('div#search div#rso div[data-hveid][lang]');
    const records: RawNewsRecord[] = [];
    items.each((_, element) => {
      try {
        const url = $(element).find('a').attr('href')?.trim();
        if (!url) return;
        const domain = extractDomain(url);
        if (domain) {
          records.push({
            rank: request.userData.googleRankCounter++,
            domain,
            faviconUrl: getFaviconUrl(domain),
            source: 'GOOGLE',
            additionalInfo: { searchUrl: request.userData.searchUrl },
          });
        }
      } catch (err) {
        log.warning(`Error processing Google item: ${err instanceof Error ? err.message : err}`);
      }
    });
    // Push records to dataset
    await Dataset.pushData(records);
    log.info(`Processed ${records.length} records from Google: ${request.url}`);
  } catch (error) {
    log.warning(`Failed to scrape Google page ${request.url}: ${error instanceof Error ? error.message : error}`);
  }
});