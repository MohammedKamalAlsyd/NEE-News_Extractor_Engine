// src/types.ts

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
 * @values 'google' | 'bing' | 'duckduckgo' | 'brave' | 'ecosia'
 */
export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'brave' | 'ecosia';

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
     * @description The target language for translation (e.g., 'en', 'fr', 'de', or 'auto').
     */
    targetLanguage: string;
    /**
     * @property searchEngine
     * @description The search engine to use for initial searches.
     */
    searchEngine: SearchEngine;
    /**
     * @property useSimilarWeb
     * @description A boolean indicating whether to use SimilarWeb for data enrichment.
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
    /**
     * @property country
     * @description The region (using a CCA2 code or "auto") where the search is initiated.
     */
    country: string;
    /**
     * @property localization
     * @description ISO language code for country names. Allowed values match the files in the "countries" folder.
     */
    localization: string;
}



/**
 * Interface for processed country data.
 */
export interface ProcessedCountry {
  cca2: string;
  cca3: string;
  officialName: string;
  commonName: string;
  unMember: boolean;
  languages: string[];
}

/**
 * Interface for aggregated countries data by localization.
 */
export interface CountriesData {
  [lang: string]: Record<string, ProcessedCountry>;
}