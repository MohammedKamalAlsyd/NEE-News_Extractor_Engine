import fs from 'fs/promises';
import path from 'path';
import { format, subDays, isBefore } from 'date-fns';
// Assuming config loads logRetentionDays correctly
// import { loadConfig } from '../config.js'; // Make sure this path is correct

// Directory for storing log files
const logDir = path.join(process.cwd(), 'logs');
let logRetentionDays = 7; // Default value, will be updated by config

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
 * Loads configuration and sets retention days. Should be called once at startup ideally.
 * For simplicity here, we call it before deleting logs.
 */
async function loadLoggingConfig(): Promise<void> {
    try {
        // const config = await loadConfig(); // Uncomment if you have this
        // logRetentionDays = config.logRetentionDays || 7; // Use config or default
        logRetentionDays = 7; // Using default for now if loadConfig isn't set up
    } catch (err) {
        console.error('Failed to load config for logger:', err);
        // Keep the default
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
    // Use template literal correctly
    return path.join(logDir, `app-${date}.log`);
}

/**
 * Deletes log files older than the retention period specified in the config.
 */
async function deleteOldLogs(): Promise<void> {
    await loadLoggingConfig(); // Ensure retention days are loaded
    const thresholdDate = subDays(new Date(), logRetentionDays);

    try {
        await ensureLogDir(); // Make sure dir exists before reading
        const files = await fs.readdir(logDir);
        for (const file of files) {
            if (file.startsWith('app-') && file.endsWith('.log')) {
                const dateStr = file.replace('app-', '').replace('.log', '');
                // Basic check for valid date format before parsing
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    try {
                        const fileDate = new Date(dateStr); // Parses in UTC, comparison might be slightly off depending on timezone, but generally okay for daily logs
                        if (!isNaN(fileDate.getTime()) && isBefore(fileDate, thresholdDate)) {
                            const filePath = path.join(logDir, file);
                            await fs.unlink(filePath);
                            // Use console.log for internal logger messages to avoid infinite loops if logging fails
                            console.log(`[Logger] Deleted old log file: ${file}`);
                        }
                    } catch (parseError) {
                         console.error(`[Logger] Failed to parse date from log file name: ${file}`, parseError);
                    }
                }
            }
        }
    } catch (err: any) {
         // Check if error is just "directory not found" which is fine if it's the first run
        if (err.code !== 'ENOENT') {
            console.error('[Logger] Failed to delete old log files:', err);
        }
    }
}

/**
 * Writes a log message to the current day's log file with a local timestamp.
 * @param level - The log level (e.g., INFO, WARNING, ERROR).
 * @param message - The message to log.
 */
async function writeLog(level: string, message: string): Promise<void> {
    await ensureLogDir();
    const currentDate = getCurrentDate();
    const logFile = getLogFilePath(currentDate);
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss'); // Local time
     // Use template literal correctly
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;

    try {
        await fs.appendFile(logFile, logMessage, 'utf-8');
    } catch (err) {
        console.error(`[Logger] Failed to write to log file ${logFile}:`, err)
    }
    // Clean up old logs periodically, maybe not on every write for performance.
    // Consider running deleteOldLogs once per application start or on a timer.
    // For simplicity, keeping it here for now.
    await deleteOldLogs();
}

/**
 * Logs an informational message.
 * @param message - The info message to log.
 * @param context - Optional context string (e.g., domain name)
 */
export async function logInfo(message: string, context?: string): Promise<void> {
    const logMsg = context ? `[${context}] ${message}` : message;
    console.log(`INFO: ${logMsg}`); // Also log to console
    await writeLog('INFO', logMsg);
}

/**
 * Logs a warning message.
 * @param message - The warning message to log.
 * @param context - Optional context string (e.g., domain name)
 */
export async function logWarning(message: string, context?: string): Promise<void> {
    const logMsg = context ? `[${context}] ${message}` : message;
    console.warn(`WARNING: ${logMsg}`); // Also log to console
    await writeLog('WARNING', logMsg);
}

/**
 * Logs an error message.
 * @param message - The error message to log.
 * @param context - Optional context string (e.g., domain name)
 * @param error - Optional error object
 */
export async function logError(message: string, context?: string, error?: any): Promise<void> {
    let logMsg = context ? `[${context}] ${message}` : message;
    if (error) {
        logMsg += ` | Error: ${error instanceof Error ? error.message : String(error)}`;
        // Optionally log stack trace
        if (error instanceof Error && error.stack) {
            logMsg += `\nStack: ${error.stack}`;
        }
    }
    console.error(`ERROR: ${logMsg}`, error); // Log full error object to console if available
    await writeLog('ERROR', logMsg);
}
