import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import {
  COUNTRIES_API,
  COUNTRIES_FILE_PATH,
  GEOCOUNTRIES_URL,
  POLYGON_FILE_PATH,
} from '../meta/constants.js';
import { logInfo, logError, logWarning } from './logger.js';
import { loadConfig } from '../config/config.js';
import type {
  AllCountriesData,
  LocalizedCountryData,
  CountryPolygon,
  LocalizationCode,
} from '../types.js';

/**
 * In-memory cache for the comprehensive country data.
 * Avoids repeated file reads or API calls within the same process.
 */
let cachedAllCountriesData: AllCountriesData | null = null;

/**
 * @async
 * @private
 * @function _loadOrFetchAllCountriesData
 * @description Internal function to load comprehensive country data from cache file or fetch from API.
 * Ensures all available localizations from the API are stored in the cache file.
 * Caches the result in memory for subsequent calls.
 *
 * @returns {Promise<AllCountriesData>} A promise resolving to the full country dataset. Returns empty object on failure.
 */
async function _loadOrFetchAllCountriesData(): Promise<AllCountriesData> {
  // 1. Check in-memory cache first
  if (cachedAllCountriesData) {
    // await logInfo('[Cache] Returning cached country data.'); // Optional: Logging cache hit
    return cachedAllCountriesData;
  }

  // 2. Try loading from the consolidated file
  try {
    await fs.access(COUNTRIES_FILE_PATH); // Check if file exists and is accessible
    const content = await fs.readFile(COUNTRIES_FILE_PATH, 'utf-8');
    const allCountriesData: AllCountriesData = JSON.parse(content);
    await logInfo(`[File Cache] Loaded ${Object.keys(allCountriesData).length} countries from ${COUNTRIES_FILE_PATH}.`);
    cachedAllCountriesData = allCountriesData; // Store in memory cache
    return allCountriesData;
  } catch (fileError: any) {
    if (fileError.code === 'ENOENT') {
      await logInfo(`[File Cache] File '${COUNTRIES_FILE_PATH}' not found. Fetching from API...`);
    } else {
      await logWarning(`[File Cache] Could not access '${COUNTRIES_FILE_PATH}'. Reason: ${fileError.message}. Fetching from API...`);
    }
  }

  // 3. Fetch from API as fallback
  await logInfo(`[API Fetch] Fetching countries data from: ${COUNTRIES_API}...`);
  try {
    // Use default timeout or load from config if needed, 30s default here
    const config = await loadConfig().catch(() => ({ timeout: 30000 })); // Load config just for timeout, provide default on failure
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

    const response = await fetch(COUNTRIES_API, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const rawCountries: any[] = await response.json();
    await logInfo(`[API Fetch] Fetched data for ${rawCountries.length} raw entries.`);

    const processedCountries: AllCountriesData = {};

    for (const country of rawCountries) {
      if (!country.cca2) {
        await logWarning(`[API Process] Skipping entry due to missing cca2. Name: ${country.name?.common || 'N/A'}`);
        continue;
      }

      const cca2 = country.cca2;
      const defaultCommonName = country.name?.common || 'N/A'; // Typically English

      const names: Record<string, string> = {};

      // Add the default common name, assuming it's English ('eng') if available
      if (defaultCommonName !== 'N/A') {
          names['eng'] = defaultCommonName;
      }

      // Add all available translations, potentially overwriting 'eng' if a specific 'eng' translation exists
      if (country.translations) {
        for (const langCode in country.translations) {
          if (Object.prototype.hasOwnProperty.call(country.translations, langCode)) {
            const translation = country.translations[langCode];
            if (translation.common) { // Only add if a common name exists for this lang
                names[langCode] = translation.common;
            }
          }
        }
      }

      // Final check: If 'eng' wasn't added/overwritten by translations, but we had a default, ensure it's there.
      if (!names['eng'] && defaultCommonName !== 'N/A') {
         names['eng'] = defaultCommonName;
      }

      // If no valid names were found at all, log a warning but still include the country
      if (Object.keys(names).length === 0) {
         await logWarning(`[API Process] No common names found for country ${cca2}.`);
      }

      processedCountries[cca2] = {
        cca2: cca2,
        cca3: country.cca3 || '',
        unMember: country.unMember || false,
        languages: country.languages ? Object.keys(country.languages) : [],
        names: names, // Store the comprehensive names map
      };
    }

    // Save the fetched and processed data to the file cache
    if (Object.keys(processedCountries).length > 0) {
      try {
        await fs.mkdir(path.dirname(COUNTRIES_FILE_PATH), { recursive: true });
        await fs.writeFile(COUNTRIES_FILE_PATH, JSON.stringify(processedCountries), 'utf-8');
        await logInfo(`[API Save] Saved ${Object.keys(processedCountries).length} processed countries to ${COUNTRIES_FILE_PATH}.`);
      } catch (writeError) {
        await logError(`[API Save] Failed to write country data to ${COUNTRIES_FILE_PATH}.`, 'SaveData', writeError);
        // Proceed with the in-memory data even if saving failed
      }
    } else {
      await logWarning('[API Process] No countries processed from API. Cache file not written.');
    }

    cachedAllCountriesData = processedCountries; // Store in memory cache
    return processedCountries;

  } catch (error: any) {
    await logError(`[API Fetch/Process] Error: ${error.message}`, '_loadOrFetchAllCountriesData', error);
    // Return empty object on critical failure to prevent downstream issues
    return {};
  }
}


/**
 * @async
 * @function getCountryData
 * @description Retrieves processed country data, returning only specified localizations.
 * Loads data from cache or fetches from API if necessary.
 *
 * @param {string[] | null | undefined} cca2Codes - An array of ISO 3166-1 alpha-2 codes (case-insensitive),
 *   or `null`/`undefined` to retrieve data for *all* countries. An empty array `[]` returns an empty result object.
 * @param {LocalizationCode[]} localizations - An array of desired language codes for names (e.g., ['eng', 'fra']).
 * @returns {Promise<Record<string, LocalizedCountryData | null>>} A promise resolving to an object mapping each requested cca2 code
 *   (or all codes if `cca2Codes` was null/undefined) to its localized data (`LocalizedCountryData`) or `null` if a specific code was requested but not found.
 *   The `names` property within `LocalizedCountryData` will only contain entries for requested localizations that were available.
 */
export async function getCountryData(
  cca2Codes: string[] | null | undefined, // Updated signature
  localizations: LocalizationCode[]
): Promise<Record<string, LocalizedCountryData | null>> {

  if (!localizations || localizations.length === 0) {
    await logWarning('[getCountryData] Received empty or invalid localizations array. No names will be returned.');
    // Proceed but expect empty names objects in results
  }

  const results: Record<string, LocalizedCountryData | null> = {};
  let allCountriesData: AllCountriesData;

  try {
    // Ensure the full dataset is loaded (uses cache internally)
    allCountriesData = await _loadOrFetchAllCountriesData();
  } catch (error) {
    await logError('[getCountryData] Failed to load the base country dataset.', 'getCountryData', error);
    // Cannot proceed if base data fails to load
    return {};
  }

  if (Object.keys(allCountriesData).length === 0) {
     await logWarning('[getCountryData] Base country dataset is empty. Cannot retrieve data.');
     return {};
  }

  // Determine which codes to process
  let codesToProcess: string[];
  const isRequestingAll = cca2Codes === null || cca2Codes === undefined;

  if (isRequestingAll) {
      // Requesting ALL countries
      codesToProcess = Object.keys(allCountriesData);
      await logInfo(`[getCountryData] Processing request for all ${codesToProcess.length} countries.`);
  } else if (cca2Codes.length === 0) {
      // Explicitly empty array means request nothing
      await logWarning('[getCountryData] Received empty cca2Codes array. Returning empty results.');
      return {};
  } else {
      // Requesting specific countries provided in the array
      codesToProcess = cca2Codes;
      await logInfo(`[getCountryData] Processing request for specific codes: [${cca2Codes.join(', ')}]`);
  }

  // Loop through the determined codes (either specific list or all keys)
  for (const code of codesToProcess) {
    // Normalize the code from the list (necessary if input array had mixed case)
    const normalizedCode = code.toUpperCase();
    // Get data using the normalized code
    const sourceCountryData = allCountriesData[normalizedCode];

    if (!sourceCountryData) {
      // If specific codes were requested, mark as null.
      // If 'all' were requested, this indicates an inconsistency (shouldn't happen if codesToProcess came from Object.keys)
      // but handle defensively.
      if (!isRequestingAll) {
          results[normalizedCode] = null; // Mark explicitly requested but not found codes as null
      }
      // Log regardless
      await logInfo(`[getCountryData] Source data not found for cca2: '${normalizedCode}'. Skipping.`);
      continue;
    }

    // Filter names based on requested localizations
    const localizedNames: Partial<Record<LocalizationCode, string>> = {};
    for (const loc of localizations) {
      // Use direct property access with optional chaining for efficiency and safety
      const name = sourceCountryData.names?.[loc];
      if (name) { // Check if name is truthy (exists and is not empty string)
        localizedNames[loc] = name;
      }
    }

    // Optional: Keep or remove the debug log added previously
    // await logInfo(`[DEBUG getCountryData] For ${normalizedCode}, FILTERED localizedNames object is: ${JSON.stringify(localizedNames)}`);

    // Build the result object for this country
    const localizedData: LocalizedCountryData = {
      cca2: sourceCountryData.cca2,
      cca3: sourceCountryData.cca3,
      unMember: sourceCountryData.unMember,
      languages: sourceCountryData.languages, // Assigns original array reference (generally safe for read-only use)
      names: localizedNames, // Assigns the filtered names object
    };

    results[normalizedCode] = localizedData; // Add the localized data to the results map
  }

  await logInfo(`[getCountryData] Finished processing. Returning data for ${Object.keys(results).length} countries.`);
  return results;
}

/** In-memory cache for country polygons array. */
let cachedAllCountryPolygonsArray: CountryPolygon[] | null = null;

/**
 * @async
 * @private
 * @function _loadOrFetchAllPolygons
 * @description Internal function to load all polygon data from cache file or fetch from source.
 * Caches the result (as an array) in memory.
 * @returns {Promise<CountryPolygon[]>} Array of all polygon objects. Returns empty array on failure.
 */
async function _loadOrFetchAllPolygons(): Promise<CountryPolygon[]> {
    // 1. Check in-memory cache
    if (cachedAllCountryPolygonsArray) {
        return cachedAllCountryPolygonsArray;
    }

    // 2. Try loading from file
    try {
        await fs.access(POLYGON_FILE_PATH);
        const content = await fs.readFile(POLYGON_FILE_PATH, 'utf-8');
        const polygons: CountryPolygon[] = JSON.parse(content);
        await logInfo(`[File Cache] Loaded ${polygons.length} country polygons from ${POLYGON_FILE_PATH}.`);
        cachedAllCountryPolygonsArray = polygons; // Cache in memory
        return polygons;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            await logInfo(`[File Cache] Polygon file '${POLYGON_FILE_PATH}' not found. Fetching from source...`);
        } else {
            await logWarning(`[File Cache] Could not access polygon file '${POLYGON_FILE_PATH}'. Reason: ${err.message}. Fetching...`);
        }
    }

    // 3. Fetch from source URL
    try {
        await logInfo(`[API Fetch] Fetching GeoJSON data from: ${GEOCOUNTRIES_URL}`);
        const config = await loadConfig().catch(() => ({ timeout: 60000 }));
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout || 60000);
        const response = await fetch(GEOCOUNTRIES_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Failed to fetch GeoJSON: ${response.status} ${response.statusText}`);
        }
        const geoJson: any = await response.json();
        if (!geoJson || !Array.isArray(geoJson.features)) {
            throw new Error('Fetched GeoJSON data is invalid or missing features array.');
        }
        await logInfo(`[API Fetch] Fetched GeoJSON data. Processing ${geoJson.features.length} features...`);

        const polygons: CountryPolygon[] = geoJson.features
            .map((feature: any): CountryPolygon | null => {
                try {
                    let cca2 = feature?.properties?.['ISO3166-1-Alpha-2'] || feature?.properties?.ISO_A2;
                    if (!cca2 || cca2 === "-99") { cca2 = feature?.properties?.ISO_A2_EH; }
                    if (!feature?.geometry || !cca2 || cca2 === "-99") {
                        logWarning(`[API Process] Skipping polygon feature due to missing geometry or invalid cca2 ('${cca2 || 'N/A'}'). Props: ${JSON.stringify(feature?.properties)}`);
                        return null;
                    }
                    // Ensure polygon data type matches definition (e.g., GeoJSON.Geometry or any)
                    const polygonData: CountryPolygon['polygon'] = feature.geometry;
                    return { cca2, polygon: polygonData };
                } catch (featureError: any) {
                    logError(`[API Process] Error processing polygon feature. Props: ${JSON.stringify(feature?.properties)}. Error: ${featureError.message}`, 'getCountryPolygons', featureError);
                    return null;
                }
            })
            .filter((p: CountryPolygon | null): p is CountryPolygon => p !== null);

        if (polygons.length > 0) {
            try {
                await fs.mkdir(path.dirname(POLYGON_FILE_PATH), { recursive: true });
                await fs.writeFile(POLYGON_FILE_PATH, JSON.stringify(polygons), 'utf-8');
                await logInfo(`[API Save] Saved ${polygons.length} processed polygons to ${POLYGON_FILE_PATH}.`);
            } catch (writeError) {
                await logError(`[API Save] Failed to write polygon data to ${POLYGON_FILE_PATH}.`, 'SavePolygonData', writeError);
            }
        } else {
            await logWarning('[API Process] No polygons processed from source. Cache file not written.');
        }
        cachedAllCountryPolygonsArray = polygons; // Cache in memory
        return polygons;
    } catch (error: any) {
        await logError(`[API Fetch/Process] Error fetching/processing polygons: ${error.message}`, 'getCountryPolygons', error);
        return []; // Return empty array on critical failure
    }
}

/**
 * @async
 * @function getCountryPolygons
 * @description Retrieves country polygon (boundary) data in standard GeoJSON format.
 * Loads data from cache or fetches from source if necessary.
 *
 * @param {string[] | null | undefined} cca2Codes - An array of ISO 3166-1 alpha-2 codes (case-insensitive)
 *   to retrieve polygons for, or `null`/`undefined` to retrieve polygons for *all* available countries.
 *   An empty array `[]` returns an empty result object.
 * @returns {Promise<Record<string, CountryPolygon | null>>} A promise resolving to an object mapping each requested cca2 code
 *   (or all codes if `cca2Codes` was null/undefined) to its `CountryPolygon` object or `null` if a specific code was requested but no polygon was found.
 */
export async function getCountryPolygons(
    cca2Codes: string[] | null | undefined
): Promise<Record<string, CountryPolygon | null>> {

    const results: Record<string, CountryPolygon | null> = {};
    let allPolygons: CountryPolygon[];

    try {
        // Ensure the full polygon dataset is loaded (uses cache internally)
        allPolygons = await _loadOrFetchAllPolygons();
    } catch (error) {
        await logError('[getCountryPolygons] Failed to load the base polygon dataset.', 'getCountryPolygons', error);
        return {}; // Cannot proceed if base data fails
    }

    if (allPolygons.length === 0) {
       await logWarning('[getCountryPolygons] Base polygon dataset is empty. Cannot retrieve data.');
       return {};
    }

    // Create a Map for efficient lookup by cca2 code
    const polygonMap = new Map(allPolygons.map(p => [p.cca2.toUpperCase(), p]));

    // Determine which codes to process
    let codesToProcess: string[];
    const isRequestingAll = cca2Codes === null || cca2Codes === undefined;

    if (isRequestingAll) {
        // Requesting ALL countries - use keys from the map we just created
        codesToProcess = Array.from(polygonMap.keys());
        await logInfo(`[getCountryPolygons] Processing request for polygons of all ${codesToProcess.length} countries found in source.`);
    } else if (cca2Codes.length === 0) {
        // Explicitly empty array means request nothing
        await logWarning('[getCountryPolygons] Received empty cca2Codes array. Returning empty results.');
        return {};
    } else {
        // Requesting specific countries provided in the array
        codesToProcess = cca2Codes;
        await logInfo(`[getCountryPolygons] Processing request for specific polygon codes: [${cca2Codes.join(', ')}]`);
    }

    // Loop through the determined codes and build the result map
    for (const code of codesToProcess) {
        const normalizedCode = code.toUpperCase();
        const foundPolygon = polygonMap.get(normalizedCode);

        if (foundPolygon) {
            results[normalizedCode] = foundPolygon;
        } else {
            // If specific codes were requested, mark as null. Don't add if 'all' were requested and key wasn't in map.
            if (!isRequestingAll) {
                results[normalizedCode] = null;
                await logInfo(`[getCountryPolygons] Polygon not found for requested cca2: '${normalizedCode}'.`);
            } else {
                // This case (key from map not found in map) should theoretically not happen
                await logWarning(`[getCountryPolygons] Internal inconsistency: Code '${normalizedCode}' from polygon map keys not found in map.`);
            }
        }
    }

    await logInfo(`[getCountryPolygons] Finished processing. Returning polygon data for ${Object.keys(results).length} codes.`);
    return results;
}