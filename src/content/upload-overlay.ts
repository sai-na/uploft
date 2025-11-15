/**
 * Upload Overlay - UI component for displaying upload progress
 * Provides floating overlay with progress cards, animations, and drag functionality
 */

import type { UploadInfo } from '../types/upload.types.js';
import { UploadStatus } from '../types/upload.types.js';
import type { ControlResult } from './upload-controls.js';
import { logger } from '../utils/logger.js';
import { debounce } from '../utils/performance.js';

/**
 * Overlay position configuration
 */
interface OverlayPosition {
  bottom?: string;
  right?: string;
  top?: string;
  left?: string;
}

/**
 * Overlay state for persistence
 */
interface OverlayState {
  minimized: boolean;
  position: OverlayPosition;
}

/**
 * Control action callbacks
 */
export interface UploadControlCallbacks {
  onCancel?: (upload: UploadInfo) => Promise<ControlResult>;
  onRetry?: (upload: UploadInfo) => Promise<ControlResult>;
  onShowLocation?: (upload: UploadInfo) => Promise<ControlResult>;
}

/**
 * Upload Overlay UI Component
 */
export class UploadOverlay {
  /** Root overlay container element */
  private container: HTMLElement | null = null;

  /** Header element with title and controls */
  private header: HTMLElement | null = null;

  /** Upload list container */
  private uploadList: HTMLElement | null = null;

  /** Map of upload ID to card element */
  private uploadCards: Map<string, HTMLElement> = new Map();

  /** Minimized state */
  private isMinimized = false;

  /** Current position */
  private position: OverlayPosition = { bottom: '20px', right: '20px' };

  /** Drag state */
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartLeft = 0;
  private dragStartTop = 0;

  /** Bound drag handlers for adding/removing event listeners */
  private boundDragMove: ((e: MouseEvent) => void) | null = null;
  private boundDragEnd: (() => void) | null = null;

  /** Debounced state save to prevent excessive storage writes */
  private debouncedSaveState: (() => void) | null = null;

  /** Storage key for state persistence */
  private readonly STORAGE_KEY = 'upload_overlay_state';

  /** Control action callbacks */
  private controlCallbacks: UploadControlCallbacks = {};

  /** Global time remaining element */
  private globalTimeElement: HTMLElement | null = null;

  /** Current theme */
  private currentTheme: 'light' | 'dark' = 'light';

  /** Theme media query listener */
  private themeMediaQuery: MediaQueryList | null = null;

  /** CSS class names */
  private readonly CLASSES = {
    container: 'upload-tracker-overlay',
    minimized: 'upload-tracker-overlay--minimized',
    header: 'upload-tracker-overlay__header',
    title: 'upload-tracker-overlay__title',
    globalTime: 'upload-tracker-overlay__global-time',
    controls: 'upload-tracker-overlay__controls',
    minimizeBtn: 'upload-tracker-overlay__minimize-btn',
    uploadList: 'upload-tracker-overlay__upload-list',
    uploadCard: 'upload-tracker-overlay__upload-card',
    uploadCardComplete: 'upload-tracker-overlay__upload-card--complete',
    uploadCardFailed: 'upload-tracker-overlay__upload-card--failed',
    uploadCardCancelled: 'upload-tracker-overlay__upload-card--cancelled',
    fileName: 'upload-tracker-overlay__file-name',
    progressBar: 'upload-tracker-overlay__progress-bar',
    progressFill: 'upload-tracker-overlay__progress-fill',
    progressText: 'upload-tracker-overlay__progress-text',
    uploadInfo: 'upload-tracker-overlay__upload-info',
    uploadSpeed: 'upload-tracker-overlay__upload-speed',
    dragHandle: 'upload-tracker-overlay__drag-handle',
    uploadControls: 'upload-tracker-overlay__upload-controls',
    controlBtn: 'upload-tracker-overlay__control-btn',
    controlBtnCancel: 'upload-tracker-overlay__control-btn--cancel',
    controlBtnRetry: 'upload-tracker-overlay__control-btn--retry',
    controlBtnLocation: 'upload-tracker-overlay__control-btn--location',
  } as const;

