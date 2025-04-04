// src/config.ts
import fs from 'fs/promises';
import path from 'path';

export interface ProxyConfig {
  enabled: boolean;
  apiUrl: string;
}

export interface Config {
  timeout: number;
  workerNodes: number;
  logRetentionDays: number;
  targetLanguage: string;
  searchEngine: 'google' | 'bing' | 'duckduckgo' | 'brave' | 'ecosia';
  useSimilarWeb: boolean;
  useAhrefs: boolean;
  proxyConfig?: ProxyConfig;
  searchEnginePages: number;
  articlesPerDomain: number;
  pagesToCrawlPerDomain: number;
}

let config: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (config) return config;
  const configPath = path.join(process.cwd(), 'src', 'config.json');
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);

    config.targetLanguage = config.targetLanguage ?? 'auto';
    config.searchEngine = config.searchEngine ?? 'google';
    config.useSimilarWeb = config.useSimilarWeb ?? true;
    config.useAhrefs = config.useAhrefs ?? true;
    config.proxyConfig = config.proxyConfig ?? { enabled: false, apiUrl: '' };
    config.searchEnginePages = config.searchEnginePages ?? 10;
    config.articlesPerDomain = config.articlesPerDomain ?? 50;
    config.pagesToCrawlPerDomain = config.pagesToCrawlPerDomain ?? 10;

    const validSearchEngines = ['google', 'bing', 'duckduckgo', 'brave', 'ecosia'];
    if (!validSearchEngines.includes(config.searchEngine)) {
      console.warn(`Invalid search engine "${config.searchEngine}" in config. Defaulting to "google".`);
      config.searchEngine = 'google';
    }

    return config;
  } catch (error) {
    console.error(`Failed to load configuration from ${configPath}:`, error);
    return {
      timeout: 45000,
      workerNodes: 5,
      logRetentionDays: 3,
      targetLanguage: 'auto',
      searchEngine: 'google',
      useSimilarWeb: true,
      useAhrefs: true,
      proxyConfig: { enabled: false, apiUrl: '' },
      searchEnginePages: 10,
      articlesPerDomain: 50,
      pagesToCrawlPerDomain: 10,
    };
  }
}