import { getCountryNews } from './utils/getCountryNews.js';
import { logInfo, logError } from './utils/logger.js';
import { getCountriesData } from './utils/getCountriesData.js';

(async () => {
  try {
    // Example: Fetch and log news data for Albania in English
    await getCountriesData(); // Assuming this is still needed for other purposes
    const language = 'eng';
    const country = 'Albania';
    const countryNews = await getCountryNews(language, country);
    await logInfo(`Aggregated news for ${countryNews.country}: ${JSON.stringify(countryNews.records)}`);
  } catch (error) {
    await logError(`Error in main: ${error}`);
  }
})();