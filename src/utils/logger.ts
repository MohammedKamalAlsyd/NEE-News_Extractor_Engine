import fs from 'fs/promises';
import path from 'path';
import { format, subDays, isBefore } from 'date-fns';
import { loadConfig } from '../config.js';

// Directory for storing log files
const logDir = path.join(process.cwd(), 'logs');

/**
 * Ensures the log directory exists.
 */
async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}

/**
 * Gets the current date in 'yyyy-MM-dd' format using local time.
 * @returns The formatted date string.
 */
function getCurrentDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Generates the log file path for a given date.
 * @param date - The date string in 'yyyy-MM-dd' format.
 * @returns The full path to the log file.
 */
function getLogFilePath(date: string): string {
  return path.join(logDir, `app-${date}.log`);
}

/**
 * Deletes log files older than the retention period specified in the config.
 */
async function deleteOldLogs(): Promise<void> {
  const config = await loadConfig();
  const retentionDays = config.logRetentionDays;
  const thresholdDate = subDays(new Date(), retentionDays);

  try {
    const files = await fs.readdir(logDir);
    for (const file of files) {
      if (file.startsWith('app-') && file.endsWith('.log')) {
        const dateStr = file.replace('app-', '').replace('.log', '');
        const fileDate = new Date(dateStr);
        if (isBefore(fileDate, thresholdDate)) {
          const filePath = path.join(logDir, file);
          await fs.unlink(filePath);
          console.log(`Deleted old log file: ${file}`);
        }
      }
    }
  } catch (err) {
    console.error('Failed to delete old log files:', err);
  }
}

/**
 * Writes a log message to the current day's log file with a local timestamp.
 * @param message - The message to log.
 */
export async function writeLog(message: string): Promise<void> {
  await ensureLogDir();
  const currentDate = getCurrentDate();
  const logFile = getLogFilePath(currentDate);
  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss'); // Local time
  const logMessage = `[${timestamp}] ${message}\n`;
  await fs.appendFile(logFile, logMessage, 'utf-8');
  await deleteOldLogs(); // Clean up old logs after each write
}

/**
 * Logs an informational message.
 * @param message - The info message to log.
 */
export async function logInfo(message: string): Promise<void> {
  await writeLog(`INFO: ${message}`);
}

/**
 * Logs an error message.
 * @param message - The error message to log.
 */
export async function logError(message: string): Promise<void> {
  await writeLog(`ERROR: ${message}`);
}