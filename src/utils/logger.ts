/**
 * Advanced Logging System
 * Provides structured logging with different levels and debugging capabilities
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
  error?: Error;
}

/**
 * Logger class with configurable log levels and structured output
 */
export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logHistory: LogEntry[] = [];
  private readonly MAX_HISTORY = 100;

  private constructor() {
    // Private constructor for singleton
    this.loadLogLevel();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Load log level from storage
   */
  private loadLogLevel(): void {
    try {
      const stored = localStorage.getItem('upload_tracker_log_level');
      if (stored) {
        this.logLevel = parseInt(stored, 10) as LogLevel;
      }
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Set log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    try {
      localStorage.setItem('upload_tracker_log_level', level.toString());
    } catch (error) {
      // Ignore storage errors
    }
  }

  /**
   * Get current log level
   */
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Log debug message
   */
  public debug(component: string, message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, component, message, data);
  }

  /**
   * Log info message
   */
  public info(component: string, message: string, data?: unknown): void {
    this.log(LogLevel.INFO, component, message, data);
  }

  /**
   * Log warning message
   */
  public warn(component: string, message: string, data?: unknown): void {
    this.log(LogLevel.WARN, component, message, data);
  }

  /**
   * Log error message
   */
  public error(
    component: string,
    message: string,
    error?: Error,
    data?: unknown
  ): void {
    this.log(LogLevel.ERROR, component, message, data, error);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    component: string,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    // Check if we should log this level
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      message,
      data,
      error,
    };

    // Add to history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.MAX_HISTORY) {
      this.logHistory.shift();
    }

    // Output to console
    this.outputToConsole(entry);
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${this.getLevelName(entry.level)}] [${entry.component}]`;
    const timestamp = entry.timestamp.toISOString();

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.INFO:
        console.log(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.WARN:
        console.warn(`${timestamp} ${prefix}`, entry.message, entry.data);
        break;
      case LogLevel.ERROR:
        console.error(
          `${timestamp} ${prefix}`,
          entry.message,
          entry.error,
          entry.data
        );
        break;
    }
  }

  /**
   * Get level name
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Get log history
   */
  public getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  /**
   * Clear log history
   */
  public clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Export logs as JSON
   */
  public exportLogs(): string {
    return JSON.stringify(this.logHistory, null, 2);
  }

  /**
   * Performance measurement
   */
  public measureTime(component: string, label: string): () => void {
    const startTime = performance.now();
    const startMark = `${component}-${label}-start`;
    const endMark = `${component}-${label}-end`;

    try {
      performance.mark(startMark);
    } catch (error) {
      // Ignore performance API errors
    }

    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      try {
        performance.mark(endMark);
        performance.measure(`${component}-${label}`, startMark, endMark);
      } catch (error) {
        // Ignore performance API errors
      }

      this.debug(component, `${label} took ${duration.toFixed(2)}ms`);
    };
  }
}

/**
 * Get singleton logger instance
 */
export const logger = Logger.getInstance();
