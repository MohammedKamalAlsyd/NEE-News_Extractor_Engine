// src/utils/logger.ts
import fs from 'fs/promises';
import path from 'path';
import { format, subDays, isBefore } from 'date-fns';

/**
 * @description Global flag to control logging. When false, all logging functions will exit early.
 */
let loggingEnabled = true;


/**
 * @description Disables logging by setting the loggingEnabled flag to false.
 */
export function disableLogging(): void {
  loggingEnabled = false;
}


const logDir = path.join(process.cwd(), 'logs');


/**
 * @async
 * @description Ensures that the log directory exists.
 */
async function ensureLogDir(): Promise<void> {
  if (!loggingEnabled) return;
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}


/**
 * @param {string} date - The date string in YYYY-MM-DD format.
 * @description Constructs the full log file path for a given date.
 * @returns {string} The full path to the log file.
 */
function getLogFilePath(date: string): string {
  return path.join(logDir, `app-${date}.log`);
}

/**
 * @async
 * @description Deletes log files that are older than the retention period.
 * @returns {Promise<void>}
 */
export async function deleteOldLogs(logRetentionDays:number): Promise<void> {
  if (!loggingEnabled) return;
  const thresholdDate = subDays(new Date(), logRetentionDays);

  try {
    await ensureLogDir();
    const files = await fs.readdir(logDir);
    for (const file of files) {
      if (file.startsWith('app-') && file.endsWith('.log')) {
        const dateStr = file.replace('app-', '').replace('.log', '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          try {
            const fileDate = new Date(dateStr);
            if (!isNaN(fileDate.getTime()) && isBefore(fileDate, thresholdDate)) {
              const filePath = path.join(logDir, file);
              await fs.unlink(filePath);
              console.log(`[Logger] Deleted old log file: ${file}`);
            }
          } catch (parseError) {
            console.error(`[Logger] Failed to parse date from log file name: ${file}`, parseError);
          }
        }
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') console.error('[Logger] Failed to delete old log files:', err);
  }
}

/**
 * @async
 * @param {string} level - The log level (e.g., INFO, WARNING, ERROR).
 * @param {string} message - The log message.
 * @description Writes a log entry to the current day's log file.
 * @returns {Promise<void>}
 */
async function writeLog(level: string, message: string): Promise<void> {
  if (!loggingEnabled) return;
  await ensureLogDir();
  const currentDate = format(new Date(), 'yyyy-MM-dd');
  const logFile = getLogFilePath(currentDate);
  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  try {
    await fs.appendFile(logFile, logMessage, 'utf-8');
  } catch (err) {
    console.error(`[Logger] Failed to write to log file ${logFile}:`, err);
  }
}

/**
 * @async
 * @param {string} message - The message to log.
 * @param {string} [context] - Optional context for the log message.
 * @description Logs an informational message.
 * @returns {Promise<void>}
 */
export async function logInfo(message: string, context?: string): Promise<void> {
  if (!loggingEnabled) return;
  const logMsg = context ? `[${context}] ${message}` : message;
  await writeLog('INFO', logMsg);
}

/**
 * Logs a warning message.
 *
 * @async
 * @function logWarning
 * @param {string} message - The warning message.
 * @param {string} [context] - Optional context for the warning.
 * @returns {Promise<void>}
 */
export async function logWarning(message: string, context?: string): Promise<void> {
  if (!loggingEnabled) return;
  const logMsg = context ? `[${context}] ${message}` : message;
  console.warn(`WARNING: ${logMsg}`);
  await writeLog('WARNING', logMsg);
}

/**
 * Logs an error message.
 *
 * @async
 * @function logError
 * @param {string} message - The error message.
 * @param {string} [context] - Optional context for the error.
 * @param {any} [error] - Optional error object to log additional error details.
 * @returns {Promise<void>}
 */
export async function logError(message: string, context?: string, error?: any): Promise<void> {
  if (!loggingEnabled) return;
  let logMsg = context ? `[${context}] ${message}` : message;
  if (error) {
    logMsg += ` | Error: ${error instanceof Error ? error.message : String(error)}`;
    if (error instanceof Error && error.stack) logMsg += `\nStack: ${error.stack}`;
  }
  console.error(`ERROR: ${logMsg}`, error);
  await writeLog('ERROR', logMsg);
}
