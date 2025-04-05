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
import type { CountriesData, ProcessedCountry } from '../types.js';

// Helper to resolve __dirname in ES modules
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fetches or loads country data, processing it into localized files.
 *
 * This function will:
 * - Attempt to read from a local file matching the configuration's localization value (e.g., 'eng.json', 'ara.json').
 * - If the file is missing or incomplete, it fetches the full data from the REST Countries API.
 * - Processes the data, extracting relevant fields and handling translations based on the API's structure (using language codes like 'ara', 'deu').
 * - Saves *only* the file that matches the configuration’s localization to the data directory.
 *
 * @returns {Promise<CountriesData>} A promise that resolves to an object containing the processed countries data, keyed by the configured localization code. If data for the configured localization is found or fetched, it will be under that key (e.g., `result[config.localization]`).
 * @throws {Error} If fetching data fails or file operations encounter issues.
 */
export async function getCountriesData(): Promise<CountriesData> {
  const config = await loadConfig();
  // Initialize an empty object to hold data for the requested localization.
  const countriesData: CountriesData = {};
  const dataDir = path.resolve(__dirname, '..', COUNTRIES_DATA_DIR); // Use path relative to this file

  try {
    await fs.mkdir(dataDir, { recursive: true });
    // Construct the expected file name based on the configured localization code (e.g., 'eng.json').
    const localizedFile = `${config.localization}.json`;
    const filePath = path.join(dataDir, localizedFile);

    try {
      // Attempt to access and read the specific localized file.
      await fs.access(filePath); // Check if file exists and is accessible
      await logInfo(`Local countries data for '${config.localization}' found. Loading from disk...`);
      const content = await fs.readFile(filePath, 'utf-8');
      countriesData[config.localization] = JSON.parse(content);
      await logInfo(`Loaded countries data for '${config.localization}' localization from file.`);
      return countriesData; // Return immediately after loading from file
    } catch (fileError) {
      // Log if the specific file is not found, then proceed to fetch.
      await logInfo(
        `Localized countries data file '${localizedFile}' not found or inaccessible. Fetching and processing data...`
      );
    }
  } catch (dirError) {
    // Log if the directory itself cannot be accessed/created, then proceed to fetch.
    await logInfo(`Data directory '${dataDir}' check failed. Fetching data... Error: ${dirError instanceof Error ? dirError.message : dirError}`);
  }

  await logInfo(`Workspaceing countries data from API: ${COUNTRIES_API}...`);
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
    await logInfo(`Successfully fetched data for ${rawCountries.length} countries/territories.`);

    // This object will temporarily hold processed data for the *target* localization only.
    const processedTargetLocalizationData: Record<string, ProcessedCountry> = {};

    // Process each country returned from the API.
    for (const country of rawCountries) {
       // Ensure cca2 exists, otherwise skip this entry
       if (!country.cca2) {
           await logError(`Skipping entry due to missing cca2 code. Name: ${country.name?.common || 'N/A'}`);
           continue;
       }

      // Determine the names based on the target localization
      let officialName = country.name?.official || 'N/A';
      let commonName = country.name?.common || 'N/A';

      // Check if the target localization exists in translations
      if (country.translations && country.translations[config.localization]) {
        const translation = country.translations[config.localization];
        officialName = translation.official || officialName; // Fallback to default if translation lacks it
        commonName = translation.common || commonName;     // Fallback to default if translation lacks it
      } else if (config.localization === 'eng') {
         // Use default names if target is English and no specific 'eng' translation is needed
         // (The base 'name' object is usually English)
         officialName = country.name?.official || 'N/A';
         commonName = country.name?.common || 'N/A';
      }
      // Note: If config.localization is not 'eng' and not in translations, we use the default (likely English) names.

      // Build the processed record for the target localization.
      const processedRecord: ProcessedCountry = {
        cca2: country.cca2,
        cca3: country.cca3 || '',
        officialName: officialName,
        commonName: commonName,
        unMember: country.unMember || false, // Ensure boolean value
        // Extract language codes (like 'eng', 'ara') directly from the keys of the languages object.
        languages: country.languages ? Object.keys(country.languages) : [],
      };

      // Add the processed record to our temporary object for the target localization.
      processedTargetLocalizationData[country.cca2] = processedRecord;
    }

    // Save only the data for the localization specified in the configuration.
    const localizationKey = config.localization;
    const filePath = path.join(dataDir, `${localizationKey}.json`);

    if (Object.keys(processedTargetLocalizationData).length > 0) {
       // Assign the processed data to the main return object under the localization key.
      countriesData[localizationKey] = processedTargetLocalizationData;
      await fs.writeFile(filePath, JSON.stringify(countriesData[localizationKey], null, 2), 'utf-8'); // Use null, 2 for pretty printing
      await logInfo(
        `Saved '${localizationKey}' localization data: ${Object.keys(countriesData[localizationKey]).length} records.`
      );
    } else {
      await logInfo(`No data processed for localization '${localizationKey}'. File not saved.`);
      // Ensure an empty object is returned for this key if nothing was processed
      countriesData[localizationKey] = {};
    }
    return countriesData; // Return the object containing the processed data for the target localization

  } catch (error) {
    await logError(`Error in getCountriesData processing or fetch: ${error instanceof Error ? error.message : error}`);
    // If fetch/processing fails, return an empty object for the target localization
    // to prevent downstream errors expecting the key to exist.
    countriesData[config.localization] = {};
    return countriesData; // Return empty data structure on error after logging
  }
}


// --- Polygon Data Handling ---

/**
 * Defines the possible formats for polygon coordinate data.
 * 'google': Coordinates formatted as [latitude, longitude] arrays, suitable for Google Maps API.
 * 'leaflet': Coordinates formatted as [longitude, latitude] arrays (standard GeoJSON), suitable for Leaflet.
 */
