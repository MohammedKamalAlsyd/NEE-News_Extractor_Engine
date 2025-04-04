// src/utils/logger.ts
import fs from 'fs/promises';
import path from 'path';
import { format, subDays, isBefore } from 'date-fns';

const logDir = path.join(process.cwd(), 'logs');
let logRetentionDays = 7;

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}

async function loadLoggingConfig(): Promise<void> {
  logRetentionDays = 7; // Static default for simplicity
}

function getCurrentDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function getLogFilePath(date: string): string {
  return path.join(logDir, `app-${date}.log`);
}

async function deleteOldLogs(): Promise<void> {
  await loadLoggingConfig();
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

async function writeLog(level: string, message: string): Promise<void> {
  await ensureLogDir();
  const currentDate = getCurrentDate();
  const logFile = getLogFilePath(currentDate);
  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${timestamp}] [${level}] ${message}\n`;

  try {
    await fs.appendFile(logFile, logMessage, 'utf-8');
  } catch (err) {
    console.error(`[Logger] Failed to write to log file ${logFile}:`, err);
  }
  await deleteOldLogs();
}

export async function logInfo(message: string, context?: string): Promise<void> {
  const logMsg = context ? `[${context}] ${message}` : message;
  console.log(`INFO: ${logMsg}`);
  await writeLog('INFO', logMsg);
}

export async function logWarning(message: string, context?: string): Promise<void> {
  const logMsg = context ? `[${context}] ${message}` : message;
  console.warn(`WARNING: ${logMsg}`);
  await writeLog('WARNING', logMsg);
}

export async function logError(message: string, context?: string, error?: any): Promise<void> {
  let logMsg = context ? `[${context}] ${message}` : message;
  if (error) {
    logMsg += ` | Error: ${error instanceof Error ? error.message : String(error)}`;
    if (error instanceof Error && error.stack) logMsg += `\nStack: ${error.stack}`;
  }
  console.error(`ERROR: ${logMsg}`, error);
  await writeLog('ERROR', logMsg);
}