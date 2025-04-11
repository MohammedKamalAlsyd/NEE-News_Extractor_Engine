// src/main.ts
import { loadConfig } from './config/config.js';
import { logInfo, logError, logWarning } from './core/logger.js';
import {
  getCountriesData,
  getCountryDataByCode,
  getCountryPolygons,
} from './core/utils.js';
import type { AllCountriesData, ProcessedCountry, CountryPolygon, PolygonFormat } from './types.js';

/**
 * @async
 * @function main
 * @description Main function to demonstrate and test utility functions.
 */
async function main() {
  try {
    await logInfo('Starting main execution...');
    const config = await loadConfig(); // Load config, useful for logging setup etc.
    if (!config.enableLogging) {
      console.log("Note: Logging is disabled in config. Some output might be suppressed.");
    }

    // --- Test getCountriesData ---
    await logInfo('Testing getCountriesData...');
    const allCountries: AllCountriesData = await getCountriesData();
    const countryCount = Object.keys(allCountries).length;
    if (countryCount > 0) {
      await logInfo(`Successfully loaded data for ${countryCount} countries.`);
      // console.log('Sample country data (US):', JSON.stringify(allCountries['US'], null, 2)); // Optional: log sample
    } else {
      await logWarning('getCountriesData returned empty data. Check logs for errors.');
      // Optionally stop execution if country data is essential
      // return;
    }

    // --- Test getCountryDataByCode ---
    await logInfo('\nTesting getCountryDataByCode...');
    const testCodes = ['US', 'DE', 'JP', 'XYZ', 'gb']; // Include uppercase, lowercase, and invalid

    for (const code of testCodes) {
      await logInfo(`Attempting to get data for cca2: ${code}`);
      const countryData: ProcessedCountry | null = await getCountryDataByCode(code, allCountries);
      if (countryData) {
        await logInfo(`Found data for ${code}: Common Name (eng): ${countryData.names?.['eng'] || 'N/A'}, (fra): ${countryData.names?.['fra'] || 'N/A'}`);
        // console.log(`Full data for ${code}:`, JSON.stringify(countryData, null, 2)); // Optional: log full data
      } else {
        await logInfo(`No data found for cca2: ${code}.`);
      }
    }

    // --- Test getCountryPolygons ---
    await logInfo('\nTesting getCountryPolygons...');
    const formatsToTest: PolygonFormat[] = ['leaflet', 'google'];

    for (const format of formatsToTest) {
      await logInfo(`Attempting to get polygons in format: ${format}`);
      try {
        const polygons: CountryPolygon[] = await getCountryPolygons(format);
        await logInfo(`Successfully loaded ${polygons.length} country polygons in ${format} format.`);

        // Optional: Log sample polygon structure for a specific country (e.g., US)
        const samplePolygon = polygons.find(p => p.cca2 === 'US');
        if (samplePolygon) {
           // Log coordinates carefully - can be very large!
           // Let's log the type and the first coordinate pair of the first ring of the first polygon part
           let firstCoord: number[] | string = "N/A";
           if (samplePolygon.polygon?.type === 'Polygon' && samplePolygon.polygon.coordinates?.[0]?.[0]) {
               firstCoord = samplePolygon.polygon.coordinates[0][0];
           } else if (samplePolygon.polygon?.type === 'MultiPolygon' && samplePolygon.polygon.coordinates?.[0]?.[0]?.[0]) {
               firstCoord = samplePolygon.polygon.coordinates[0][0][0];
           }
           await logInfo(`Sample polygon for US (${format}): Type=${samplePolygon.polygon?.type}, First coordinate snippet=${JSON.stringify(firstCoord)}`);
        } else {
          await logInfo(`Sample polygon for US not found in ${format} results.`);
        }

      } catch (polyError) {
        await logError(`Failed to get polygons in format ${format}.`, 'main:getCountryPolygons', polyError);
      }
    }

    await logInfo('\nMain execution finished.');

  } catch (error) {
    await logError('An unexpected error occurred in main execution.', 'main', error);
    // Use console.error as a fallback if logger fails
    console.error('Fallback console error:', error);
  }
}

// --- Execute Main Function ---
main();

// Note: Ensure your tsconfig.json allows top-level await or stick to this .then/.catch pattern
// main().catch(err => {
//   console.error("Unhandled error during main execution:", err);
//   process.exit(1);
// });