  /**
   * Initialize the overlay
   */
  constructor(callbacks?: UploadControlCallbacks) {
    this.controlCallbacks = callbacks ?? {};

    // Initialize debounced save state (500ms delay to batch rapid changes)
    this.debouncedSaveState = debounce(() => {
      void this.saveState();
    }, 500);

    // Initialize bound drag handlers
    this.boundDragMove = (e: MouseEvent) => this.handleDragMove(e);
    this.boundDragEnd = () => this.handleDragEnd();

    // Initialize theme detection
    this.initializeTheme();

    void this.loadState();
    this.injectStyles();
    this.createOverlay();
    this.setupEventListeners();
  }

  /**
   * Initialize theme detection
   */
  private initializeTheme(): void {
    // Detect initial theme
    this.currentTheme = this.detectTheme();

    // Setup media query listener for theme changes
    this.themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.themeMediaQuery.addEventListener('change', () => {
      this.currentTheme = this.detectTheme();
      this.updateOverlayTheme();
    });
  }

  /**
   * Detect current theme based on system preference
   */
  private detectTheme(): 'light' | 'dark' {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * Update overlay theme dynamically
   */
  private updateOverlayTheme(): void {
    if (!this.container) {
      return;
    }

    // Update container data attribute for CSS targeting
    this.container.setAttribute('data-theme', this.currentTheme);
  }

  /**
   * Inject CSS styles into the page (Subtask 16.1, 16.2, 16.3, 16.5)
   */
  private injectStyles(): void {
    const styleId = 'upload-tracker-overlay-styles';

    // Check if styles already exist
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* Base overlay container (Subtask 16.1) */
      .${this.CLASSES.container} {
        position: fixed;
        width: 380px;
        max-height: 600px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Minimized state (Subtask 16.3) */
      .${this.CLASSES.container}.${this.CLASSES.minimized} {
        max-height: 56px;
      }

      .${this.CLASSES.container}.${this.CLASSES.minimized} .${this.CLASSES.uploadList} {
        display: none;
      }

      /* Header (Subtask 16.1) */
      .${this.CLASSES.header} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #ffffff;
        cursor: move;
        user-select: none;
      }

      .${this.CLASSES.dragHandle} {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: move;
      }

      .${this.CLASSES.title} {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
      }

      .${this.CLASSES.globalTime} {
        font-size: 13px;
        font-weight: 400;
        margin-top: 4px;
        opacity: 0.95;
        color: #ffffff;
      }

      .${this.CLASSES.controls} {
        display: flex;
        gap: 8px;
      }

      .${this.CLASSES.minimizeBtn} {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 6px;
        width: 32px;
        height: 32px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        color: #ffffff;
        font-size: 18px;
      }

      .${this.CLASSES.minimizeBtn}:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      /* Upload list (Subtask 16.2, 16.5) */
      .${this.CLASSES.uploadList} {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 12px;
        max-height: 544px;
      }

      .${this.CLASSES.uploadList}::-webkit-scrollbar {
        width: 6px;
      }

      .${this.CLASSES.uploadList}::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
      }

      .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb {
        background: #888;
        border-radius: 3px;
      }

      .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb:hover {
        background: #555;
      }

      /* Upload card (Subtask 16.2) */
      .${this.CLASSES.uploadCard} {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        transition: all 0.2s;
        border: 1px solid #e9ecef;
      }

      .${this.CLASSES.uploadCard}:last-child {
        margin-bottom: 0;
      }

      .${this.CLASSES.uploadCard}:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
      }

      /* Upload card states */
      .${this.CLASSES.uploadCardComplete} {
        background: #d4edda;
        border-color: #c3e6cb;
      }

      .${this.CLASSES.uploadCardFailed} {
        background: #f8d7da;
        border-color: #f5c6cb;
      }

      .${this.CLASSES.uploadCardCancelled} {
        background: #fff3cd;
        border-color: #ffeaa7;
      }

      /* File name */
      .${this.CLASSES.fileName} {
        font-size: 14px;
        font-weight: 500;
        color: #212529;
        margin-bottom: 8px;
        word-break: break-word;
        line-height: 1.4;
      }

      /* Progress bar */
      .${this.CLASSES.progressBar} {
        width: 100%;
        height: 8px;
        background: #e9ecef;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
      }

