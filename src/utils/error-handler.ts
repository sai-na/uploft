/**
 * Comprehensive Error Handling Framework
 * Provides structured error handling with recovery strategies
 */

import { logger } from './logger.js';

export enum ErrorType {
  DOM_SELECTOR = 'DOM_SELECTOR',
  CHROME_API = 'CHROME_API',
  NETWORK = 'NETWORK',
  STORAGE = 'STORAGE',
  PARSING = 'PARSING',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface ErrorContext {
  component: string;
  operation: string;
  details?: Record<string, unknown>;
}

export interface ErrorReport {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  error: Error;
  context: ErrorContext;
  timestamp: Date;
  recovered: boolean;
}

/**
 * Error handler class
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorReports: ErrorReport[] = [];
  private readonly MAX_REPORTS = 50;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle error with automatic type detection
   */
  public handleError(
    error: Error,
    context: ErrorContext,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): void {
    const type = this.detectErrorType(error);
    this.logError(type, severity, error, context, false);
  }

  /**
   * Handle DOM selector error
   */
  public handleDOMError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.DOM_SELECTOR,
      recovered ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      error,
      context,
      recovered
    );
  }

  /**
   * Handle Chrome API error
   */
  public handleChromeAPIError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.CHROME_API,
      recovered ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      error,
      context,
      recovered
    );
  }

  /**
   * Handle network error
   */
  public handleNetworkError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.NETWORK,
      recovered ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      error,
      context,
      recovered
    );
  }

  /**
   * Handle storage error
   */
  public handleStorageError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.STORAGE,
      recovered ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
      error,
      context,
      recovered
    );
  }

  /**
   * Handle parsing error
   */
  public handleParsingError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.PARSING,
      recovered ? ErrorSeverity.LOW : ErrorSeverity.MEDIUM,
      error,
      context,
      recovered
    );
  }

  /**
   * Handle validation error
   */
  public handleValidationError(
    error: Error,
    context: ErrorContext,
    recovered: boolean = false
  ): void {
    this.logError(
      ErrorType.VALIDATION,
      ErrorSeverity.LOW,
      error,
      context,
      recovered
    );
  }

  /**
   * Log error to reports
   */
  private logError(
    type: ErrorType,
    severity: ErrorSeverity,
    error: Error,
    context: ErrorContext,
    recovered: boolean
  ): void {
    const report: ErrorReport = {
      type,
      severity,
      message: error.message,
      error,
      context,
      timestamp: new Date(),
      recovered,
    };

    // Add to reports
    this.errorReports.push(report);
    if (this.errorReports.length > this.MAX_REPORTS) {
      this.errorReports.shift();
    }

    // Log to logger
    logger.error(
      context.component,
      `${type} error in ${context.operation}: ${error.message}`,
      error,
      {
        severity,
        recovered,
        details: context.details,
      }
    );
  }

  /**
   * Detect error type from error object
   */
  private detectErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('selector') || message.includes('element')) {
      return ErrorType.DOM_SELECTOR;
    }
    if (message.includes('chrome') || message.includes('extension')) {
      return ErrorType.CHROME_API;
    }
    if (message.includes('network') || message.includes('fetch')) {
      return ErrorType.NETWORK;
    }
    if (message.includes('storage') || message.includes('quota')) {
      return ErrorType.STORAGE;
    }
    if (message.includes('parse') || message.includes('json')) {
      return ErrorType.PARSING;
    }
    if (message.includes('invalid') || message.includes('validation')) {
      return ErrorType.VALIDATION;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Get error reports
   */
  public getReports(): ErrorReport[] {
    return [...this.errorReports];
  }

  /**
   * Get reports by type
   */
  public getReportsByType(type: ErrorType): ErrorReport[] {
    return this.errorReports.filter((report) => report.type === type);
  }

  /**
   * Get reports by severity
   */
  public getReportsBySeverity(severity: ErrorSeverity): ErrorReport[] {
    return this.errorReports.filter((report) => report.severity === severity);
  }

  /**
   * Clear error reports
   */
  public clearReports(): void {
    this.errorReports = [];
  }

  /**
   * Export error reports as JSON
   */
  public exportReports(): string {
    return JSON.stringify(
      this.errorReports.map((report) => ({
        ...report,
        error: {
          message: report.error.message,
          name: report.error.name,
          stack: report.error.stack,
        },
      })),
      null,
      2
    );
  }

  /**
   * Wrap async function with error handling
   */
  public wrapAsync<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    defaultValue?: T
  ): Promise<T | undefined> {
    return fn().catch((error) => {
      this.handleError(error as Error, context);
      return defaultValue;
    });
  }

  /**
   * Wrap sync function with error handling
   */
  public wrapSync<T>(
    fn: () => T,
    context: ErrorContext,
    defaultValue?: T
  ): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.handleError(error as Error, context);
      return defaultValue;
    }
  }
}

/**
 * Get singleton error handler instance
 */
export const errorHandler = ErrorHandler.getInstance();
