import fs from 'fs/promises';
import path from 'path';
import {
    PlaywrightCrawler,
    Dataset,
    log as crawleeLog,
    LogLevel,
    Configuration, // Import Configuration for proxy settings
    ProxyConfiguration
} from 'crawlee';
import { logInfo, logError, logWarning } from './logger.js'; // Adjusted import path
import { NEWS_DATA_DIR, SEARCH_KEYWORDS, LANGUAGE_CODES } from '../meta/constants.js'; // Adjusted import path
import { getCountryData } from './getCountryData.js'; // Adjusted import path
import { loadConfig, Config } from '../../src/config/config.js'; // Adjusted import path
import { router } from '../routes.js'; // Adjusted import path

// Configuration constants
const GOOGLE_PAGES_TO_CRAWL = 2; // Keep for Google if needed, or make dynamic per engine
const BING_PAGES_TO_CRAWL = 2;
const BRAVE_PAGES_TO_CRAWL = 2;
const ECOSIA_PAGES_TO_CRAWL = 2;
const DUCKDUCKGO_PAGES_TO_CRAWL = 1; // HTML version often less useful for deep pagination

// Type definitions
export interface RawNewsRecord {
    rank: number;
    domain: string;
    faviconUrl?: string;
    additionalInfo?: { searchUrl: string };
    source: 'AHREFS' | 'SIMILARWEB' | 'GOOGLE' | 'BING' | 'DUCKDUCKGO' | 'BRAVE' | 'ECOSIA'; // Added new sources
}

// NewsRecord remains the same (output format)
export interface NewsRecord {
    rank: number;
    domain: string;
    faviconUrl?: string;
    additionalInfo?: { searchUrl: string };
}

// SourceGroupedNewsData updated to include new sources potentially
export interface SourceGroupedNewsData {
    AHREFS?: NewsRecord[];
    SIMILARWEB?: NewsRecord[];
    GOOGLE?: NewsRecord[];
    BING?: NewsRecord[];
    DUCKDUCKGO?: NewsRecord[];
    BRAVE?: NewsRecord[];
    ECOSIA?: NewsRecord[];
}

// CountryNewsData remains the same
export interface CountryNewsData {
    country: string;
    records: SourceGroupedNewsData;
}

crawleeLog.setLevel(LogLevel.INFO); // Keep logging level INFO or adjust as needed

/**
 * Generates the search URL for the configured search engine.
 */
function getSearchUrl(
    config: Config,
    countryData: Awaited<ReturnType<typeof getCountryData>>,
    languageName: string,
    page: number // 0-based index for most engines, 1-based for Bing
): string | null {
    const query = `${SEARCH_KEYWORDS[languageName as keyof typeof SEARCH_KEYWORDS] || 'news'} ${countryData.officialName}`;
    let targetLangCode = config.targetLanguage === 'auto'
        ? LANGUAGE_CODES[languageName as keyof typeof LANGUAGE_CODES]
        : config.targetLanguage;
    if (!targetLangCode) {
        logWarning(`Could not find language code for ${languageName}, defaulting to 'en'`);
        targetLangCode = 'en';
    }
    const countryCode = countryData.cca2.toLowerCase(); // e.g., 'us'
    const countryParam = `country${countryData.cca2.toUpperCase()}`; // e.g., 'countryUS'

    switch (config.searchEngine) {
        case 'google':
            const start = page * 10;
            return `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}&hl=${targetLangCode}&gl=${countryCode}&cr=${countryParam}&num=10`;
        case 'bing':
            const first = page * 10 + 1; // Bing uses 1-based index for 'first'
            const bingMarket = `${targetLangCode}-${countryCode.toUpperCase()}`; // e.g., en-US
              return `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&mkt=${bingMarket}`; // Using market might be more reliable
        case 'duckduckgo':
             if (page > 0) return null; // Only crawl first page for DDG HTML
             const ddgRegion = `${countryCode}-${targetLangCode}`; // e.g., us-en
             return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${ddgRegion}`;
        case 'brave':
             const offset = page * 10; // Brave uses 'offset'
             return `https://search.brave.com/search?q=${encodeURIComponent(query)}&offset=${offset}&country=${countryCode.toUpperCase()}&lang=${targetLangCode}`;
        case 'ecosia':
            const p = page; // Ecosia uses 'p' for page index (0-based)
            return `https://www.ecosia.org/search?q=${encodeURIComponent(query)}&p=${p}&hl=${targetLangCode}&gl=${countryCode}`;
        default:
            logError(`Unsupported search engine configured: ${config.searchEngine}`);
            return null;
    }
}

