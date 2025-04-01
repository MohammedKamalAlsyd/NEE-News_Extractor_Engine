import fs from 'fs/promises';
import path from 'path';
import { PlaywrightCrawler, Dataset, log as crawleeLog, LogLevel } from 'crawlee';
import { logInfo, logError } from './logger.js';
import { NEWS_DATA_DIR, SEARCH_KEYWORDS, LANGUAGE_CODES } from './constants.js';
import { getCountryData } from './getCountryData.js';
import { loadConfig } from '../config.js';
import { router } from '../routes.js';

// Configuration constants
const GOOGLE_PAGES_TO_CRAWL = 2;

// Type definitions
export interface RawNewsRecord {
  rank: number;
  domain: string;
  faviconUrl?: string;
  additionalInfo?: { searchUrl: string };
  source: 'AHREFS' | 'SIMILARWEB' | 'GOOGLE';
}

export interface NewsRecord {
  rank: number;
  domain: string;
  faviconUrl?: string;
  additionalInfo?: { searchUrl: string };
}

export interface SourceGroupedNewsData {
  AHREFS?: NewsRecord[];
  SIMILARWEB?: NewsRecord[];
  GOOGLE?: NewsRecord[];
}

export interface CountryNewsData {
  country: string;
  records: SourceGroupedNewsData;
}

crawleeLog.setLevel(LogLevel.INFO);

/**
 * Fetches news data for a country using Crawlee with a router.
 * @param language - The language for the news search.
 * @param country - The country code or name.
 * @returns The aggregated news data.
 */
export async function getCountryNews(language: string, country: string): Promise<CountryNewsData> {
  const config = await loadConfig();
  const countryNews: CountryNewsData = { country, records: {} };
  const dataset = await Dataset.open(`news-${country}`);

  try {
    const countryData = await getCountryData(language, country);
    if (!countryData) {
      return countryNews;
    }
    await logInfo(`Starting news data fetch for ${countryData.officialName} (${country})`);

    const startUrls: { url: string; label: 'AHREFS' | 'SIMILARWEB' | 'GOOGLE'; userData: Record<string, any> }[] = [];

    // Ahrefs URL
    const ahrefsUrl = `https://ahrefs.com/websites/${country.toLowerCase()}/news`;
    startUrls.push({ url: ahrefsUrl, label: 'AHREFS', userData: { country } });
    await logInfo(`Prepared Ahrefs URL: ${ahrefsUrl}`);

    // SimilarWeb URL
    const similarWebUrl = `https://www.similarweb.com/top-websites/${country.toLowerCase()}/news-and-media/`;
    startUrls.push({ url: similarWebUrl, label: 'SIMILARWEB', userData: { country } });
    await logInfo(`Prepared SimilarWeb URL: ${similarWebUrl}`);

    // Google Search URLs
    let googleRankCounter = 1;
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
          label: 'GOOGLE',
          userData: { country, query, languageName, page: page + 1, searchUrl: googleUrl, googleRankCounter },
        });
        await logInfo(`Prepared Google URL (Lang: ${languageName}, Page: ${page + 1}): ${googleUrl}`);
      }
    }

    const crawler = new PlaywrightCrawler({
      requestHandler: router,
      requestHandlerTimeoutSecs: (config.timeout / 1000) + 10,
      navigationTimeoutSecs: config.timeout / 1000,
      maxConcurrency: config.workerNodes,
    });

    await logInfo(`Starting crawler with ${startUrls.length} requests...`);
    await crawler.run(startUrls.map(req => ({ url: req.url, label: req.label, userData: req.userData })));
    await logInfo('Crawler finished.');

    // Aggregate results from the dataset
    const scrapedData = await dataset.getData();
    const aggregatedResultsMap = new Map<string, RawNewsRecord>();

    // Cast scrapedData.items to RawNewsRecord[]
    (scrapedData.items as RawNewsRecord[]).forEach((item: RawNewsRecord) => {
      const existing = aggregatedResultsMap.get(item.domain);
      if (!existing || item.source === 'GOOGLE' || item.rank < existing.rank) {
        aggregatedResultsMap.set(item.domain, item);
      }
    });

    const groupedResults: SourceGroupedNewsData = {};
    aggregatedResultsMap.forEach(rawRecord => {
      const { source, ...recordWithoutSource } = rawRecord;
      if (!groupedResults[source]) groupedResults[source] = [];
      groupedResults[source]?.push(recordWithoutSource);
    });

    countryNews.records = groupedResults;

    const dataDir = path.join(process.cwd(), NEWS_DATA_DIR);
    await fs.mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, `${country}.json`);
    await fs.writeFile(filePath, JSON.stringify(countryNews, null, 2), 'utf-8');
    await logInfo(`Saved news data for "${country}" to ${filePath}.`);

    return countryNews;
  } catch (error) {
    await logError(`Critical error in getCountryNews for "${country}" in "${language}": ${error instanceof Error ? error.message : error}`);
    return countryNews;
  }
}