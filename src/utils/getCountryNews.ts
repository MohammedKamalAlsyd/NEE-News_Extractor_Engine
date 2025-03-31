import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import { logInfo, logError } from './logger.js'; // Assuming logger exists
import { NEWS_DATA_DIR } from './constants.js'; // Assuming constants exist

// Mock logger functions if they don't exist for testing
// const logInfo = async (msg: string) => console.log(`INFO: ${msg}`);
// const logError = async (msg: string) => console.error(`ERROR: ${msg}`);
// const NEWS_DATA_DIR = 'data/news'; // Example constant

/**
 * Represents a news record scraped from a source.
 */
export interface NewsRecord {
  rank: number;
  domain: string;
  additionalInfo?: string;
  source: 'ahrefs' | 'similarweb' | 'google';
}

/**
 * Aggregated news data for a country.
 */
export interface CountryNewsData {
  country: string;
  records: NewsRecord[];
}

/**
 * Fetch news records from Ahrefs.
 * Navigates to "https://ahrefs.com/websites/{country}/news" and extracts table rows, ensuring uniqueness.
 * @param country - The country identifier (e.g. "albania").
 * @returns An array of unique news records from Ahrefs.
 */
async function fetchAhrefsNews(country: string): Promise<NewsRecord[]> {
  // The URL structure for Ahrefs top news sites by country
  const url = `https://ahrefs.com/websites/${country}/news`;
  try {
    await logInfo(`Workspaceing Ahrefs news from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Ahrefs news: ${response.statusText} (Status: ${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Use a Map to store records, keyed by domain, to automatically handle duplicates.
    // We keep the first record encountered for each domain.
    const recordsMap = new Map<string, NewsRecord>();

    // Selector targeting the table body rows. Based on the provided HTML snippet and general structure.
    // Using 'tbody tr' is generally robust, but inspect the specific page if issues persist.
    const tableBodySelector = 'tbody'; // Or potentially a more specific selector if needed e.g., 'table.css-e8l0hj-table > tbody'
    const tableRowsSelector = `${tableBodySelector} tr`;

    $(tableRowsSelector).each((_, elem) => {
      const row = $(elem);
      
      // Extract data using column indices (td elements)
      const rankText = row.find('td').eq(0).text().trim();
      const rank = parseInt(rankText, 10);
      
      // Domain is typically in the third <td> within an <a> tag
      const domainElement = row.find('td').eq(2).find('a');
      const domain = domainElement.text().trim();
      
      // Traffic is typically in the fifth <td>
      const traffic = row.find('td').eq(4).text().trim();
      
      // Change is typically in the sixth <td>, possibly inside a <span>
      const change = row.find('td').eq(5).text().trim();
      
      // Construct additionalInfo only if both traffic and change have values
      // Check for non-empty strings, adjust if '0' or specific placeholders are valid
      const additionalInfo = (traffic && change) ? `Traffic: ${traffic}, Change: ${change}` : undefined;

      // Validate extracted data - we need at least a valid rank and domain.
      // Check if rank is a number (not NaN) and domain is not empty.
      if (!isNaN(rank) && domain) {
        // Only add the record if this domain hasn't been added yet.
        // This prevents duplicates caused by potentially multiple `tr` elements for the same logical entry.
        if (!recordsMap.has(domain)) {
           const record: NewsRecord = {
            rank,
            domain,
            source: 'ahrefs'
           };
           // Add additionalInfo only if it was successfully created
           if (additionalInfo) {
                record.additionalInfo = additionalInfo;
           }
          recordsMap.set(domain, record);
        } else {
          // Optional: Log if a duplicate domain is found, might help in debugging selectors
          // await logInfo(`Duplicate domain found and skipped: ${domain}`);
        }
      } else {
         // Optional: Log if a row was skipped due to missing rank or domain
         // await logInfo(`Skipping row: Invalid rank ('${rankText}') or domain ('${domain}')`);
      }
    });

    // Convert the Map values back into an array of records
    const uniqueRecords = Array.from(recordsMap.values());
    
    // Sort records by rank as the map iteration order isn't guaranteed
    uniqueRecords.sort((a, b) => a.rank - b.rank);

    await logInfo(`Workspaceed ${uniqueRecords.length} unique records from Ahrefs.`);
    return uniqueRecords;
  } catch (error) {
    await logError(`Error fetching Ahrefs news for ${country}: ${error}`);
    return []; // Return empty array on error
  }
}


/**
 * Fetch news records from SimilarWeb.
 * Navigates to "https://www.similarweb.com/top-websites/{country}/news-and-media/" and extracts table rows.
 * @param country - The country identifier (e.g. "egypt").
 * @returns An array of news records from SimilarWeb.
 */
async function fetchSimilarWebNews(country: string): Promise<NewsRecord[]> {
  const url = `https://www.similarweb.com/top-websites/${country}/news-and-media/`;
  try {
    await logInfo(`Workspaceing SimilarWeb news from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      // SimilarWeb often blocks simple fetches, might need better headers or alternative methods
      throw new Error(`Failed to fetch SimilarWeb news: ${response.statusText} (Status: ${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const records: NewsRecord[] = [];
    const recordsMap = new Map<string, NewsRecord>(); // Use map for potential duplicates here too

    // Selector based on typical SimilarWeb structure (inspect target page for accuracy)
    $('div.sw-table__body .sw-table__row').each((_, elem) => { // Adjusted selector based on common patterns
        const rankText = $(elem).find('.sw-table__cell--rank').text().trim();
        const rank = parseInt(rankText, 10);
        const domain = $(elem).find('.sw-table__cell--website a.sw-link--domain').text().trim(); // More specific selector

        if (!isNaN(rank) && domain) {
          if (!recordsMap.has(domain)) {
             recordsMap.set(domain, {
               rank,
               domain,
               source: 'similarweb'
             });
          }
        }
    });

    const uniqueRecords = Array.from(recordsMap.values());
    uniqueRecords.sort((a, b) => a.rank - b.rank); // Sort by rank

    await logInfo(`Workspaceed ${uniqueRecords.length} records from SimilarWeb.`);
    return uniqueRecords;
  } catch (error) {
    await logError(`Error fetching SimilarWeb news for ${country}: ${error}`);
    return [];
  }
}

/**
 * Fetch news records from Google search.
 * Searches for the term "news" in the given local language context.
 * @param countryLanguage - The local language term or keyword for the search (e.g. "albane" or "egyptian").
 * @returns An array of news records extracted from Google search results.
 */
async function fetchGoogleNews(countryLanguage: string): Promise<NewsRecord[]> {
  // Construct the query with the country language term.
  const query = `news ${countryLanguage}`;
  // Note: Google scraping is highly unreliable and might require more sophisticated methods (APIs, Puppeteer)
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  try {
    await logInfo(`Workspaceing Google news search results for query: ${query}`);
    const response = await fetch(url, {
      headers: {
        // Using a standard User-Agent can help, but Google often detects scraping attempts
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        // Additional headers might be needed depending on Google's current blocking mechanisms
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Google search results: ${response.statusText} (Status: ${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    const recordsMap = new Map<string, NewsRecord>(); // Use map for potential duplicates
    let currentRank = 1;

    // Attempt to extract search results. Google's selectors change frequently.
    // This targets common structures for organic results. Inspect Google's HTML for current selectors.
    $('div[data-sokoban-container]').each((_, elem) => { // A potentially more stable container selector
        const linkElement = $(elem).find('a[href]');
        const link = linkElement.attr('href');

        // Basic validation for links
        if (link && (link.startsWith('http://') || link.startsWith('https://'))) {
            try {
              const urlObj = new URL(link);
              // Clean the domain (remove www.)
              const domain = urlObj.hostname.replace(/^www\./, '');

              // Ensure domain is not empty and not google.com itself or related subdomains
               if (domain && !domain.includes('google.com') && !domain.includes('google.co')) {
                   if (!recordsMap.has(domain)) {
                       recordsMap.set(domain, {
                           rank: currentRank++, // Assign rank based on order found
                           domain,
                           source: 'google'
                       });
                   }
               }
            } catch (err) {
              // Log invalid URLs if needed
              // await logError(`Skipping invalid URL found in Google search: ${link} - ${err}`);
            }
        }
    });

    const uniqueRecords = Array.from(recordsMap.values());
    // No need to sort by rank here as we assigned it sequentially

    await logInfo(`Workspaceed ${uniqueRecords.length} records from Google search.`);
    return uniqueRecords;
  } catch (error) {
    await logError(`Error fetching Google news for "${countryLanguage}": ${error}`);
    return [];
  }
}


/**
 * Retrieves and aggregates news data for a given country.
 * It fetches news records from Ahrefs, SimilarWeb, and Google search,
 * aggregates them (including the source of each record), ensuring uniqueness *within each source*,
 * saves the result to disk in JSON format, and returns the aggregated data.
 *
 * @param country - The country identifier used in URLs (e.g. "albania", "egypt").
 * @param countryLanguage - The local language or keyword for Google search.
 * @returns Aggregated CountryNewsData.
 */
export async function getCountryNews(country: string, countryLanguage: string): Promise<CountryNewsData> {
  const newsData: CountryNewsData = { country, records: [] };
  try {
    // Ensure the news data directory exists.
    const dataDir = path.join(process.cwd(), NEWS_DATA_DIR);
    await fs.mkdir(dataDir, { recursive: true });

    // Fetch news records from all sources concurrently.
    // Each fetch function now handles its own deduplication.
    const [ahrefsRecords, similarWebRecords, googleRecords] = await Promise.all([
      fetchAhrefsNews(country),
      fetchSimilarWebNews(country),
      fetchGoogleNews(countryLanguage)
    ]);

    // Aggregate the records from all sources.
    // Note: This basic aggregation might still result in the same *domain* appearing
    // multiple times if it's listed by different sources (e.g., Ahrefs and SimilarWeb).
    // Further deduplication *across* sources could be added here if needed,
    // potentially prioritizing one source over another or merging data.
    newsData.records = [...ahrefsRecords, ...similarWebRecords, ...googleRecords];

    // Optional: Implement cross-source deduplication if required
    // For example, keep only the first occurrence of each domain regardless of source:
    /*
    const finalRecordsMap = new Map<string, NewsRecord>();
    for (const record of newsData.records) {
        if (!finalRecordsMap.has(record.domain)) {
            finalRecordsMap.set(record.domain, record);
        }
        // Optional: Logic to merge or prioritize if a domain exists from multiple sources
    }
    newsData.records = Array.from(finalRecordsMap.values());
    // Remember to re-sort if needed, e.g., by rank from a primary source
    */


    // Save aggregated news data to file.
    const filePath = path.join(dataDir, `${country}.json`);
    // Use JSON.stringify with indentation for readability
    await fs.writeFile(filePath, JSON.stringify({ data: newsData }, null, 2), 'utf-8');
    await logInfo(`Saved news data for "${country}" with ${newsData.records.length} records to ${filePath}.`);

  } catch (error) {
    await logError(`Error in getCountryNews for "${country}": ${error}`);
    // Decide if the function should return partial data or throw
    // Returning potentially empty data structure might be safer for callers
    // return newsData;
     throw error; // Re-throw the error if the process should halt
  }
  return newsData;
}
