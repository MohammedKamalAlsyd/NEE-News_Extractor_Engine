import { PlaywrightCrawler } from 'crawlee';
import { router } from '../routes.js';
import { logInfo, logError } from './logger.js';
import { COUNTRY_COMMON_NAMES } from '../meta/constants.js'; // Assuming this exists

export async function getAllCountriesNewsWebsites(): Promise<void> {
  await logInfo('Starting to fetch news websites for all countries');

  const crawler = new PlaywrightCrawler({
    requestHandler: router,
    maxRequestsPerCrawl: 1000, // Adjust as needed
    navigationTimeoutSecs: 60,
  });

  for (const country of COUNTRY_COMMON_NAMES) {
    try {
      const searchQuery = `news ${country}`;
      const sources = [
        { label: 'GOOGLE', url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}` },
        { label: 'BING', url: `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}` },
        { label: 'DUCKDUCKGO', url: `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}` },
        // Add more sources as needed
      ];

      for (const source of sources) {
        await crawler.addRequests([{
          url: source.url,
          label: source.label,
          userData: {
            datasetName: `news-websites-${country.toLowerCase()}`,
            searchUrl: source.url,
            country,
          },
        }]);
        await logInfo(`Enqueued ${source.label} search for ${country}: ${source.url}`);
      }
    } catch (error) {
      await logError(`Failed to enqueue requests for country ${country}: ${(error as Error).message}`);
    }
  }

  await crawler.run();
  await logInfo('Finished fetching news websites for all countries');
}