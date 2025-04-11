import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import {
  COUNTRIES_API,
  COUNTRIES_DATA_DIR,
  GEOCOUNTRIES_URL,
  POLYGON_DATA_DIR,
} from '../meta/constants.js';
import { logInfo, logError, logWarning } from './logger.js';
import { loadConfig } from '../config/config.js';
import type { ProcessedCountry, AllCountriesData, PolygonFormat, CountryPolygon } from '../types.js'; // Import updated types

// Helper to resolve __dirname in ES modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Country Data Handling ---

const ALL_COUNTRIES_FILENAME = 'countries_data.json'; // Single file for all localizations


/**
 * @async
 * @function getCountriesData
 * @description Fetches or loads comprehensive country data including multiple localizations.
 *
 * This function will:
 * - Check for a local cache file (`countries_data.json`) containing all country data.
 * - If the file exists, load data directly from disk.
 * - If the file is missing or inaccessible, fetch the full data from the REST Countries API.
 * - Process the data, extracting relevant fields (cca2, cca3, languages, unMember) and common names for *all* available translations.
 * - Store the common names in a `names` object within each `ProcessedCountry`, keyed by language code (e.g., 'eng', 'ara').
 * - Save the complete processed data (all countries, all localizations) to the single cache file (`countries_data.json`).
 *
 * @returns {Promise<AllCountriesData>} A promise that resolves to an object containing all processed country data, keyed by cca2 code. Returns an empty object on failure.
 * @throws {Error} Bubbles up errors if fetching or critical file operations fail.
 */
