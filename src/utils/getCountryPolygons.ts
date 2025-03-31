import fs from 'fs/promises';
import path from 'path';
import { GEOCOUNTRIES_URL, POLYGON_DATA_DIR } from './constants.js';
import { logInfo, logError } from './logger.js';

export type PolygonFormat = 'google' | 'leaflet';

export interface CountryPolygon {
  cca2: string;
  polygon: any;
}

/**
 * Converts GeoJSON coordinates from [lng, lat] order to [lat, lng] order.
 * Supports both Polygon and MultiPolygon geometries.
 * @param geometry - A GeoJSON geometry object.
 * @returns The converted coordinate array.
 */
function convertCoordinates(geometry: any): any {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring: number[][]) =>
      ring.map(coord => [coord[1], coord[0]])
    );
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon: number[][][]) =>
      polygon.map((ring: number[][]) => ring.map(coord => [coord[1], coord[0]]))
    );
  } else {
    throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
}

/**
 * Retrieves country polygon data in the specified format.
 * 
 * Flow:
 *  1. Build the expected file path for cached polygon data.
 *  2. Attempt to load the file; if found, return its data.
 *  3. If not found, fetch the real GeoJSON data, process it, save the result,
 *     and then return the processed polygon data.
 * 
 * @param format - The desired polygon format ('google' or 'leaflet').
 * @returns An array of country polygon data.
 */
export async function getCountryPolygons(format: PolygonFormat): Promise<CountryPolygon[]> {
  const fileName = format === 'google'
    ? 'countryPolygons_google.json'
    : 'countryPolygons_leaflet.json';
  const filePath = path.join(process.cwd(), POLYGON_DATA_DIR, fileName);

  try {
    await fs.access(filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    await logInfo(`Loaded country polygons (${format}) from file.`);
    return JSON.parse(content);
  } catch (err) {
    await logInfo(`Country polygons file (${format}) not found. Fetching real polygon data...`);
    try {
      const response = await fetch(GEOCOUNTRIES_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch GeoJSON data: ${response.statusText}`);
      }
      const geoJson = await response.json();

      const polygons: CountryPolygon[] = geoJson.features.map((feature: any) => {
        const cca2 = feature.properties.ISO_A2;
        let polygonData: any;
        // For Leaflet, we keep the geometry unchanged; for Google Maps, we convert it.
        if (format === 'leaflet') {
          polygonData = feature.geometry;
        } else {
          polygonData = convertCoordinates(feature.geometry);
        }
        return { cca2, polygon: polygonData };
      });

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      // Save data in minified JSON format.
      await fs.writeFile(filePath, JSON.stringify(polygons), 'utf-8');
      await logInfo(`Fetched and saved country polygons (${format}) data.`);
      return polygons;
    } catch (error) {
      await logError(`Error in getCountryPolygons: ${error}`);
      throw error;
    }
  }
}