      .${this.CLASSES.progressFill} {
        height: 100%;
        background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
        border-radius: 4px;
        transition: width 0.3s ease;
        position: relative;
      }

      .${this.CLASSES.progressFill}::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        animation: shimmer 2s infinite;
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      /* Progress text and upload info */
      .${this.CLASSES.progressText} {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
        color: #6c757d;
        margin-bottom: 4px;
      }

      .${this.CLASSES.uploadInfo} {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #868e96;
      }

      .${this.CLASSES.uploadSpeed} {
        font-weight: 500;
      }

      /* Control buttons */
      .${this.CLASSES.uploadControls} {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #e9ecef;
      }

      .${this.CLASSES.controlBtn} {
        flex: 1;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        background: #e9ecef;
        color: #495057;
      }

      .${this.CLASSES.controlBtn}:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      .${this.CLASSES.controlBtn}:active {
        transform: translateY(0);
      }

      .${this.CLASSES.controlBtn}:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .${this.CLASSES.controlBtnCancel} {
        background: #dc3545;
        color: #ffffff;
      }

      .${this.CLASSES.controlBtnCancel}:hover {
        background: #c82333;
      }

      .${this.CLASSES.controlBtnRetry} {
        background: #ffc107;
        color: #212529;
      }

      .${this.CLASSES.controlBtnRetry}:hover {
        background: #e0a800;
      }

      .${this.CLASSES.controlBtnLocation} {
        background: #17a2b8;
        color: #ffffff;
      }

      .${this.CLASSES.controlBtnLocation}:hover {
        background: #138496;
      }

      /* Responsive design (Subtask 16.5) */
      @media (max-width: 768px) {
        .${this.CLASSES.container} {
          width: calc(100vw - 32px);
          max-width: 380px;
        }
      }

      @media (max-width: 480px) {
        .${this.CLASSES.container} {
          width: calc(100vw - 16px);
          bottom: 8px !important;
          right: 8px !important;
        }

        .${this.CLASSES.header} {
          padding: 12px;
        }

        .${this.CLASSES.title} {
          font-size: 14px;
        }

        .${this.CLASSES.uploadList} {
          max-height: 400px;
        }
      }

      /* Reduced motion support (Subtask 16.3) */
      @media (prefers-reduced-motion: reduce) {
        .${this.CLASSES.container},
        .${this.CLASSES.progressFill},
        .${this.CLASSES.uploadCard},
        .${this.CLASSES.minimizeBtn} {
          transition: none;
        }

        .${this.CLASSES.progressFill}::after {
          animation: none;
        }
      }

      /* Light theme explicit styles */
      @media (prefers-color-scheme: light), (prefers-color-scheme: no-preference) {
        .${this.CLASSES.container} {
          background: #ffffff;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .${this.CLASSES.header} {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .${this.CLASSES.uploadCard} {
          background: #f8f9fa;
          border-color: #e9ecef;
          color: #212529;
        }

        .${this.CLASSES.uploadCardComplete} {
          background: #d4edda;
          border-color: #c3e6cb;
        }

        .${this.CLASSES.uploadCardFailed} {
          background: #f8d7da;
          border-color: #f5c6cb;
        }

        .${this.CLASSES.uploadCardCancelled} {
          background: #fff3cd;
          border-color: #ffeaa7;
        }

        .${this.CLASSES.fileName} {
          color: #212529;
        }

        .${this.CLASSES.progressText} {
          color: #6c757d;
        }

        .${this.CLASSES.uploadInfo} {
          color: #868e96;
        }

        .${this.CLASSES.progressBar} {
          background: #e9ecef;
        }

        .${this.CLASSES.uploadList}::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb {
          background: #888;
        }

        .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb:hover {
          background: #555;
        }

        .${this.CLASSES.uploadControls} {
          border-top-color: #e9ecef;
        }

        .${this.CLASSES.controlBtn} {
          background: #e9ecef;
          color: #495057;
        }

        .${this.CLASSES.controlBtnCancel} {
          background: #dc3545;
          color: #ffffff;
        }

        .${this.CLASSES.controlBtnCancel}:hover {
          background: #c82333;
        }

        .${this.CLASSES.controlBtnRetry} {
          background: #ffc107;
          color: #212529;
        }

        .${this.CLASSES.controlBtnRetry}:hover {
          background: #e0a800;
        }

        .${this.CLASSES.controlBtnLocation} {
          background: #17a2b8;
          color: #ffffff;
        }

        .${this.CLASSES.controlBtnLocation}:hover {
          background: #138496;
        }
      }

