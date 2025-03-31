import fs from 'fs/promises';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs'); // Logs directory.
const logFile = path.join(logDir, 'app.log');      // Log file path.

/**
 * Ensure the log directory exists.
 */
async function ensureLogDir() {
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}

/**
 * Returns the current timestamp in ISO format.
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Writes a log message to the log file.
 * Appends the log message with a timestamp.
 * @param message The log message to write.
 */
export async function writeLog(message: string): Promise<void> {
  await ensureLogDir();
  const logMessage = `[${getTimestamp()}] ${message}\n`;
  await fs.appendFile(logFile, logMessage, 'utf-8');
}

/**
 * Logs an informational message.
 * @param message The info message.
 */
export async function logInfo(message: string): Promise<void> {
  await writeLog(`INFO: ${message}`);
}

/**
 * Logs an error message.
 * @param message The error message.
 */
export async function logError(message: string): Promise<void> {
  await writeLog(`ERROR: ${message}`);
}
