import fs from 'fs/promises';
import path from 'path';

// Define the structure of the configuration
interface Config {
  timeout: number;          // Timeout for operations in milliseconds
  workerNodes: number;      // Number of concurrent worker nodes for Crawlee
  logRetentionDays: number; // Number of days to retain log files
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
  const content = await fs.readFile(configPath, 'utf-8');
  config = JSON.parse(content);
  return config;
}