      /* Dark theme support - Google Drive actual colors */
      @media (prefers-color-scheme: dark) {
        /* Container - uses dt-background */
        .${this.CLASSES.container} {
          background: #131314;
          box-shadow: 0 8px 10px -6px rgba(0, 0, 0, 0.2), 0 16px 24px 2px rgba(0, 0, 0, 0.14), 0 6px 30px 5px rgba(0, 0, 0, 0.12);
        }

        /* Header - uses dt-surface-container-low */
        .${this.CLASSES.header} {
          background: #1b1b1b;
        }

        /* Upload cards - uses dt-surface-container-high */
        .${this.CLASSES.uploadCard} {
          background: #282a2c;
          border-color: #444746;
          color: #e3e3e3;
        }

        .${this.CLASSES.uploadCard}:hover {
          box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 4px 5px 0px rgba(0, 0, 0, 0.14), 0 1px 10px 0px rgba(0, 0, 0, 0.12);
        }

        /* Upload card states - Dark mode */
        .${this.CLASSES.uploadCardComplete} {
          background: #1e4620;
          border-color: #2d5a2e;
        }

        .${this.CLASSES.uploadCardFailed} {
          background: #5f2120;
          border-color: #8c2e2d;
        }

        .${this.CLASSES.uploadCardCancelled} {
          background: #664d03;
          border-color: #997404;
        }

        /* Text colors - uses dt-on-surface and dt-on-surface-secondary */
        .${this.CLASSES.fileName} {
          color: #e3e3e3;
        }

        .${this.CLASSES.progressText} {
          color: #ababab;
        }

        .${this.CLASSES.uploadInfo} {
          color: #ababab;
        }

        /* Progress bar - uses dt-surface-variant */
        .${this.CLASSES.progressBar} {
          background: #444746;
        }

        /* Scrollbar - uses dt-surface-container */
        .${this.CLASSES.uploadList}::-webkit-scrollbar-track {
          background: #1e1f20;
        }

        .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb {
          background: #444746;
        }

        .${this.CLASSES.uploadList}::-webkit-scrollbar-thumb:hover {
          background: #5f6368;
        }

        /* Control buttons border - uses dt-surface-variant */
        .${this.CLASSES.uploadControls} {
          border-top-color: #444746;
        }

        /* Default button - uses dt-surface-variant */
        .${this.CLASSES.controlBtn} {
          background: #444746;
          color: #e3e3e3;
        }

        .${this.CLASSES.controlBtn}:hover {
          background: #5f6368;
        }

        /* Cancel button - Dark mode */
        .${this.CLASSES.controlBtnCancel} {
          background: #b71c1c;
          color: #ffffff;
        }

        .${this.CLASSES.controlBtnCancel}:hover {
          background: #d32f2f;
        }

        /* Retry button - Dark mode */
        .${this.CLASSES.controlBtnRetry} {
          background: #f9a825;
          color: #000000;
        }

        .${this.CLASSES.controlBtnRetry}:hover {
          background: #fbc02d;
        }

        /* Location button - Dark mode */
        .${this.CLASSES.controlBtnLocation} {
          background: #0097a7;
          color: #ffffff;
        }

        .${this.CLASSES.controlBtnLocation}:hover {
          background: #00acc1;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Create overlay DOM structure (Subtask 16.1, 16.2)
   */
  private createOverlay(): void {
    // Create container
    this.container = document.createElement('div');
    this.container.className = this.CLASSES.container;
    this.container.setAttribute('data-theme', this.currentTheme);

    // Apply saved position
    if (this.position.bottom)
      this.container.style.bottom = this.position.bottom;
    if (this.position.right) this.container.style.right = this.position.right;
    if (this.position.top) this.container.style.top = this.position.top;
    if (this.position.left) this.container.style.left = this.position.left;

    // Create header
    this.header = document.createElement('div');
    this.header.className = this.CLASSES.header;

    // Drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = this.CLASSES.dragHandle;

    // Title
    const title = document.createElement('h3');
    title.className = this.CLASSES.title;
    title.textContent = '📤 Uploads';

    dragHandle.appendChild(title);

    // Global time remaining
    this.globalTimeElement = document.createElement('div');
    this.globalTimeElement.className = this.CLASSES.globalTime;
    this.globalTimeElement.style.display = 'none'; // Hidden by default
    dragHandle.appendChild(this.globalTimeElement);

    // Controls
    const controls = document.createElement('div');
    controls.className = this.CLASSES.controls;

    // Minimize button
    const minimizeBtn = document.createElement('button');
    minimizeBtn.className = this.CLASSES.minimizeBtn;
    minimizeBtn.innerHTML = this.isMinimized ? '▲' : '▼';
    minimizeBtn.title = 'Minimize/Expand';
    minimizeBtn.setAttribute('aria-label', 'Toggle minimize');

    controls.appendChild(minimizeBtn);

    this.header.appendChild(dragHandle);
    this.header.appendChild(controls);

    // Create upload list
    this.uploadList = document.createElement('div');
    this.uploadList.className = this.CLASSES.uploadList;

    // Assemble overlay
    this.container.appendChild(this.header);
    this.container.appendChild(this.uploadList);

    // Apply minimized state
    if (this.isMinimized) {
      this.container.classList.add(this.CLASSES.minimized);
    }

    // Initially hide overlay (will show when first upload is detected)
    this.container.style.display = 'none';

    // Append to document body
    document.body.appendChild(this.container);

    logger.info('UploadOverlay', 'Overlay created and attached to DOM');
  }

  /**
   * Setup event listeners (Subtask 16.3, 16.4)
   */
  private setupEventListeners(): void {
    if (!this.container || !this.header) {
      return;
    }

    // Minimize/expand button click (Subtask 16.3)
    const minimizeBtn = this.container.querySelector(
      `.${this.CLASSES.minimizeBtn}`
    );
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    }

    // Drag functionality (Subtask 16.4)
    const dragHandle = this.header.querySelector(`.${this.CLASSES.dragHandle}`);
    if (dragHandle) {
      dragHandle.addEventListener('mousedown', (e) =>
        this.handleDragStart(e as MouseEvent)
      );
    }

    // Note: Global mouse events are added dynamically during drag (see handleDragStart)
    // This prevents 60+ mousemove events per second when not dragging
  }

  /**
   * Toggle minimize/expand state (Subtask 16.3)
   */
  private toggleMinimize(): void {
    this.isMinimized = !this.isMinimized;

    if (this.container) {
      if (this.isMinimized) {
        this.container.classList.add(this.CLASSES.minimized);
      } else {
        this.container.classList.remove(this.CLASSES.minimized);
      }
    }

    // Update minimize button icon
    const minimizeBtn = this.container?.querySelector(
      `.${this.CLASSES.minimizeBtn}`
    );
    if (minimizeBtn) {
      minimizeBtn.innerHTML = this.isMinimized ? '▲' : '▼';
    }

    // Save state (debounced)
    if (this.debouncedSaveState) {
      this.debouncedSaveState();
    }

    logger.debug('UploadOverlay', this.isMinimized ? 'Minimized' : 'Expanded');
  }

  /**
   * Handle drag start (Subtask 16.4)
   */
  private handleDragStart(e: MouseEvent): void {
    if (!this.container || !this.boundDragMove || !this.boundDragEnd) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    const rect = this.container.getBoundingClientRect();
    this.dragStartLeft = rect.left;
    this.dragStartTop = rect.top;

    // Add dragging cursor
    document.body.style.cursor = 'grabbing';
    this.container.style.cursor = 'grabbing';

    // Add global drag event listeners only during drag (performance optimization)
    document.addEventListener('mousemove', this.boundDragMove);
    document.addEventListener('mouseup', this.boundDragEnd);

    e.preventDefault();
  }

  /**
   * Handle drag move (Subtask 16.4)
   */
  private handleDragMove(e: MouseEvent): void {
    if (!this.isDragging || !this.container) {
      return;
    }

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    let newLeft = this.dragStartLeft + deltaX;
    let newTop = this.dragStartTop + deltaY;

    // Keep within viewport bounds
    const rect = this.container.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    // Update position
    this.container.style.left = `${newLeft}px`;
    this.container.style.top = `${newTop}px`;
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';

    e.preventDefault();
  }

  /**
   * Handle drag end (Subtask 16.4)
   */
  private handleDragEnd(): void {
    if (
      !this.isDragging ||
      !this.container ||
      !this.boundDragMove ||
      !this.boundDragEnd
    ) {
      return;
    }

    this.isDragging = false;

    // Remove global drag event listeners (performance optimization)
    document.removeEventListener('mousemove', this.boundDragMove);
    document.removeEventListener('mouseup', this.boundDragEnd);

    // Remove dragging cursor
    document.body.style.cursor = '';
    this.container.style.cursor = 'move';

    // Save new position
    const rect = this.container.getBoundingClientRect();
    this.position = {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    };

    // Debounced save to prevent excessive storage writes
    if (this.debouncedSaveState) {
      this.debouncedSaveState();
    }

    logger.debug('UploadOverlay', 'Position saved', this.position);
  }

  /**
   * Add or update upload card (Subtask 16.2)
   */
  public updateUpload(upload: UploadInfo): void {
    let card = this.uploadCards.get(upload.id);

    if (!card) {
      // Create new card
      card = this.createUploadCard(upload);
      this.uploadCards.set(upload.id, card);
      this.uploadList?.appendChild(card);
    } else {
      // Update existing card
      this.updateUploadCard(card, upload);
    }

    // Show overlay if hidden
    this.show();
  }

  /**
   * Create upload card element (Subtask 16.2)
   */
  private createUploadCard(upload: UploadInfo): HTMLElement {
    const card = document.createElement('div');
    card.className = this.CLASSES.uploadCard;
    card.dataset['uploadId'] = upload.id;

    // Add status class
    if (upload.status === UploadStatus.COMPLETE) {
      card.classList.add(this.CLASSES.uploadCardComplete);
    } else if (upload.status === UploadStatus.FAILED) {
      card.classList.add(this.CLASSES.uploadCardFailed);
    } else if (upload.status === UploadStatus.CANCELLED) {
      card.classList.add(this.CLASSES.uploadCardCancelled);
    }

    // File name
    const fileName = document.createElement('div');
    fileName.className = this.CLASSES.fileName;
    fileName.textContent = upload.fileName;

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = this.CLASSES.progressBar;

    const progressFill = document.createElement('div');
    progressFill.className = this.CLASSES.progressFill;
    progressFill.style.width = `${upload.progress}%`;

    progressBar.appendChild(progressFill);

    // Progress text
    const progressText = document.createElement('div');
    progressText.className = this.CLASSES.progressText;
    progressText.innerHTML = `
      <span>${upload.progress}%</span>
      <span>${upload.uploadedSize} / ${upload.totalSize}</span>
    `;

    // Upload info
    const uploadInfo = document.createElement('div');
    uploadInfo.className = this.CLASSES.uploadInfo;

    const speed = upload.uploadSpeed || '--';
    const timeRemaining = upload.timeRemaining || '--';
    const statusText = upload.status.toUpperCase();

    uploadInfo.innerHTML = `
      <span class="${this.CLASSES.uploadSpeed}">${speed}</span>
      <span>${timeRemaining}</span>
      <span>${statusText}</span>
    `;

    // Control buttons
    const controls = this.createControlButtons(upload);

    // Assemble card
    card.appendChild(fileName);
    card.appendChild(progressBar);
    card.appendChild(progressText);
    card.appendChild(uploadInfo);
    card.appendChild(controls);

    return card;
  }

  /**
   * Create control buttons for upload card
   */
  private createControlButtons(upload: UploadInfo): HTMLElement {
    const controls = document.createElement('div');
    controls.className = this.CLASSES.uploadControls;

    // Show buttons based on upload status
    const isUploading =
      upload.status === UploadStatus.UPLOADING ||
      upload.status === UploadStatus.PENDING;
    const isFailed = upload.status === UploadStatus.FAILED;
    const isComplete = upload.status === UploadStatus.COMPLETE;

    // Cancel button (show during upload)
    if (isUploading) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = `${this.CLASSES.controlBtn} ${this.CLASSES.controlBtnCancel}`;
      cancelBtn.textContent = 'Cancel';
      cancelBtn.dataset['action'] = 'cancel';
      cancelBtn.dataset['uploadId'] = upload.id;
      cancelBtn.addEventListener('click', () => {
        void this.handleControlAction('cancel', upload);
      });
      controls.appendChild(cancelBtn);
    }

    // Retry button (show on failure)
    if (isFailed) {
      const retryBtn = document.createElement('button');
      retryBtn.className = `${this.CLASSES.controlBtn} ${this.CLASSES.controlBtnRetry}`;
      retryBtn.textContent = 'Retry';
      retryBtn.dataset['action'] = 'retry';
      retryBtn.dataset['uploadId'] = upload.id;
      retryBtn.addEventListener('click', () => {
        void this.handleControlAction('retry', upload);
      });
      controls.appendChild(retryBtn);
    }

    // Show location button (show when complete)
    if (isComplete) {
      const locationBtn = document.createElement('button');
      locationBtn.className = `${this.CLASSES.controlBtn} ${this.CLASSES.controlBtnLocation}`;
      locationBtn.textContent = 'Show Location';
      locationBtn.dataset['action'] = 'location';
      locationBtn.dataset['uploadId'] = upload.id;
      locationBtn.addEventListener('click', () => {
        void this.handleControlAction('location', upload);
      });
      controls.appendChild(locationBtn);
    }

    return controls;
  }

