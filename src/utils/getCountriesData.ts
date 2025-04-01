import fs from 'fs/promises';
import path from 'path';
import { COUNTRIES_API, COUNTRIES_DATA_DIR, EXPECTED_NUMBER_OF_FILES } from './constants.js';
import { logInfo, logError } from './logger.js';

export interface ProcessedCountry {
  cca2: string;
  ccn3: string;
  cca3: string;
  officialName: string;
  unMember: boolean;
  languages: string[];
  currencies: Record<string, { name: string; symbol: string }> | {};
  latlng: number[];
  googleMaps: string;
}

export interface CountriesData {
  [lang: string]: Record<string, ProcessedCountry>;
}

export async function getCountriesData(): Promise<CountriesData> {
  const countriesData: CountriesData = {};
  const dataDir = path.join(process.cwd(), COUNTRIES_DATA_DIR);

  try {
    // Create the data directory if it doesn't exist.
    await fs.mkdir(dataDir, { recursive: true });

    // Helper function to count the number of JSON files in the data directory.
    async function countLocalisationFiles(): Promise<number> {
      try {
        const files = await fs.readdir(dataDir);
        return files.filter(file => file.endsWith('.json')).length;
      } catch (error) {
        // If the directory doesn't exist yet, it will throw an error.
        // In this case, the count is 0.
        return 0;
      }
    }

    const currentFileCount = await countLocalisationFiles();

    // Check if the number of existing files matches the expected number.
    if (currentFileCount === EXPECTED_NUMBER_OF_FILES) {
      logInfo('Local countries data found. Loading from disk...');
      const files = await fs.readdir(dataDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const lang = file.replace('.json', '');
          const filePath = path.join(dataDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          countriesData[lang] = JSON.parse(content);
          logInfo(`Loaded countries data for '${lang}' localization from file.`);
        }
      }
      logInfo('Aggregated all localization files from disk.');
      return countriesData;
    } else {
      logInfo(
        `Expected ${EXPECTED_NUMBER_OF_FILES} localization files, but found ${currentFileCount}. Fetching and updating data...`,
      );
      // Proceed to fetch and overwrite data if the count doesn't match.
    }
  } catch (error) {
    logInfo(`Data directory not found or accessible. Fetching data...`);
    // Proceed to fetch and overwrite data if there's an issue with the directory.
  }

  // Fetch countries data from the API if local data is missing or incomplete.
  logInfo('Fetching countries data from API...');
  try {
    const response = await fetch(COUNTRIES_API);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries data: ${response.statusText}`);
    }
    const countries = await response.json();

    // Clear the existing countriesData object to prepare for new data.
    Object.keys(countriesData).forEach(key => delete countriesData[key]);

    // Process each country record to build the localized data.
    for (const country of countries) {
      const commonName = country.name?.common || 'N/A'
      const defaultRecord: ProcessedCountry = {
        cca2: country.cca2,
        ccn3: country.ccn3 || '',
        cca3: country.cca3 || '',
        officialName: country.name?.official || 'N/A',
        unMember: country.unMember,
        languages: country.languages ? Object.values(country.languages) : [],
        currencies: country.currencies || {},
        latlng: country.latlng || [],
        googleMaps: country.maps?.googleMaps || '',
      };

      // Ensure the 'eng' localization exists and add the default record.
      if (!countriesData['eng']) {
        countriesData['eng'] = {};
      }
      countriesData['eng'][commonName] = defaultRecord;

      // Process translations for additional localizations.
      if (country.translations) {
        for (const [lang, translation] of Object.entries(country.translations)) {
          const commonName = (translation as any).common || country.name?.common || 'N/A'
          const translationRecord: ProcessedCountry = {
            cca2: country.cca2,
            ccn3: country.ccn3 || '',
            cca3: country.cca3 || '',
            officialName: (translation as any).official || country.name?.official || 'N/A',
            unMember: country.unMember,
            languages: country.languages ? Object.values(country.languages) : [],
            currencies: country.currencies || {},
            latlng: country.latlng || [],
            googleMaps: country.maps?.googleMaps || '',
          };

          // Ensure the localization entry exists and add the translated record.
          if (!countriesData[lang]) {
            countriesData[lang] = {};
          }
          countriesData[lang][commonName] = translationRecord;
        }
      }
    }

    // Save each localization file in minified JSON format, overwriting existing ones.
    for (const lang of Object.keys(countriesData)) {
      const filePath = path.join(dataDir, `${lang}.json`);
      await fs.writeFile(filePath, JSON.stringify(countriesData[lang]), 'utf-8');
      logInfo(`Saved '${lang}' localization data: ${Object.keys(countriesData[lang]).length} records.`);
    }
    return countriesData;
  } catch (error) {
    await logError(`Error in getCountriesData: ${error}`);
    throw error;
  }
}