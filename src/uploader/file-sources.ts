/**
 * Collect files from pickers and drag-and-drop, keeping folder paths
 * Prefers File System Access handles, which let uploads resume after a restart.
 */

import type { UploadSource } from './engine.js';

/** Parts of the File System Access API that lib.dom doesn't declare yet */
interface PermissionHandle {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
}

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<
    FileSystemFileHandle | FileSystemDirectoryHandle
  >;
}

interface PickerWindow {
  showOpenFilePicker?: (options: {
    multiple: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showDirectoryPicker?: (options: {
    mode: 'read';
  }) => Promise<FileSystemDirectoryHandle>;
}

interface HandleItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

/** Files the OS creates that nobody wants in Drive */
const IGNORED_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

const picker = window as unknown as PickerWindow;

export function canPickWithHandles(): boolean {
  return typeof picker.showOpenFilePicker === 'function';
}

export async function pickFiles(): Promise<UploadSource[]> {
  const handles = await picker.showOpenFilePicker!({ multiple: true });
  return Promise.all(
    handles.map(async (handle) => ({
      file: await handle.getFile(),
      relativePath: handle.name,
      handle,
    }))
  );
}

export async function pickFolder(): Promise<UploadSource[]> {
  const directory = await picker.showDirectoryPicker!({ mode: 'read' });
  return walkDirectory(directory, directory.name, directory);
}

/** Fallback for <input type="file"> (with or without webkitdirectory) */
export function fromFileList(files: FileList): UploadSource[] {
  return [...files]
    .filter((file) => !IGNORED_NAMES.has(file.name))
    .map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }));
}

/**
 * Read a drop. Handles must be requested synchronously, before the event ends.
 */
export async function fromDrop(
  dataTransfer: DataTransfer
): Promise<UploadSource[]> {
  const items = [...dataTransfer.items].filter((item) => item.kind === 'file');
  const pending = items.map((item) =>
    (item as unknown as HandleItem).getAsFileSystemHandle?.()
  );

  if (pending.some((handle) => handle === undefined)) {
    return fromFileList(dataTransfer.files);
  }

  const sources: UploadSource[] = [];
  for (const handle of await Promise.all(pending)) {
    if (handle?.kind === 'file') {
      const fileHandle = handle as FileSystemFileHandle;
      sources.push({
        file: await fileHandle.getFile(),
        relativePath: handle.name,
        handle: fileHandle,
      });
    } else if (handle?.kind === 'directory') {
      const directory = handle as FileSystemDirectoryHandle;
      sources.push(
        ...(await walkDirectory(directory, directory.name, directory))
      );
    }
  }
  return sources;
}

/**
 * Ask Chrome to let us read a saved handle again (needs a click)
 */
export async function requestReadAccess(
  handle: FileSystemHandle
): Promise<boolean> {
  const permission = handle as unknown as PermissionHandle;
  try {
    return (
      (await permission.queryPermission({ mode: 'read' })) === 'granted' ||
      (await permission.requestPermission({ mode: 'read' })) === 'granted'
    );
  } catch {
    return false; // No user activation left, or the handle is gone
  }
}

/**
 * Read a saved file handle again; null if access was refused or the file is gone
 */
export async function reopenHandle(
  handle: FileSystemFileHandle
): Promise<File | null> {
  if (!(await requestReadAccess(handle))) {
    return null;
  }
  try {
    return await handle.getFile();
  } catch {
    return null; // File moved or deleted
  }
}

async function walkDirectory(
  directory: FileSystemDirectoryHandle,
  path: string,
  rootHandle: FileSystemDirectoryHandle
): Promise<UploadSource[]> {
  const sources: UploadSource[] = [];
  for await (const entry of (directory as IterableDirectoryHandle).values()) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    const entryPath = `${path}/${entry.name}`;
    if (entry.kind === 'file') {
      sources.push({
        file: await entry.getFile(),
        relativePath: entryPath,
        handle: entry,
        rootHandle,
      });
    } else {
      sources.push(...(await walkDirectory(entry, entryPath, rootHandle)));
    }
  }
  return sources;
}