  /**
   * Handle control button actions
   */
  private async handleControlAction(
    action: 'cancel' | 'retry' | 'location',
    upload: UploadInfo
  ): Promise<void> {
    try {
      let result: ControlResult | undefined;

      // Disable button during action
      const card = this.uploadCards.get(upload.id);
      const button = card?.querySelector(
        `[data-action="${action}"]`
      ) as HTMLButtonElement;
      if (button) {
        button.disabled = true;
        button.textContent = 'Processing...';
      }

      // Execute action
      switch (action) {
        case 'cancel':
          result = await this.controlCallbacks.onCancel?.(upload);
          break;
        case 'retry':
          result = await this.controlCallbacks.onRetry?.(upload);
          break;
        case 'location':
          result = await this.controlCallbacks.onShowLocation?.(upload);
          break;
      }

      // Log result
      if (result) {
        logger.debug('UploadOverlay', `${action} result`, {
          success: result.success,
          message: result.message,
        });
        if (result.error) {
          logger.error('UploadOverlay', `${action} error`, result.error);
        }
      }

      // Re-enable button if failed
      if (button && result && !result.success) {
        button.disabled = false;
        button.textContent =
          action === 'cancel'
            ? 'Cancel'
            : action === 'retry'
              ? 'Retry'
              : 'Show Location';
      }
    } catch (error) {
      logger.error(
        'UploadOverlay',
        `Error executing ${action}`,
        error as Error
      );
    }
  }

