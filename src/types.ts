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
   * @description The target language for translation (e.g., 'en', 'fr', 'de', or 'auto'). Not directly used by getCountriesData saving logic anymore.
   */
  targetLanguage: string;
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
 * @description Interface for processed country data containing names in multiple localizations.
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
   * to the common name of the country in that language.
   */
  names: Record<string, string>;
}

/**
 * @type AllCountriesData
 * @description Represents the entire collection of processed country data, keyed by cca2 code.
 */
export type AllCountriesData = Record<string, ProcessedCountry>;


/**
 * @type PolygonFormat
 * @description Defines the possible formats for polygon coordinate data.
 * @values 'google' | 'leaflet'
 * 'google': Coordinates formatted as [latitude, longitude] arrays, suitable for Google Maps API.
 * 'leaflet': Coordinates formatted as [longitude, latitude] arrays (standard GeoJSON), suitable for Leaflet.
 */
export type PolygonFormat = 'google' | 'leaflet';

/**
 * @interface CountryPolygon
 * @description Represents the polygon data for a single country.
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