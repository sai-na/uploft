/**
 * IndexedDB store for unfinished uploads, so they can resume after a restart
 * File handles are stored too; Chrome asks for permission again on resume.
 */

import type { JobStore, StoredJob } from './engine.js';

const DB_NAME = 'upload-tracker';
const STORE = 'jobs';

export class IndexedDbJobStore implements JobStore {
  private db: Promise<IDBDatabase> | null = null;

  public async save(job: StoredJob): Promise<void> {
    await this.run('readwrite', (store) => store.put(job));
  }

  public async remove(id: string): Promise<void> {
    await this.run('readwrite', (store) => store.delete(id));
  }

  public async loadAll(): Promise<StoredJob[]> {
    return this.run(
      'readonly',
      (store) => store.getAll() as IDBRequest<StoredJob[]>
    );
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (): void => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
    return this.db;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = (): void => resolve(request.result);
      request.onerror = (): void => reject(request.error);
    });
  }
}