export type PolygonFormat = 'google' | 'leaflet';

/**
 * Represents the polygon data for a single country.
 */
export interface CountryPolygon {
  /** The ISO 3166-1 alpha-2 country code. */
  cca2: string;
  /**
   * The polygon geometry data. Structure depends on the GeoJSON feature type (Polygon or MultiPolygon)
   * and the requested format ('google' or 'leaflet').
   * For 'leaflet', it follows standard GeoJSON [lng, lat].
   * For 'google', coordinates within are converted to [lat, lng].
   */
  polygon: any;
}

/**
 * Converts GeoJSON coordinates from [longitude, latitude] to [latitude, longitude] format.
 * This is typically required for libraries like Google Maps JavaScript API.
 * Handles both Polygon and MultiPolygon geometry types.
 *
 * @private
 * @param {any} geometry - The GeoJSON geometry object (Polygon or MultiPolygon).
 * @returns {any} The geometry object with coordinates converted to [lat, lng] format.
 * @throws {Error} If the geometry type is unsupported.
 */
function convertCoordinates(geometry: any): any {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    throw new Error('Invalid geometry object provided for coordinate conversion.');
  }

  if (geometry.type === 'Polygon') {
    // For Polygon: [[[lng, lat], ...]] -> [[[lat, lng], ...]]
    return geometry.coordinates.map((ring: number[][]) =>
      ring.map(coord => [coord[1], coord[0]])
    );
  } else if (geometry.type === 'MultiPolygon') {
    // For MultiPolygon: [[[[lng, lat], ...]], ...] -> [[[[lat, lng], ...]], ...]
    return geometry.coordinates.map((polygon: number[][][]) =>
      polygon.map((ring: number[][]) =>
        ring.map(coord => [coord[1], coord[0]])
      )
    );
  } else {
    // Log and throw for unsupported types
    logError(`Unsupported geometry type encountered during coordinate conversion: ${geometry.type}`);
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

/**
 * Fetches or loads country polygon (boundary) data in the specified coordinate format.
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
 * @returns {Promise<CountryPolygon[]>} A promise that resolves to an array of country polygon objects.
 * @throws {Error} If fetching or processing fails.
 */
export async function getCountryPolygons(format: PolygonFormat): Promise<CountryPolygon[]> {
  // Determine filename based on format
  const fileName = format === 'google' ? 'countryPolygons_google.json' : 'countryPolygons_leaflet.json';
  // Construct full path relative to the project's current working directory
  const filePath = path.join(process.cwd(), POLYGON_DATA_DIR, fileName);
  const dirPath = path.dirname(filePath);

  try {
    // Check if the file exists first
    await fs.access(filePath);
    // If it exists, read and parse it
    const content = await fs.readFile(filePath, 'utf-8');
    await logInfo(`Loaded country polygons (${format}) from file: ${filePath}`);
    return JSON.parse(content) as CountryPolygon[];
  } catch (err: any) {
    // Handle file not found or other access errors by fetching
    if (err.code === 'ENOENT') {
      await logInfo(`Country polygons file (${format}) not found at ${filePath}. Fetching data...`);
    } else {
      await logWarning(`Could not access existing polygon file (${format}) at ${filePath}. Reason: ${err.message}. Fetching data...`);
    }

    try {
      await logInfo(`Workspaceing GeoJSON data from: ${GEOCOUNTRIES_URL}`);
      const response = await fetch(GEOCOUNTRIES_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON data: ${response.status} ${response.statusText}`);
      }
      // Type assertion for the expected GeoJSON structure
      const geoJson: any = await response.json();

      if (!geoJson || !Array.isArray(geoJson.features)) {
         throw new Error('Fetched GeoJSON data is invalid or missing features array.');
      }
       await logInfo(`Successfully fetched GeoJSON data. Processing ${geoJson.features.length} features...`);


      const polygons: CountryPolygon[] = geoJson.features
        .map((feature: any): CountryPolygon | null => {
          try {
             // Validate feature structure
            if (!feature || !feature.properties || !feature.geometry || !feature.properties.ISO_A2) {
              logWarning(`Skipping feature due to missing properties, geometry, or ISO_A2 code.`);
                return null; // Skip invalid features
            }
            const cca2 = feature.properties.ISO_A2;
             // Process polygon data based on format
            const polygonData = format === 'leaflet'
                                ? feature.geometry // Keep original GeoJSON geometry for Leaflet
                                : { // For Google, create new object with converted coords but keep type
                                     type: feature.geometry.type,
                                     coordinates: convertCoordinates(feature.geometry)
                                  };

            return { cca2, polygon: polygonData };
          } catch(featureError) {
              logError(`Error processing feature with properties ${JSON.stringify(feature?.properties)}: ${featureError instanceof Error ? featureError.message: featureError}`);
              return null; // Skip features that cause errors during processing
          }

        })
        .filter((p: CountryPolygon | null): p is CountryPolygon => p !== null); // Filter out any null results from skipping


      // Ensure the target directory exists before writing
      await fs.mkdir(dirPath, { recursive: true });
      // Write the processed polygons to the file
      await fs.writeFile(filePath, JSON.stringify(polygons, null, 2), 'utf-8'); // Pretty print JSON
      await logInfo(`Workspaceed, processed, and saved country polygons (${format}) data to: ${filePath}`);
      return polygons;
    } catch (fetchOrProcessError) {
      await logError(`Error fetching or processing country polygons (${format}): ${fetchOrProcessError instanceof Error ? fetchOrProcessError.message : fetchOrProcessError}`);
      // Re-throw the error to indicate failure
      throw fetchOrProcessError;
    }
  }
}