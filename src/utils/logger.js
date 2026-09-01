import winston from 'winston';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, '../../logs');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const fileTransport = new winston.transports.File({
  filename: path.join(logDir, 'activity.log'),
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}]: ${message}`)
  )
});

const winstonLogger = winston.createLogger({
  transports: [fileTransport]
});

export const logger = {
  info: (msg) => {
    console.log(`${chalk.blue('[INFO]')} ${msg}`);
    winstonLogger.info(msg);
  },
  success: (msg) => {
    console.log(`${chalk.green('[SUCCESS]')} ${msg}`);
    winstonLogger.info(`SUCCESS: ${msg}`);
  },
  warn: (msg) => {
    console.log(`${chalk.yellow('[WARN]')} ${msg}`);
    winstonLogger.warn(msg);
  },
  error: (msg, err = null) => {
    const errorDetails = err ? ` - ${err.message || err}` : '';
    console.log(`${chalk.red('[ERROR]')} ${msg}${chalk.redBright(errorDetails)}`);
    winstonLogger.error(`${msg}${errorDetails}`);
  },
  account: (accountId, msg) => {
    console.log(`${chalk.cyan(`[${accountId}]`)} ${msg}`);
    winstonLogger.info(`[${accountId}] ${msg}`);
  },
  debug: (msg) => {
    if (process.env.DEBUG) {
      console.log(`${chalk.magenta('[DEBUG]')} ${msg}`);
    }
  }
};
