/**
 * @description Allowed localization codes for country names, based on REST Countries API translations.
 */
export const allowedLocalizations = [
  'ara', 'bre', 'ces', 'cym', 'deu', 'eng', 'est', 'fin', 'fra',
  'hrv', 'hun', 'ita', 'jpn', 'kor', 'nld', 'per', 'pol', 'por',
  'rus', 'slk', 'spa', 'srp', 'swe', 'tur', 'urd', 'zho'
] as const; // Use 'as const' for stricter typing

/**
 * @type LocalizationCode
 * @description Represents a valid language code for country name localization.
 */
export type LocalizationCode = typeof allowedLocalizations[number];


/**
 * @interface ProxyConfig
 * @description Proxy configuration for making requests via a proxy.
 */
export interface ProxyConfig {
  /**
  * @property enabled
  * @description Indicates whether the proxy is enabled.
  */
  enabled: boolean;
  /**
  * @property apiUrl
  * @description The URL of the proxy server.
  */
  apiUrl: string;
}

/**
 * @interface CrawleeConfig
 * @description Crawlee configuration settings used for state persistence and memory limits.
 */
export interface CrawleeConfig {
  /**
  * @property persistStateIntervalMillis
  * @description The interval in milliseconds at which the crawler state is persisted.
  */
  persistStateIntervalMillis: number;
  /**
  * @property CRAWLEE_MEMORY_MBYTES
  * @description The maximum memory the crawler can use in megabytes.
  */
  CRAWLEE_MEMORY_MBYTES: number;
  /**
  * @property storageClientOptions
  * @description Options for the Crawlee storage client.
  */
  storageClientOptions: {
  /**
    * @property localDataDirectory
    * @description The local directory where crawler data is stored.
    */
  localDataDirectory: string;
  /**
    * @property localStorage
    * @description The name of the local storage used by Crawlee.
    */
  localStorage: string;
  };
}

/**
 * @type SearchEngine
 * @description Allowed search engine values.
 * @values 'google' | 'bing' | 'duckduckgo'
 */
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' ;

/**
 * @interface Config
 * @description Main configuration interface.
 */
export interface Config {
  /**
  * @property timeout
  * @description The timeout in milliseconds for network requests.
  */
  timeout: number;
  /**
  * @property workerNodes
  * @description The number of worker nodes to use for parallel processing.
  */
  workerNodes: number;
  /**
  * @property logRetentionDays
  * @description The number of days to retain log files.
  */
  logRetentionDays: number;
  /**
  * @property enableLogging
  * @description A boolean indicating whether logging is enabled.
  */
  enableLogging: boolean;
  /**
  * @property targetLanguage
  * @description Default target language code (used elsewhere, not directly by getCountryData).
  */
  targetLanguage: string; // Could still be useful as a default if no localizations passed to getCountryData
  /**
  * @property crawleeConfig
  * @description Configuration settings for Crawlee.
  */
  crawleeConfig: CrawleeConfig;
  /**
  * @property proxyConfig
  * @description Configuration for using a proxy server.
  */
  proxyConfig: ProxyConfig;
  /**
  * @property searchEnginePages
  * @description The number of search engine result pages to process.
  */
  searchEnginePages: number;
  /**
  * @property articlesPerDomain
  * @description The maximum number of articles to extract from each domain.
  */
  articlesPerDomain: number;
  /**
  * @property pagesToCrawlPerDomain
  * @description The maximum number of pages to crawl per domain.
  */
  pagesToCrawlPerDomain: number;
}


/**
 * @interface ProcessedCountry
 * @description Interface for the *complete* processed country data stored in the cache file,
 * containing names in *all* available localizations fetched from the source.
 */
export interface ProcessedCountry {
  /** The ISO 3166-1 alpha-2 country code. */
  cca2: string;
  /** The ISO 3166-1 alpha-3 country code. */
  cca3: string;
  /** Indicates if the country is a UN member. */
  unMember: boolean;
  /** An array of official language codes (e.g., 'eng', 'fra'). */
  languages: string[];
  /**
  * A record mapping language codes (e.g., 'eng', 'ara', 'fra')
  * to the common name of the country in that language. Contains all translations available from the source.
  */
  names: Record<string, string>; // Store all available names here
}

/**
 * @type AllCountriesData
 * @description Represents the entire collection of *complete* processed country data, keyed by cca2 code.
 * This is the structure loaded into memory and stored in the JSON file.
 */
export type AllCountriesData = Record<string, ProcessedCountry>;

/**
 * @interface LocalizedCountryData
 * @description Interface for country data returned by `getCountryData`, containing only
 * the names for the *requested* localizations.
 */
export interface LocalizedCountryData {
    /** The ISO 3166-1 alpha-2 country code. */
    cca2: string;
    /** The ISO 3166-1 alpha-3 country code. */
    cca3: string;
    /** Indicates if the country is a UN member. */
    unMember: boolean;
    /** An array of official language codes (e.g., 'eng', 'fra'). */
    languages: string[];
    /**
    * A record mapping *requested* language codes (e.g., 'eng', 'fra')
    * to the common name of the country in that language. Only includes names that were requested AND available.
    */
    names: Partial<Record<LocalizationCode, string>>; // Only requested & available names
}

/**
 * @interface CountryPolygon
 * @description Represents the polygon data for a single country in standard GeoJSON format.
 */
export interface CountryPolygon {
  /** The ISO 3166-1 alpha-2 country code. */
  cca2: string;
  /**
  * The polygon geometry data following standard GeoJSON structure ([longitude, latitude]).
  * Can be a Polygon or MultiPolygon type.
  */
  polygon: GeoJSON.Geometry; // Use standard GeoJSON types if installed (@types/geojson) or 'any'
}