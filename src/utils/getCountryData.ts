import fs from 'fs/promises';
import path from 'path';
import { COUNTRIES_DATA_DIR } from '../meta/constants.js';
import { logInfo, logError } from './logger.js';
import { ProcessedCountry } from './getCountriesData.js';

/**
 * Retrieves country data for a specific language and common name.
 * @param languageCode - The language code (e.g., 'eng').
 * @param countryCommonName - The common name of the country.
 * @returns The country data or null if not found.
 */
export async function getCountryData(languageCode: string, countryCommonName: string): Promise<ProcessedCountry | null> {
  const dataDir = path.join(process.cwd(), COUNTRIES_DATA_DIR);
  const filePath = path.join(dataDir, `${languageCode.toLowerCase()}.json`);

  try {
    await fs.access(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    const countriesData: Record<string, ProcessedCountry> = JSON.parse(content);
    const country = countriesData[countryCommonName];
    if (country) {
      await logInfo(`Found country '${countryCommonName}' in '${languageCode}' localization.`);
      return country;
    } else {
      await logInfo(`Country '${countryCommonName}' not found in '${languageCode}' localization.`);
      return null;
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      try {
        const files = await fs.readdir(dataDir);
        const availableLocalizations = files
          .filter(file => file.endsWith('.json'))
          .map(file => file.replace('.json', ''));
        await logError(
          `Language localization '${languageCode}' not found. Available localizations: ${JSON.stringify(availableLocalizations)}`,
        );
        return null;
      } catch (readDirError) {
        await logError(`Error reading localization directory: ${readDirError}`);
        return null;
      }
    } else {
      await logError(`Error accessing file for '${languageCode}': ${error}`);
      return null;
    }
  }
}