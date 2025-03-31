import fs from 'fs/promises';
import path from 'path';
import { COUNTRIES_API, COUNTRIES_DATA_DIR } from './constants.js';
import { logInfo, logError } from './logger.js';

export interface ProcessedCountry {
  cca2: string;
  ccn3: string;
  cca3: string;
  commonName: string;
  officialName: string;
  unMember: boolean;
  languages: string[];
  currencies: Record<string, { name: string; symbol: string }> | {};
  latlng: number[];
  googleMaps: string;
}

export interface CountriesData {
  [lang: string]: ProcessedCountry[];
}

/**
 * Retrieves processed country data grouped by localization.
 * 
 * Flow:
 *  1. Check if the data directory contains localization files.
 *     If found, aggregate and return the data.
 *  2. If not, fetch data from the REST Countries API.
 *  3. Process each country record (default English and translations).
 *  4. Save each localization file in minified JSON format.
 *  5. Return the aggregated data.
 * 
 * @returns A CountriesData object grouping country records by language.
 */
export async function getCountriesData(): Promise<CountriesData> {
  const countriesData: CountriesData = {};
  const dataDir = path.join(process.cwd(), COUNTRIES_DATA_DIR);
  await fs.mkdir(dataDir, { recursive: true });

  // Helper to load a localization file if it exists.
  async function loadLanguageFile(lang: string): Promise<ProcessedCountry[] | null> {
    const filePath = path.join(dataDir, `${lang}.json`);
    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      await logInfo(`Loaded countries data for '${lang}' localization from file.`);
      return JSON.parse(content).data;
    } catch {
      return null;
    }
  }

  const engData = await loadLanguageFile('eng');
  if (engData) {
    // If English data exists, assume all localization files are present.
    const files = await fs.readdir(dataDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const lang = file.replace('.json', '');
        const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
        countriesData[lang] = JSON.parse(content).data;
      }
    }
    await logInfo("Aggregated all localization files from disk.");
    return countriesData;
  }

  await logInfo('Countries data not found locally. Fetching from API...');
  try {
    const response = await fetch(COUNTRIES_API);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries data: ${response.statusText}`);
    }
    const countries = await response.json();

    // Process each country record.
    for (const country of countries) {
      const defaultRecord: ProcessedCountry = {
        cca2: country.cca2,
        ccn3: country.ccn3 || '',
        cca3: country.cca3 || '',
        commonName: country.name?.common || 'N/A',
        officialName: country.name?.official || 'N/A',
        unMember: country.unMember,
        languages: country.languages ? Object.values(country.languages) : [],
        currencies: country.currencies || {},
        latlng: country.latlng || [],
        googleMaps: country.maps?.googleMaps || '',
      };

      if (!countriesData['eng']) {
        countriesData['eng'] = [];
      }
      countriesData['eng'].push(defaultRecord);

      // Process translations for additional localizations.
      if (country.translations) {
        for (const [lang, translation] of Object.entries(country.translations)) {
          const translationRecord: ProcessedCountry = {
            cca2: country.cca2,
            ccn3: country.ccn3 || '',
            cca3: country.cca3 || '',
            commonName: (translation as any).common || country.name?.common || 'N/A',
            officialName: (translation as any).official || country.name?.official || 'N/A',
            unMember: country.unMember,
            languages: country.languages ? Object.values(country.languages) : [],
            currencies: country.currencies || {},
            latlng: country.latlng || [],
            googleMaps: country.maps?.googleMaps || '',
          };

          if (!countriesData[lang]) {
            countriesData[lang] = [];
          }
          countriesData[lang].push(translationRecord);
        }
      }
    }

    // Save each localization file in minified JSON format.
    for (const lang of Object.keys(countriesData)) {
      const filePath = path.join(dataDir, `${lang}.json`);
      await fs.writeFile(filePath, JSON.stringify({ data: countriesData[lang] }), 'utf-8');
      await logInfo(`Saved '${lang}' localization data: ${countriesData[lang].length} records.`);
    }
    return countriesData;
  } catch (error) {
    await logError(`Error in getCountriesData: ${error}`);
    throw error;
  }
}