  /**
   * Update existing upload card (Subtask 16.2)
   */
  private updateUploadCard(card: HTMLElement, upload: UploadInfo): void {
    // Check if status changed by comparing classes
    const hadComplete = card.classList.contains(
      this.CLASSES.uploadCardComplete
    );
    const hadFailed = card.classList.contains(this.CLASSES.uploadCardFailed);
    const hadCancelled = card.classList.contains(
      this.CLASSES.uploadCardCancelled
    );
    const hasComplete = upload.status === UploadStatus.COMPLETE;
    const hasFailed = upload.status === UploadStatus.FAILED;
    const hasCancelled = upload.status === UploadStatus.CANCELLED;
    const statusChanged =
      hadComplete !== hasComplete ||
      hadFailed !== hasFailed ||
      hadCancelled !== hasCancelled;

    // Update status class
    card.classList.remove(
      this.CLASSES.uploadCardComplete,
      this.CLASSES.uploadCardFailed,
      this.CLASSES.uploadCardCancelled
    );
    if (hasComplete) {
      card.classList.add(this.CLASSES.uploadCardComplete);
    } else if (hasFailed) {
      card.classList.add(this.CLASSES.uploadCardFailed);
    } else if (hasCancelled) {
      card.classList.add(this.CLASSES.uploadCardCancelled);
    }

    // Update progress fill
    const progressFill = card.querySelector(
      `.${this.CLASSES.progressFill}`
    ) as HTMLElement;
    if (progressFill) {
      progressFill.style.width = `${upload.progress}%`;
    }

    // Update progress text
    const progressText = card.querySelector(`.${this.CLASSES.progressText}`);
    if (progressText) {
      progressText.innerHTML = `
        <span>${upload.progress}%</span>
        <span>${upload.uploadedSize} / ${upload.totalSize}</span>
      `;
    }

    // Update upload info
    const uploadInfo = card.querySelector(`.${this.CLASSES.uploadInfo}`);
    if (uploadInfo) {
      const speed = upload.uploadSpeed || '--';
      const timeRemaining = upload.timeRemaining || '--';
      const statusText = upload.status.toUpperCase();

      uploadInfo.innerHTML = `
        <span class="${this.CLASSES.uploadSpeed}">${speed}</span>
        <span>${timeRemaining}</span>
        <span>${statusText}</span>
      `;
    }

    // Only update control buttons if status changed (to preserve event listeners and hover state)
    if (statusChanged) {
      const existingControls = card.querySelector(
        `.${this.CLASSES.uploadControls}`
      );
      const newControls = this.createControlButtons(upload);
      if (existingControls) {
        existingControls.replaceWith(newControls);
      } else {
        card.appendChild(newControls);
      }
    }
  }

