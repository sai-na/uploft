/**
 * Performance Utilities
 * Debouncing, throttling, and memory management helpers
 */

import { logger } from './logger.js';

/**
 * Debounce function to limit execution rate
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: unknown, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle function to limit execution frequency
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function (this: unknown, ...args: Parameters<T>): void {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Request animation frame wrapper for debouncing DOM updates
 */
export function rafDebounce<T extends (...args: unknown[]) => unknown>(
  func: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;

  return function (this: unknown, ...args: Parameters<T>): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    rafId = requestAnimationFrame(() => {
      func.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * Batch DOM updates using requestAnimationFrame
 */
export class DOMBatcher {
  private updates: Array<() => void> = [];
  private scheduled = false;

  /**
   * Add update to batch
   */
  public add(update: () => void): void {
    this.updates.push(update);
    this.schedule();
  }

  /**
   * Schedule batch execution
   */
  private schedule(): void {
    if (this.scheduled) {
      return;
    }

    this.scheduled = true;
    requestAnimationFrame(() => {
      this.flush();
    });
  }

  /**
   * Flush all pending updates
   */
  private flush(): void {
    const startTime = performance.now();

    for (const update of this.updates) {
      try {
        update();
      } catch (error) {
        logger.error('DOMBatcher', 'Update failed', error as Error);
      }
    }

    this.updates = [];
    this.scheduled = false;

    const duration = performance.now() - startTime;
    logger.debug('DOMBatcher', `Flushed batch in ${duration.toFixed(2)}ms`);
  }

  /**
   * Clear pending updates
   */
  public clear(): void {
    this.updates = [];
    this.scheduled = false;
  }
}

/**
 * Memory manager for tracking and cleaning up resources
 */
export class MemoryManager {
  private static instance: MemoryManager;
  private weakRefs: Set<WeakRef<object>> = new Set();
  private cleanupCallbacks: Map<string, () => void> = new Map();

  private constructor() {
    // Private constructor for singleton
    this.startMemoryMonitoring();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  /**
   * Track object with WeakRef
   */
  public track<T extends object>(obj: T): WeakRef<T> {
    const ref = new WeakRef(obj);
    this.weakRefs.add(ref);
    return ref;
  }

  /**
   * Register cleanup callback
   */
  public registerCleanup(id: string, callback: () => void): void {
    this.cleanupCallbacks.set(id, callback);
  }

  /**
   * Unregister cleanup callback
   */
  public unregisterCleanup(id: string): void {
    this.cleanupCallbacks.delete(id);
  }

  /**
   * Execute cleanup callback
   */
  public cleanup(id: string): void {
    const callback = this.cleanupCallbacks.get(id);
    if (callback) {
      try {
        callback();
      } catch (error) {
        logger.error(
          'MemoryManager',
          `Cleanup failed for ${id}`,
          error as Error
        );
      }
      this.cleanupCallbacks.delete(id);
    }
  }

  /**
   * Execute all cleanup callbacks
   */
  public cleanupAll(): void {
    const startTime = performance.now();
    let count = 0;

    for (const [id, callback] of this.cleanupCallbacks) {
      try {
        callback();
        count++;
      } catch (error) {
        logger.error(
          'MemoryManager',
          `Cleanup failed for ${id}`,
          error as Error
        );
      }
    }

    this.cleanupCallbacks.clear();
    this.weakRefs.clear();

    const duration = performance.now() - startTime;
    logger.info(
      'MemoryManager',
      `Cleaned up ${count} resources in ${duration.toFixed(2)}ms`
    );
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    // Monitor every 60 seconds
    setInterval(() => {
      this.checkMemory();
    }, 60000);
  }

  /**
   * Check memory usage
   */
  private checkMemory(): void {
    // Clean up dead WeakRefs
    const deadRefs: WeakRef<object>[] = [];
    for (const ref of this.weakRefs) {
      if (ref.deref() === undefined) {
        deadRefs.push(ref);
      }
    }

    for (const ref of deadRefs) {
      this.weakRefs.delete(ref);
    }

    if (deadRefs.length > 0) {
      logger.debug(
        'MemoryManager',
        `Cleaned up ${deadRefs.length} dead references`
      );
    }

    // Log memory info if available
    if ('memory' in performance) {
      const memory = (
        performance as unknown as {
          memory: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }
      ).memory;
      const usedMB = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
      const totalMB = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
      const limitMB = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);

      logger.debug(
        'MemoryManager',
        `Memory: ${usedMB}MB used / ${totalMB}MB total (limit: ${limitMB}MB)`
      );
    }
  }

  /**
   * Get memory statistics
   */
  public getStats(): {
    trackedObjects: number;
    cleanupCallbacks: number;
    memoryUsage?: { used: number; total: number; limit: number };
  } {
    const stats: {
      trackedObjects: number;
      cleanupCallbacks: number;
      memoryUsage?: { used: number; total: number; limit: number };
    } = {
      trackedObjects: this.weakRefs.size,
      cleanupCallbacks: this.cleanupCallbacks.size,
    };

    if ('memory' in performance) {
      const memory = (
        performance as unknown as {
          memory: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          };
        }
      ).memory;
      stats.memoryUsage = {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      };
    }

    return stats;
  }
}

/**
 * Performance monitor for tracking metrics
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Record metric
   */
  public record(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * Get metric statistics
   */
  public getStats(
    name: string
  ): { min: number; max: number; avg: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    return { min, max, avg, count: values.length };
  }

  /**
   * Clear metrics
   */
  public clear(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Get all metrics
   */
  public getAllMetrics(): Map<string, number[]> {
    return new Map(this.metrics);
  }
}

/**
 * Get singleton memory manager instance
 */
export const memoryManager = MemoryManager.getInstance();

/**
 * Get singleton performance monitor instance
 */
export const performanceMonitor = PerformanceMonitor.getInstance();
