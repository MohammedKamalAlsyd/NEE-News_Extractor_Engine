import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { PlaywrightCrawler, log as crawleeLog, LogLevel, Request } from 'crawlee';
import { Page } from 'playwright';
import { logInfo, logError } from './logger.js';
import { NEWS_DATA_DIR, SEARCH_KEYWORDS, LANGUAGE_CODES } from './constants.js';
import { getCountryData } from './getCountryData.js';

// --- Configuration ---
const GOOGLE_PAGES_TO_CRAWL = 2; // Limit Google search results pages
const GENERAL_TIMEOUT = 45000; // Default timeout for waits (in ms)

// Global counter for Google results to ensure unique and increasing ranks.
let googleRankCounter = 1;

crawleeLog.setLevel(LogLevel.INFO);

// --- Type Definitions ---
export interface RawNewsRecord {
  rank: number;
  domain: string;
  faviconUrl?: string;
  additionalInfo?: {
    searchUrl: string;
  };
  source: 'ahrefs' | 'similarweb' | 'google';
}

// Final output record type (without the source key)
export interface NewsRecord {
  rank: number;
  domain: string;
  faviconUrl?: string;
  additionalInfo?: {
    searchUrl: string;
  };
}

// Grouped records by source
export interface SourceGroupedNewsData {
  ahrefs?: NewsRecord[];
  similarweb?: NewsRecord[];
  google?: NewsRecord[];
}

// Final file structure type
export interface CountryNewsData {
  country: string;
  records: SourceGroupedNewsData;
}

// --- Helper Functions ---
// Return a favicon URL for a given domain.
function getFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