  /**
   * Remove upload card
   */
  public removeUpload(uploadId: string): void {
    const card = this.uploadCards.get(uploadId);
    if (card) {
      card.remove();
      this.uploadCards.delete(uploadId);
    }

    // Hide overlay if no uploads
    if (this.uploadCards.size === 0) {
      this.hide();
    }
  }

  /**
   * Show overlay
   */
  public show(): void {
    if (this.container && this.container.style.display === 'none') {
      this.container.style.display = 'flex';
    }
  }

  /**
   * Hide overlay
   */
  public hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Set global time remaining for all uploads
   */
  public setGlobalTimeRemaining(timeRemaining: string | null): void {
    if (!this.globalTimeElement) {
      return;
    }

    if (timeRemaining) {
      this.globalTimeElement.textContent = `⏱️ ${timeRemaining}`;
      this.globalTimeElement.style.display = 'block';
    } else {
      this.globalTimeElement.style.display = 'none';
    }
  }

  /**
   * Save overlay state to Chrome Storage (Subtask 16.3, 16.4)
   */
  private async saveState(): Promise<void> {
    try {
      const state: OverlayState = {
        minimized: this.isMinimized,
        position: this.position,
      };

      await chrome.storage.local.set({ [this.STORAGE_KEY]: state });
    } catch (error) {
      logger.error('UploadOverlay', 'Error saving state', error as Error);
    }
  }

