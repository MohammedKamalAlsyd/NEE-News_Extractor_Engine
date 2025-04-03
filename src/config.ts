import fs from 'fs/promises';
import path from 'path';

// Define the structure for proxy configuration
export interface ProxyConfig {
  enabled: boolean;       // Whether to use proxies
  apiUrl: string;         // Proxy connection string or API endpoint (depends on provider)
}

// Define the structure of the main configuration
export interface Config {
  timeout: number;            // Timeout for operations in milliseconds
  workerNodes: number;        // Number of concurrent worker nodes for Crawlee
  logRetentionDays: number;   // Number of days to retain log files
  targetLanguage: string;     // Target language for results ('auto' or language code like 'en', 'es')
  searchEngine: 'google' | 'bing' | 'duckduckgo' | 'brave' | 'ecosia'; // Search engine to use
  useSimilarWeb: boolean;     // Whether to scrape SimilarWeb
  useAhrefs: boolean;         // Whether to scrape Ahrefs
  proxyConfig?: ProxyConfig;  // Optional proxy configuration
}

// Cache the config to avoid repeated file reads
let config: Config | null = null;

/**
 * Loads the configuration from config.json.
 * @returns The parsed configuration object.
 */
export async function loadConfig(): Promise<Config> {
  if (config) return config;
  const configPath = path.join(process.cwd(), 'src', 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);

    // Provide default values for new optional fields if missing
    config.targetLanguage = config.targetLanguage ?? 'auto';
    config.searchEngine = config.searchEngine ?? 'google';
    config.useSimilarWeb = config.useSimilarWeb ?? true;
    config.useAhrefs = config.useAhrefs ?? true;
    config.proxyConfig = config.proxyConfig ?? { enabled: false, apiUrl: '' };


    // Basic validation (can be expanded)
    const validSearchEngines = ['google', 'bing', 'duckduckgo', 'brave', 'ecosia'];
    if (!validSearchEngines.includes(config.searchEngine)) {
        console.warn(`Invalid search engine "${config.searchEngine}" in config. Defaulting to "google".`);
        config.searchEngine = 'google';
    }


    return config;
  } catch (error) {
    console.error(`Failed to load or parse configuration from ${configPath}:`, error);
    // Provide a default fallback configuration
    return {
      timeout: 45000,
      workerNodes: 5,
      logRetentionDays: 3,
      targetLanguage: 'auto',
      searchEngine: 'google',
      useSimilarWeb: true,
      useAhrefs: true,
      proxyConfig: { enabled: false, apiUrl: '' }
    };
  }
}