// Extract a clean domain from a URL string while filtering out unwanted domains.
function extractDomain(href: string): string | null {
  try {
    // Skip relative URLs.
    if (href.startsWith('/')) {
      logInfo(`Skipping relative URL: ${href}`);
      return null;
    }
    // If href is protocol-relative, provide a dummy protocol.
    const urlObj = new URL(href, 'https://dummy.com');
    let hostname = urlObj.hostname;
    // Remove "www." prefix if present.
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    // Exclusion list for social media and other unwanted domains.
    const exclusionList = ['facebook.com', 'reddit.com', 'twitter.com', 'x.com'];
    for (const ex of exclusionList) {
      if (hostname === ex || hostname.endsWith(`.${ex}`)) {
        return null;
      }
    }
    // Skip Google-related domains.
    if (!hostname || hostname.includes('google.com') || hostname.includes('googleusercontent.com') || hostname.includes('accounts.google.com')) {
      return null;
    }
    return hostname;
  } catch (err) {
    logError(`Invalid URL encountered during extraction: ${href} - ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Dismiss common consent popups.
async function handleConsentPopups(page: Page, log: typeof crawleeLog): Promise<void> {
  const consentSelectors = [
    'button[aria-label*="Accept all"]',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button[id*="consent"]',
    'div[aria-modal="true"] button:has-text("Accept")',
  ];

  for (const selector of consentSelectors) {
    try {
      await page.locator(selector).click({ timeout: 3000 });
      log.info(`Clicked consent button matching selector: ${selector}`);
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      // Continue if selector not found.
    }
  }
  log.debug('No common consent popups found or clicked.');
}

// --- Main Function using PlaywrightCrawler ---
export async function getCountryNews(language: string, country: string): Promise<CountryNewsData> {
  const countryNews: CountryNewsData = { country, records: {} };
  const aggregatedResultsMap = new Map<string, RawNewsRecord>();

  try {
    const countryData = await getCountryData(language, country);
    if (!countryData) {
      return countryNews;
    }
    await logInfo(`Starting news data fetch for ${countryData.officialName} (${country})`);

    const startUrls: { url: string; label: 'AHREFS' | 'SIMILARWEB' | 'GOOGLE'; userData: Record<string, any> }[] = [];

    // Prepare Ahrefs URL.
    const ahrefsUrl = `https://ahrefs.com/websites/${country.toLowerCase()}/news`;
    startUrls.push({ url: ahrefsUrl, label: 'ahrefs', userData: { country } });
    await logInfo(`Prepared Ahrefs URL: ${ahrefsUrl}`);

    // Prepare SimilarWeb URL.
    const similarWebUrl = `https://www.similarweb.com/top-websites/${country.toLowerCase()}/news-and-media/`;
    startUrls.push({ url: similarWebUrl, label: 'similarweb', userData: { country } });
    await logInfo(`Prepared SimilarWeb URL: ${similarWebUrl}`);

    // Prepare Google Search URLs.
    for (const languageName of countryData.languages) {
      const query = `${SEARCH_KEYWORDS[languageName as keyof typeof SEARCH_KEYWORDS] || 'news'} ${countryData.officialName}`;
      const languageCode = LANGUAGE_CODES[languageName as keyof typeof LANGUAGE_CODES] || 'en';
      const gl = countryData.cca2.toLowerCase();
      const cr = `country${countryData.cca2.toUpperCase()}`;

      for (let page = 0; page < GOOGLE_PAGES_TO_CRAWL; page++) {
        const start = page * 10;
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}&hl=${languageCode}&gl=${gl}&cr=${cr}&num=10`;
        startUrls.push({
          url: googleUrl,
          label: 'google',
          userData: { country, query, languageName, page: page + 1, searchUrl: googleUrl },
        });
        await logInfo(`Prepared Google URL (Lang: ${languageName}, Page: ${page + 1}): ${googleUrl}`);
      }
    }

    // Configure and run PlaywrightCrawler.
    const crawler = new PlaywrightCrawler({
      requestHandlerTimeoutSecs: GENERAL_TIMEOUT / 1000 + 10,
      navigationTimeoutSecs: GENERAL_TIMEOUT / 1000,
      async requestHandler({ request, page, log }) {
        log.info(`Processing ${request.label}: ${request.url}`);

        if (request.label === 'google' || request.label === 'similarweb') {
          await handleConsentPopups(page, log);
        }

        // --- AHREFS Logic ---
        if (request.label === 'ahrefs') {
          try {
            // Use updated selectors to match the new table markup.
            const rowSelector = 'div.css-1eo1mva-scrollableTable table > tbody > tr';
            await page.waitForSelector(rowSelector, { timeout: GENERAL_TIMEOUT });
            const records = await page.$$eval(rowSelector, (rows, args) => {
              const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
              rows.forEach((row) => {
                // Get rank from the first cell.
                const rankText = row.querySelector('td:nth-child(1)')?.textContent?.trim();
                // Get domain from the link inside the third cell.
                const domainElement = row.querySelector('td:nth-child(3) a');
                const domain = domainElement?.textContent?.trim();
                const rank = parseInt(rankText || '', 10);
                if (!isNaN(rank) && domain) {
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

            records.forEach(record => {
              if (record.rank !== null) {
                const existing = aggregatedResultsMap.get(record.domain);
                // Prefer lower rank if domain was added by another source.
                if (!existing || existing.source === 'google' || record.rank < existing.rank) {
                  aggregatedResultsMap.set(record.domain, { ...record, rank: record.rank as number, source: 'ahrefs' });
                }
              }
            });
            log.info(`Processed ${records.length} records from Ahrefs: ${request.url}`);
          } catch (error) {
            log.warning(`Failed to scrape Ahrefs page ${request.url}: ${error instanceof Error ? error.message : error}`);
          }
        }

        // --- SIMILARWEB Logic ---
        else if (request.label === 'similarweb') {
          const expectedPath = `/top-websites/${request.userData.country.toLowerCase()}/news-and-media`;
          const currentUrl = page.url();
          if (!currentUrl.includes(expectedPath)) {
            log.warning(`Redirected or wrong page on SimilarWeb? Expected path "${expectedPath}" not in current URL "${currentUrl}". Skipping scrape.`);
            return;
          }
          try {
            const tableSelector = 'table.top-table__content';
            const tableBodySelector = `${tableSelector} tbody.top-table__body`;
            const rowSelector = `${tableBodySelector} tr.top-table__row`;
            await page.waitForSelector(tableSelector, { state: 'visible', timeout: GENERAL_TIMEOUT });
            await page.waitForSelector(rowSelector, { state: 'visible', timeout: 15000 });
            const records = await page.$$eval(rowSelector, (rows, args) => {
              const results: (Omit<RawNewsRecord, 'source' | 'rank'> & { rank: number | null })[] = [];
              rows.forEach(row => {
                const rankText = row.querySelector('td.top-table__column--rank span.tw-table__rank')?.textContent?.trim();
                const domain = row.querySelector('td.top-table__column--website span.tw-table__domain')?.textContent?.trim();
                const rank = parseInt(rankText || '', 10);
                if (!isNaN(rank) && domain) {
                  results.push({
                    rank,
                    domain,
                    faviconUrl: `https://icons.duckduckgo.com/ip3/${domain}.ico`,
                    additionalInfo: { searchUrl: args.searchUrl }
                  });
                }
              });
              return results;
            }, { searchUrl: request.url });

            records.forEach(record => {
              if (record.rank !== null) {
                const existing = aggregatedResultsMap.get(record.domain);
                if (!existing || existing.source === 'google' || record.rank < existing.rank) {
                  aggregatedResultsMap.set(record.domain, { ...record, rank: record.rank as number, source: 'similarweb' });
                }
              }
            });
            log.info(`Processed ${records.length} records from SimilarWeb: ${request.url}`);
          } catch (error) {
            log.warning(`Failed to scrape SimilarWeb page ${request.url}: ${error instanceof Error ? error.message : error}`);
          }
        }

        // --- GOOGLE Logic using Cheerio ---
        else if (request.label === 'google') {
          try {
            await page.waitForSelector('div#search', { timeout: GENERAL_TIMEOUT });
            const html = await page.content();
            const $ = cheerio.load(html);
            const items = $('div#search div#rso div[data-hveid][lang]');
            items.each((_, element) => {
              try {
                const url = $(element).find('a').attr('href')?.trim();
                if (!url) return;
                const domain = extractDomain(url);
                if (domain && !aggregatedResultsMap.has(domain)) {
                  aggregatedResultsMap.set(domain, {
                    rank: googleRankCounter,
                    domain,
                    faviconUrl: getFaviconUrl(domain),
                    source: 'google',
                    additionalInfo: { searchUrl: request.userData.searchUrl }
                  });
                  googleRankCounter++;
                }
              } catch (err) {
                log.warning(`Error processing Google search item: ${err instanceof Error ? err.message : err}`);
              }
            });
            log.info(`Processed Google search results: aggregated ${aggregatedResultsMap.size} unique domains so far from ${request.url}`);
          } catch (error) {
            log.warning(`Failed to scrape Google page ${request.url}: ${error instanceof Error ? error.message : error}`);
          }
        }
      },

      // --- Failed Request Handler ---
      failedRequestHandler({ request, log }, error) {
        log.error(`Request failed for ${request.label}: ${request.url} - Error: ${error?.message}`);
      },
    });

    // 4. Start the Crawl.
    await logInfo(`Starting crawler with ${startUrls.length} initial requests...`);
    const requests: Request[] = startUrls.map((req) =>
      new Request({ url: req.url, label: req.label, userData: req.userData })
    );
    await crawler.run(requests);
    await logInfo("Crawler finished.");

    // 5. Group Records by Source and Save Results.
    const groupedResults: SourceGroupedNewsData = {};
    aggregatedResultsMap.forEach((rawRecord) => {
      // Remove the source property from the record in the final output.
      const { source, ...recordWithoutSource } = rawRecord;
      if (!groupedResults[source]) {
        groupedResults[source] = [];
      }
      groupedResults[source]?.push(recordWithoutSource);
    });

    countryNews.records = groupedResults;

    const dataDir = path.join(process.cwd(), NEWS_DATA_DIR);
    await fs.mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, `${country}.json`);
    await fs.writeFile(filePath, JSON.stringify(countryNews, null, 2), 'utf-8');
    await logInfo(`Saved news data for "${country}" with grouped sources to ${filePath}.`);

    return countryNews;
  } catch (error) {
    await logError(`Critical error in getCountryNews for "${country}" in language "${language}": ${error instanceof Error ? error.message : error}`);
    return countryNews;
  }
}