  /**
   * Load overlay state from Chrome Storage (Subtask 16.3, 16.4)
   */
  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const state = result[this.STORAGE_KEY] as OverlayState | undefined;

      if (state) {
        this.isMinimized = state.minimized ?? false;
        this.position = state.position ?? { bottom: '20px', right: '20px' };
      }
    } catch (error) {
      logger.error('UploadOverlay', 'Error loading state', error as Error);
    }
  }

  /**
   * Dispose of overlay and cleanup
   */
  public dispose(): void {
    // Remove event listeners (if currently attached during drag)
    if (this.boundDragMove && this.boundDragEnd) {
      document.removeEventListener('mousemove', this.boundDragMove);
      document.removeEventListener('mouseup', this.boundDragEnd);
    }

    // Remove theme change listener
    if (this.themeMediaQuery) {
      this.themeMediaQuery.removeEventListener('change', () => {
        this.currentTheme = this.detectTheme();
        this.updateOverlayTheme();
      });
      this.themeMediaQuery = null;
    }

    // Remove DOM elements
    this.container?.remove();

    // Clear references
    this.uploadCards.clear();
    this.container = null;
    this.header = null;
    this.uploadList = null;
    this.boundDragMove = null;
    this.boundDragEnd = null;
    this.debouncedSaveState = null;

    logger.info('UploadOverlay', 'Disposed');
  }
}
