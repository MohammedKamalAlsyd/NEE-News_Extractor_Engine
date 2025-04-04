import fs from 'fs/promises';
import path from 'path';
import { COUNTRIES_API, COUNTRIES_DATA_DIR, EXPECTED_NUMBER_OF_FILES } from '../meta/constants.js';
import { logInfo, logError } from './logger.js';
import { loadConfig } from '../../src/config/config.js';

// Interface for processed country data
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

// Interface for the aggregated countries data by language
export interface CountriesData {
  [lang: string]: Record<string, ProcessedCountry>;
}

/**
 * Fetches or loads country data, processing it into localized files.
 * @returns The processed countries data organized by language.
 */
export async function getCountriesData(): Promise<CountriesData> {
  const config = await loadConfig();
  const countriesData: CountriesData = {};
  const dataDir = path.join(process.cwd(), COUNTRIES_DATA_DIR);

  try {
    await fs.mkdir(dataDir, { recursive: true });
    const files = await fs.readdir(dataDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    if (jsonFiles.length === EXPECTED_NUMBER_OF_FILES) {
      await logInfo('Local countries data found. Loading from disk...');
      for (const file of jsonFiles) {
        const lang = file.replace('.json', '');
        const filePath = path.join(dataDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        countriesData[lang] = JSON.parse(content);
        await logInfo(`Loaded countries data for '${lang}' localization from file.`);
      }
      await logInfo('Aggregated all localization files from disk.');
      return countriesData;
    } else {
      await logInfo(
        `Expected ${EXPECTED_NUMBER_OF_FILES} localization files, but found ${jsonFiles.length}. Fetching and updating data...`,
      );
    }
  } catch (error) {
    await logInfo('Data directory not found or accessible. Fetching data...');
  }

  await logInfo('Fetching countries data from API...');
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    const response = await fetch(COUNTRIES_API, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries data: ${response.statusText}`);
    }
    const countries = await response.json();

    for (const country of countries) {
      const commonName = country.name?.common || 'N/A';
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

      if (!countriesData['eng']) {
        countriesData['eng'] = {};
      }
      countriesData['eng'][commonName] = defaultRecord;

      if (country.translations) {
        for (const [lang, translation] of Object.entries(country.translations)) {
          const transCommonName = (translation as any).common || country.name?.common || 'N/A';
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

          if (!countriesData[lang]) {
            countriesData[lang] = {};
          }
          countriesData[lang][transCommonName] = translationRecord;
        }
      }
    }

    for (const lang of Object.keys(countriesData)) {
      const filePath = path.join(dataDir, `${lang}.json`);
      await fs.writeFile(filePath, JSON.stringify(countriesData[lang]), 'utf-8');
      await logInfo(`Saved '${lang}' localization data: ${Object.keys(countriesData[lang]).length} records.`);
    }
    return countriesData;
  } catch (error) {
    await logError(`Error in getCountriesData: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}