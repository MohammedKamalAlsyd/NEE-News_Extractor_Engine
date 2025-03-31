import { PlaywrightCrawler } from 'crawlee';
import { router } from './routes.js';
import { getCountriesData } from './utils/getCountriesData.js';
import { getCountryPolygons } from './utils/getCountryPolygons.js';
import { logInfo, logError } from './utils/logger.js';

(async () => {
  try {
    await logInfo("=== Application Initialization Started ===");

    // Retrieve and log countries data.
    const countriesData = await getCountriesData();
    for (const lang in countriesData) {
      await logInfo(`Localization '${lang}' has ${countriesData[lang].length} country records.`);
    }

    // Retrieve polygon data in both formats.
    const googlePolygons = await getCountryPolygons('google');
    await logInfo(`Retrieved ${googlePolygons.length} country polygons in Google format.`);
    const leafletPolygons = await getCountryPolygons('leaflet');
    await logInfo(`Retrieved ${leafletPolygons.length} country polygons in Leaflet format.`);

    // Log start of crawler execution (if enabled).
    const startUrls = ['https://crawlee.dev'];
    // Uncomment the following block when ready to start the crawler.
    // const crawler = new PlaywrightCrawler({
    //   requestHandler: router,
    //   maxRequestsPerCrawl: 20,
    //   launchContext: {
    //     launchOptions: {
    //       headless: false,
    //     },
    //   },
    // });
    // await crawler.run(startUrls);
    await logInfo("=== Application Initialization Completed ===");
  } catch (error) {
    await logError(`Error during initialization: ${error}`);
  }
})();
