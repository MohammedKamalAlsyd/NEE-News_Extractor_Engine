import { getCountryNews } from './utils/getCountryNews.js';
import { logInfo, logError } from './utils/logger.js';

(async () => {
  try {
    // Example: Fetch and log news data for Albania.
    const countryNews = await getCountryNews('albania', 'albanians');
    await logInfo(`Aggregated news for ${countryNews.country}: ${JSON.stringify(countryNews.records)}`);
  } catch (error) {
    await logError(`Error in main: ${error}`);
  }
})();