export async function getCountriesData(): Promise<AllCountriesData> {
  const config = await loadConfig(); // Still needed for timeout
  const dataDir = path.resolve(__dirname, '..', COUNTRIES_DATA_DIR); // Use path relative to this file
  const filePath = path.join(dataDir, ALL_COUNTRIES_FILENAME);

  try {
    // Attempt to access and read the consolidated data file.
    await fs.access(filePath); // Check if file exists and is accessible
    await logInfo(`Consolidated countries data found. Loading from ${filePath}...`);
    const content = await fs.readFile(filePath, 'utf-8');
    const allCountriesData: AllCountriesData = JSON.parse(content);
    await logInfo(`Loaded ${Object.keys(allCountriesData).length} countries from ${ALL_COUNTRIES_FILENAME}.`);
    return allCountriesData; // Return immediately after loading from file
  } catch (fileError: any) {
    if (fileError.code === 'ENOENT') {
      await logInfo(`Consolidated countries data file '${ALL_COUNTRIES_FILENAME}' not found. Fetching and processing data...`);
    } else {
      await logWarning(`Could not access existing data file '${filePath}'. Reason: ${fileError.message}. Fetching data...`);
    }
  }

  await logInfo(`Fetching countries data from API: ${COUNTRIES_API}...`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    const response = await fetch(COUNTRIES_API, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch countries data: ${response.status} ${response.statusText}`);
    }
    // Type assertion based on the expected API structure
    const rawCountries: any[] = await response.json();
    await logInfo(`Successfully fetched data for ${rawCountries.length} raw entries from API.`);

    // This object will hold all processed data.
    const allProcessedCountries: AllCountriesData = {};

    // Process each country returned from the API.
    for (const country of rawCountries) {
      // Ensure cca2 exists, otherwise skip this entry
      if (!country.cca2) {
        await logError(`Skipping entry due to missing cca2 code. Name: ${country.name?.common || 'N/A'}`);
        continue;
      }

      const cca2 = country.cca2;
      const defaultCommonName = country.name?.common || 'N/A';

      // Build the initial processed record.
      const processedRecord: ProcessedCountry = {
        cca2: cca2,
        cca3: country.cca3 || '',
        unMember: country.unMember || false, // Ensure boolean value
        languages: country.languages ? Object.keys(country.languages) : [],
        names: {} // Initialize names object
      };

      // Add the default common name (usually English)
      if (defaultCommonName !== 'N/A') {
        // Prefer 'eng' key if available, else use a generic default or skip
        // Let's assume the base common name corresponds to 'eng' if 'eng' is a language
        // or if no translations specifically define 'eng'.
        processedRecord.names['eng'] = defaultCommonName;
      }

      // Process translations to populate the names object
      if (country.translations) {
        for (const langCode in country.translations) {
          if (Object.prototype.hasOwnProperty.call(country.translations, langCode)) {
            const translation = country.translations[langCode];
            // Store the common name for this language, fallback to default common if specific translation is missing
            processedRecord.names[langCode] = translation.common || defaultCommonName;
          }
        }
      }

      // Ensure the default 'eng' name wasn't overwritten by a translation if it shouldn't have been
      // (e.g., if translations exist but don't include 'eng', keep the original defaultCommonName as 'eng')
      if (!processedRecord.names['eng'] && defaultCommonName !== 'N/A') {
        processedRecord.names['eng'] = defaultCommonName;
      }
      // If defaultCommonName was N/A and no english translation, remove eng key
      else if (processedRecord.names['eng'] === 'N/A') {
        delete processedRecord.names['eng'];
      }


      // Add the fully processed record to our main collection.
      allProcessedCountries[cca2] = processedRecord;
    }

    // Save the consolidated data.
    if (Object.keys(allProcessedCountries).length > 0) {
      await fs.mkdir(dataDir, { recursive: true }); // Ensure directory exists
      await fs.writeFile(filePath, JSON.stringify(allProcessedCountries), 'utf-8');
      await logInfo(
        `Saved consolidated countries data: ${Object.keys(allProcessedCountries).length} records to ${filePath}.`
      );
    } else {
      await logWarning(`No country data was processed. File not saved.`);
    }
    return allProcessedCountries; // Return the processed data

  } catch (error) {
    await logError(`Error during API fetch or processing in getCountriesData: ${error instanceof Error ? error.message : error}`, 'getCountriesData', error);
    // Return an empty object on failure to prevent downstream errors
    return {};
  }
}


/**
 * @async
 * @function getCountryDataByCode
 * @description Retrieves processed country data for a specific country using its cca2 code.
 * This function assumes `getCountriesData` has been called previously to load or fetch the data.
 *
 * @param {string} cca2 - The ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB', 'DE').
 * @param {AllCountriesData} allCountriesData - The complete dataset of countries, typically loaded by `getCountriesData`.
 * @returns {Promise<ProcessedCountry | null>} A promise that resolves to the country's data object if found, otherwise null.
 */
export async function getCountryDataByCode(cca2: string, allCountriesData: AllCountriesData): Promise<ProcessedCountry | null> {
  if (!allCountriesData) {
    await logError(`[getCountryDataByCode] Invalid or missing 'allCountriesData' provided.`, 'getCountryDataByCode');
    return null;
  }
  const upperCca2 = cca2.toUpperCase(); // Normalize input key
  const country = allCountriesData[upperCca2];

  if (country) {
    await logInfo(`[getCountryDataByCode] Found country data for cca2: '${upperCca2}'.`, 'getCountryDataByCode');
    return country;
  } else {
    await logInfo(`[getCountryDataByCode] Country data not found for cca2: '${upperCca2}'.`, 'getCountryDataByCode');
    return null;
  }
}


// --- Polygon Data Handling ---

/**
 * Converts GeoJSON coordinates from [longitude, latitude] to [latitude, longitude] format.
 * This is typically required for libraries like Google Maps JavaScript API.
 * Handles both Polygon and MultiPolygon geometry types.
 *
 * @private
 * @function convertCoordinates
 * @param {any} geometry - The GeoJSON geometry object (Polygon or MultiPolygon).
 * @returns {any} The geometry object with coordinates converted to [lat, lng] format.
 * @throws {Error} If the geometry type is unsupported or input is invalid.
 */
function convertCoordinates(geometry: any): any {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    logError('[convertCoordinates] Invalid geometry object provided for coordinate conversion.');
    throw new Error('Invalid geometry object provided for coordinate conversion.');
  }

  try {
    if (geometry.type === 'Polygon') {
      // For Polygon: [[[lng, lat], ...]] -> [[[lat, lng], ...]]
      return geometry.coordinates.map((ring: number[][]) =>
        ring.map(coord => {
          if (!Array.isArray(coord) || coord.length < 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
            throw new Error('Invalid coordinate pair found in Polygon ring.');
          }
          return [coord[1], coord[0]];
        })
      );
    } else if (geometry.type === 'MultiPolygon') {
      // For MultiPolygon: [[[[lng, lat], ...]], ...] -> [[[[lat, lng], ...]], ...]
      return geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) =>
          ring.map(coord => {
            if (!Array.isArray(coord) || coord.length < 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
              throw new Error('Invalid coordinate pair found in MultiPolygon ring.');
            }
            return [coord[1], coord[0]];
          })
        )
      );
    } else {
      // Log and throw for unsupported types
      throw new Error(`Unsupported geometry type: ${geometry.type}`);
    }
  } catch (error: any) {
    logError(`[convertCoordinates] Error converting coordinates for geometry type ${geometry.type}: ${error.message}`);
    throw error; // Re-throw after logging
  }
}

/**
 * @async
 * @function getCountryPolygons
 * @description Fetches or loads country polygon (boundary) data in the specified coordinate format.
 *
 * This function will:
 * - Check for a pre-existing local file corresponding to the requested format ('google' or 'leaflet').
 * - If the file exists, load the polygons directly from disk.
 * - If the file is missing, fetch the GeoJSON data from the source URL (`GEOCOUNTRIES_URL`).
 * - Process the GeoJSON features:
 * - Extract the ISO A2 code (`cca2`).
 * - Extract the geometry.
 * - If the format is 'google', convert coordinates from [lng, lat] to [lat, lng].
 * - If the format is 'leaflet', use the original [lng, lat] coordinates.
 * - Save the processed polygons to the appropriate local file for future use.
 * - Return the array of country polygons.
 *
 * @param {PolygonFormat} format - The desired coordinate format ('google' or 'leaflet').
 * @returns {Promise<CountryPolygon[]>} A promise that resolves to an array of country polygon objects. Returns empty array on failure.
 * @throws {Error} Bubbles up errors if fetching or critical processing fails.
 */
export async function getCountryPolygons(): Promise<CountryPolygon[]> { // Removed format parameter
  const fileName = 'countryPolygons.json'; // Single file name
  // Construct path relative to current working directory for broader compatibility
  const dataDir = path.resolve(__dirname, '..', POLYGON_DATA_DIR); // Use path relative to this file
  const filePath = path.join(dataDir, fileName);
  const dirPath = path.dirname(filePath);

  try {
    // Check if the file exists first
    await fs.access(filePath);
    // If it exists, read and parse it
    const content = await fs.readFile(filePath, 'utf-8');
    // Update log message - remove format mention
    await logInfo(`Loaded country polygons from file: ${filePath}`);
    return JSON.parse(content) as CountryPolygon[];
  } catch (err: any) {
    // Handle file not found or other access errors by fetching
    if (err.code === 'ENOENT') {
      // Update log message - remove format mention
      await logInfo(`Country polygons file not found at ${filePath}. Fetching data...`);
    } else {
      // Update log message - remove format mention
      await logWarning(`Could not access existing polygon file at ${filePath}. Reason: ${err.message}. Fetching data...`);
    }

    try {
      await logInfo(`Fetching GeoJSON data from: ${GEOCOUNTRIES_URL}`);
      const response = await fetch(GEOCOUNTRIES_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON data: ${response.status} ${response.statusText}`);
      }
      const geoJson: any = await response.json();

      if (!geoJson || !Array.isArray(geoJson.features)) {
        throw new Error('Fetched GeoJSON data is invalid or missing features array.');
      }
      await logInfo(`Successfully fetched GeoJSON data. Processing ${geoJson.features.length} features...`);


      const polygons: CountryPolygon[] = geoJson.features
        .map((feature: any): CountryPolygon | null => {
          try {
            // Keep the cca2 extraction logic from the previous step
            let cca2 = feature?.properties?.['ISO3166-1-Alpha-2'];
            if (!cca2) {
                cca2 = feature?.properties?.ISO_A2;
                // Optional logging removed for brevity
                // logWarning(`Property 'ISO3166-1-Alpha-2' not found, falling back to 'ISO_A2' for properties: ${JSON.stringify(feature?.properties)}`);
            }
            if (!cca2 || cca2 === "-99") {
                const ehCode = feature?.properties?.ISO_A2_EH;
                if (ehCode && ehCode !== "-99") {
                   cca2 = ehCode;
                   // Optional logging removed for brevity
                   // logWarning(`Primary cca2 invalid ('${cca2}'), falling back to 'ISO_A2_EH': ${ehCode} for properties: ${JSON.stringify(feature?.properties)}`);
                }
            }
            if (!feature || !feature.properties || !feature.geometry || !cca2 || cca2 === "-99") {
                logWarning(`Skipping feature due to missing properties, geometry, or valid final cca2 code ('${cca2}'). Properties: ${JSON.stringify(feature?.properties)}`);
                return null;
            }

            // --- Modification: Always use standard GeoJSON format ---
            // No transformation needed, just use the geometry as is
            const polygonData = feature.geometry;
            // --- End Modification ---

            return { cca2, polygon: polygonData };
          } catch (featureError) {
            logError(`Error processing feature with properties ${JSON.stringify(feature?.properties)}: ${featureError instanceof Error ? featureError.message : featureError}`, 'getCountryPolygons');
            return null;
          }
        })
        .filter((p: CountryPolygon | null): p is CountryPolygon => p !== null);


      await fs.mkdir(dirPath, { recursive: true });
      // Save compact JSON
      await fs.writeFile(filePath, JSON.stringify(polygons), 'utf-8');
      // Update log message - remove format mention
      await logInfo(`Fetched, processed, and saved country polygons (${polygons.length} records) to: ${filePath}`);
      return polygons;
    } catch (fetchOrProcessError) {
      // Update log message - remove format mention
      await logError(`Error fetching or processing country polygons: ${fetchOrProcessError instanceof Error ? fetchOrProcessError.message : fetchOrProcessError}`, 'getCountryPolygons', fetchOrProcessError);
      throw fetchOrProcessError;
    }
  }
}