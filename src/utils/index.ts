/**
 * Utilities Index
 * Central export point for all utility modules
 */

export { logger, Logger, LogLevel, type LogEntry } from './logger.js';
export {
  errorHandler,
  ErrorHandler,
  ErrorType,
  ErrorSeverity,
  type ErrorContext,
  type ErrorReport,
} from './error-handler.js';
export {
  debounce,
  throttle,
  rafDebounce,
  DOMBatcher,
  memoryManager,
  performanceMonitor,
  MemoryManager,
  PerformanceMonitor,
} from './performance.js';