/**
 * Fetches news data for a country using Crawlee with a router.
 * @param language - The language for the news search (used if targetLanguage='auto').
 * @param country - The country name or code.
 * @returns The aggregated news data.
 */
export async function getCountryNews(language: string, country: string): Promise<CountryNewsData> {
    let config: Config;
    try {
        config = await loadConfig();
    } catch (error) {
        await logError(`Failed to load configuration: ${error instanceof Error ? error.message : error}`);
        return { country, records: {} }; // Cannot proceed without config
    }

    const countryNews: CountryNewsData = { country, records: {} };
    // *** Calculate dataset name here to pass it to handlers ***
    const datasetName = `news-${country.toLowerCase().replace(/[^a-z0-9]/gi, '-')}`; // Sanitize name
    const dataset = await Dataset.open(datasetName); // Open the specific dataset

    try {
        const countryData = await getCountryData(language, country); // Use initial language param here
        if (!countryData) {
            await logError(`Could not retrieve country data for "${country}" with language hint "${language}".`);
            return countryNews; // Return empty if country data fails
        }
        await logInfo(`Starting news data fetch for ${countryData.officialName} (${country}) using ${config.searchEngine}. Target Dataset: ${datasetName}`);

        // *** Use Record<string, any> for userData initially, then refine if needed ***
        const startUrls: { url: string; label: RawNewsRecord['source']; userData: Record<string, any> }[] = [];
        let searchRankCounter = 1; // Initialize rank counter for search results

        // Add Ahrefs URL if enabled
        if (config.useAhrefs) {
            const ahrefsUrl = `https://ahrefs.com/websites/${country.toLowerCase()}/news`;
            startUrls.push({
                 url: ahrefsUrl,
                 label: 'AHREFS',
                 userData: { country, datasetName: datasetName, searchUrl: ahrefsUrl }
                });
            await logInfo(`Prepared AHREFS URL: ${ahrefsUrl}`);
        } else {
            await logInfo(`Skipping AHREFS based on configuration.`);
        }

        // Add SimilarWeb URL if enabled
        if (config.useSimilarWeb) {
            const similarWebUrl = `https://www.similarweb.com/top-websites/${country.toLowerCase()}/news-and-media/`;
            startUrls.push({
                url: similarWebUrl,
                label: 'SIMILARWEB',
                userData: { country, datasetName: datasetName, searchUrl: similarWebUrl }
            });
            await logInfo(`Prepared SIMILARWEB URL: ${similarWebUrl}`);
        } else {
               await logInfo(`Skipping SIMILARWEB based on configuration.`);
        }

        // Add Search Engine URLs
        const languagesToSearch = config.targetLanguage === 'auto'
                                    ? countryData.languages
                                    : [config.targetLanguage]; // Use specific language or country's languages

        let pagesToCrawl = 0;
        switch (config.searchEngine) {
            case 'google': pagesToCrawl = GOOGLE_PAGES_TO_CRAWL; break;
            case 'bing': pagesToCrawl = BING_PAGES_TO_CRAWL; break;
            case 'duckduckgo': pagesToCrawl = DUCKDUCKGO_PAGES_TO_CRAWL; break;
            case 'brave': pagesToCrawl = BRAVE_PAGES_TO_CRAWL; break;
            case 'ecosia': pagesToCrawl = ECOSIA_PAGES_TO_CRAWL; break;
        }

        for (const langName of languagesToSearch) {
            const langCode = LANGUAGE_CODES[langName as keyof typeof LANGUAGE_CODES] || langName; // Use code if available
            if (!langCode) {
                await logWarning(`Skipping search for language "${langName}" as no code mapping exists.`);
                continue;
            }

            for (let page = 0; page < pagesToCrawl; page++) {
                const searchUrl = getSearchUrl(config, countryData, langName, page);
                if (searchUrl) {
                    startUrls.push({
                        url: searchUrl,
                        label: config.searchEngine.toUpperCase() as RawNewsRecord['source'], // e.g., GOOGLE, BING
                        userData: {
                            country: countryData.cca2, // Pass country code
                            languageName: langName,
                            languageCode: langCode,
                            page: page + 1,
                            searchUrl: searchUrl, // Pass the generated URL for context
                            startRank: searchRankCounter, // Pass the starting rank for this page
                            datasetName: datasetName
                        },
                    });
                    await logInfo(`Prepared ${config.searchEngine.toUpperCase()} URL (Lang: ${langName}, Page: ${page + 1}): ${searchUrl}`);
                    // Note: searchRankCounter update happens within the handler now to be per-page accurate
                } else if (page === 0) {
                    await logWarning(`Could not generate ${config.searchEngine.toUpperCase()} URL for Lang: ${langName}, Page: ${page + 1}`);
                }
            }
            // Reset rank counter for the next language if targetLanguage is 'auto'
            // If targetLanguage is specific, the loop runs only once anyway.
            if (config.targetLanguage === 'auto') {
                searchRankCounter = 1; // Reset for next language
            }
        }

        // Configure Proxy if enabled
        let proxyConfiguration: ProxyConfiguration | undefined = undefined;
        if (config.proxyConfig?.enabled && config.proxyConfig.apiUrl) {
            try {
                proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [config.proxyConfig.apiUrl] // Basic usage, assumes direct proxy URL
                });
                await logInfo(`Proxy configuration enabled using URL from config.`);
            } catch (proxyError) {
                await logError(`Failed to create ProxyConfiguration: ${proxyError instanceof Error ? proxyError.message : proxyError}. Continuing without proxy.`);
            }
        } else {
            await logInfo(`Proxy is disabled or not configured.`);
        }


        // Configure Crawler
        const crawler = new PlaywrightCrawler({
            requestHandler: router,
            requestHandlerTimeoutSecs: (config.timeout / 1000) + 10, // Add buffer
            navigationTimeoutSecs: config.timeout / 1000,
            maxConcurrency: config.workerNodes,
            maxRequestsPerCrawl: startUrls.length + 5, // Safety margin
            proxyConfiguration: proxyConfiguration, // Add proxy config here
            launchContext: {
                launchOptions: {
                    headless: false, // Changed to true for typical server use, set to false for debugging
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], // Common args for CI/Docker
                },
            },
             // Error handling for crawler-level issues
            failedRequestHandler: async ({ request, log }) => {
                 log.error(`Request failed to process navigation or reached max retries: ${request.url}`);
             },
        });

        if (startUrls.length === 0) {
            await logWarning("No URLs to crawl based on current configuration. Exiting crawl.");
        } else {
            await logInfo(`Starting crawler with ${startUrls.length} requests across ${config.workerNodes} workers...`);
            await crawler.run(startUrls);
            await logInfo('Crawler finished processing all reachable URLs.');
        }

        // --- Aggregation Logic ---
        // Now read from the *same named dataset* that the handlers should have pushed to.
        await logInfo(`Aggregating results from dataset "${datasetName}"...`);
        // *** Use the dataset instance opened earlier ***
        const scrapedData = await dataset.getData();
        console.log('--- Scraped Data Structure ---');
        console.log(scrapedData); // Check structure: { items: [], total: X, ... }
        console.log('------------------------------');


        // Ensure scrapedData and scrapedData.items exist before processing
        if (!scrapedData || !Array.isArray(scrapedData.items)) {
             await logError(`Failed to retrieve valid items from dataset "${datasetName}". Found: ${JSON.stringify(scrapedData)}`);
             return countryNews; // Cannot proceed if items are not an array
        }

        const allItems = scrapedData.items as RawNewsRecord[]; // Cast items

        await logInfo(`Retrieved ${allItems.length} raw items from dataset "${datasetName}". Starting aggregation...`);

        // Use a Map to keep the best rank per domain (prefer non-search engine ranks if equal)
        const aggregatedResultsMap = new Map<string, RawNewsRecord>();

        allItems.forEach((item: RawNewsRecord) => {
            // *** Add more robust check for item validity ***
            if (!item || typeof item !== 'object' || !item.domain || typeof item.rank !== 'number' || isNaN(item.rank) || !item.source) {
                logWarning(`Skipping invalid item found in dataset: ${JSON.stringify(item)}`);
                return;
            }

            const existing = aggregatedResultsMap.get(item.domain);
            if (!existing) {
                aggregatedResultsMap.set(item.domain, item); // Add if new
            } else {
                // Update logic: Prefer lower rank. If ranks are equal, prefer AHREFS/SIMILARWEB over search engines.
                const isExistingRankedSource = existing.source === 'AHREFS' || existing.source === 'SIMILARWEB';
                const isItemRankedSource = item.source === 'AHREFS' || item.source === 'SIMILARWEB';

                if (item.rank < existing.rank) {
                    aggregatedResultsMap.set(item.domain, item); // Update if new rank is better
                } else if (item.rank === existing.rank) {
                    // If ranks are equal, prioritize dedicated sources over search results
                    if (!isExistingRankedSource && isItemRankedSource) {
                        aggregatedResultsMap.set(item.domain, item); // Replace search result with Ahrefs/Similarweb if same rank
                    }
                    // Otherwise, keep the existing one
                }
            }
        });

        // Group the aggregated results by source
        const groupedResults: SourceGroupedNewsData = {};
        aggregatedResultsMap.forEach(rawRecord => {
            const { source, ...recordWithoutSource } = rawRecord;
            if (!groupedResults[source]) {
                   groupedResults[source] = [];
            }
            // Ensure rank is a number before pushing (redundant due to earlier check, but safe)
            if (typeof recordWithoutSource.rank === 'number' && !isNaN(recordWithoutSource.rank)) {
                groupedResults[source]?.push(recordWithoutSource);
            } else {
                 logWarning(`Skipping record during grouping for domain ${recordWithoutSource.domain} due to invalid rank: ${recordWithoutSource.rank}`);
            }
        });

        // Sort each group by rank
        for (const sourceKey in groupedResults) {
            const key = sourceKey as keyof SourceGroupedNewsData;
            groupedResults[key]?.sort((a, b) => a.rank - b.rank);
        }

        countryNews.records = groupedResults;

        // Save the final aggregated data
        const dataDir = path.join(process.cwd(), NEWS_DATA_DIR);
        await fs.mkdir(dataDir, { recursive: true });
        const filePath = path.join(dataDir, `${country}.json`);
        await fs.writeFile(filePath, JSON.stringify(countryNews, null, 2), 'utf-8');
        await logInfo(`Saved aggregated news data for "${country}" to ${filePath}. Found ${aggregatedResultsMap.size} unique domains.`);

        return countryNews;

    } catch (error) {
        // Catch critical errors during setup or final aggregation/saving
        await logError(`CRITICAL error during getCountryNews execution for "${country}": ${error instanceof Error ? error.message : error}${error instanceof Error ? '\n' + error.stack : ''}`);
        // Return whatever might have been partially collected, or empty if error was early
        return countryNews;
    } finally {
         // Optional: Clean up dataset? Depends if you want to keep raw data.
         // Consider adding a config flag for this
         // try {
         //    await dataset.drop();
         //    await logInfo(`Dropped dataset "${datasetName}".`);
         // } catch (dropError) {
         //    await logError(`Failed to drop dataset "${datasetName}": ${dropError instanceof Error ? dropError.message : dropError}`);
         // }
    }
}