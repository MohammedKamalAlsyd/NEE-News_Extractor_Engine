// src/config/config.ts
import fs from 'fs/promises';
import path from 'path';
import { Config } from '../types.js';
import {deleteOldLogs} from '../core/logger.js';

/**
 * @description Determine the language of returned countires names.
 */
const allowedLocalizations = [
  'ara', 'bre', 'ces', 'cym', 'deu', 'eng', 'est', 'fin', 'fra',
  'hrv', 'hun', 'ita', 'jpn', 'kor', 'nld', 'per', 'pol', 'por',
  'rus', 'slk', 'spa', 'srp', 'swe', 'tur', 'urd', 'zho'
];

/**
 * @description Singleton instance of configuration; initially not loaded.
 */
let config: Config | null = null;


/**
 * @description For Debugging Purpose only While Development.
 */
function disableLogging() {
  const noop = () => { };
  console.log = noop;
  console.warn = noop;
  console.error = noop;
}


/**
 * @async
 * @description Reads and parses the configuration JSON file. If any value is missing,
 * default values are set. Also validates search engine and localization.
 * @returns {Promise<Config>} The loaded configuration object.
 */
export async function loadConfig(): Promise<Config> {
  if (config) return config;
  const configPath = path.join(process.cwd(), 'src', 'config', 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    // Assert the parsed object as Config to help TypeScript.
    config = JSON.parse(content) as Config;

    // Set defaults for missing values.
    config.targetLanguage = config.targetLanguage ?? 'auto';
    config.searchEngine = config.searchEngine ?? 'google';
    config.useSimilarWeb = config.useSimilarWeb ?? true;
    config.useAhrefs = config.useAhrefs ?? true;
    config.enableLogging = config.enableLogging ?? true;
    config.crawleeConfig = config.crawleeConfig ?? {
      persistStateIntervalMillis: 10000,
      CRAWLEE_MEMORY_MBYTES: 8192,
      storageClientOptions: {
        localDataDirectory: './storage',
        localStorage: 'gwir'
      }
    };
    config.proxyConfig = config.proxyConfig ?? { enabled: false, apiUrl: '' };
    config.searchEnginePages = config.searchEnginePages ?? 10;
    config.articlesPerDomain = config.articlesPerDomain ?? 50;
    config.pagesToCrawlPerDomain = config.pagesToCrawlPerDomain ?? 10;
    config.country = config.country ?? 'auto';
    config.localization = config.localization ?? 'eng';

    // Validate search engine value.
    const validSearchEngines = ['google', 'bing', 'duckduckgo', 'brave', 'ecosia'];
    if (!validSearchEngines.includes(config.searchEngine)) {
      console.warn(`Invalid search engine "${config.searchEngine}" in config. Defaulting to "google".`);
      config.searchEngine = 'google';
    }

    // Validate localization value.
    if (!allowedLocalizations.includes(config.localization)) {
      console.warn(`Invalid localization "${config.localization}" in config. Defaulting to "eng".`);
      config.localization = 'eng';
    }

    // Disable logging if the config flag is false.
    if (!config.enableLogging) {
      disableLogging();
    }
    else {
      deleteOldLogs(config.logRetentionDays ?? 3);
    }

    return config;
  } catch (error) {
    console.error(`Failed to load configuration from ${configPath}:`, error);
    // Fallback defaults if the configuration file cannot be loaded.
    config = {
      timeout: 45000,
      workerNodes: 5,
      logRetentionDays: 3,
      enableLogging: true,
      targetLanguage: 'auto',
      searchEngine: 'google',
      useSimilarWeb: true,
      useAhrefs: true,
      crawleeConfig: {
        persistStateIntervalMillis: 10000,
        CRAWLEE_MEMORY_MBYTES: 8192,
        storageClientOptions: {
          localDataDirectory: './storage',
          localStorage: 'gwir'
        }
      },
      proxyConfig: { enabled: false, apiUrl: '' },
      searchEnginePages: 10,
      articlesPerDomain: 50,
      pagesToCrawlPerDomain: 10,
      country: 'auto',
      localization: 'eng'
    };
    return config;
  }
}