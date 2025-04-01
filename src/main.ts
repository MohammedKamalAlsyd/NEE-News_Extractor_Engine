import { getCountryNews } from './utils/getCountryNews.js';
import { logInfo, logError } from './utils/logger.js';
import { getCountriesData } from './utils/getCountriesData.js';

/**
 * Main application entry point.
 */
(async () => {
  try {
    await getCountriesData(); // Pre-fetch country data
    const language = 'eng';
    const country = 'Albania';
    const countryNews = await getCountryNews(language, country);
    await logInfo(`Aggregated news for ${countryNews.country}: ${JSON.stringify(countryNews.records)}`);
  } catch (error) {
    await logError(`Error in main: ${error}`);
  }
})();