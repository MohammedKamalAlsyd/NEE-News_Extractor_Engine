import fs from 'fs/promises';
import path from 'path';
import { COUNTRIES_DATA_DIR } from './constants.js';
import { logInfo, logError } from './logger.js';
import { ProcessedCountry } from './getCountriesData.js';

export async function getCountryData(languageCode: string, countryCommonName: string): Promise<ProcessedCountry | null> {
  const dataDir = path.join(process.cwd(), COUNTRIES_DATA_DIR);
  const filePath = path.join(dataDir, `${languageCode.toLowerCase()}.json`);

  try {
    // Check if the language file exists
    await fs.access(filePath);

    const content = await fs.readFile(filePath, 'utf-8');
    const countriesData: Record<string, ProcessedCountry> = JSON.parse(content);

    // Directly try to access the country using the provided countryCode
    const country = countriesData[countryCommonName];

    if (country) {
      logInfo(`Found country with code '${countryCommonName}' in '${languageCode}' localization.`);
      return country;
    } else {
      logInfo(`Country with code '${countryCommonName}' not found in '${languageCode}' localization.`);
      return null;
    }

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Language file not found, provide a descriptive error with available localizations
      try {
        const files = await fs.readdir(dataDir);
        const availableLocalizations = files
          .filter(file => file.endsWith('.json'))
          .map(file => file.replace('.json', ''));
        logError(
          `Language localization '${languageCode}' not found. Available localizations are: ${JSON.stringify(
            availableLocalizations,
          )}`,
        );
        return null;
      } catch (readDirError) {
        logError(`Error reading localization directory: ${readDirError}`);
        return null;
      }
    } else {
      logError(`Error accessing or reading localization file for '${languageCode}': ${error}`);
      return null;
    }
  }
}