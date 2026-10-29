import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AutoRetry } from '../src/content/auto-retry.js';
import type { UploadControls } from '../src/content/upload-controls.js';
import type { UploadInfo } from '../src/types/upload.types.js';
import { UploadStatus } from '../src/types/upload.types.js';

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(globalThis, 'window', {
    value: new EventTarget(),
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      get onLine() {
        return online;
      },
    },
    configurable: true,
  });
  mock.timers.enable({ apis: ['setTimeout'] });
});

afterEach(() => {
  mock.timers.reset();
});

function setup(retrySucceeds: () => boolean = () => true) {
  const upload = {
    id: 'u1',
    fileName: 'video.mp4',
    status: UploadStatus.FAILED,
  } as UploadInfo;
  const retries: number[] = [];
  const gaveUp: string[] = [];
  let pendingChanges = 0;
  const controls = {
    retryUpload: async () => {
      retries.push(Date.now());
      return { success: retrySucceeds(), message: '' };
    },
  } as unknown as UploadControls;
  const autoRetry = new AutoRetry({
    controls,
    getUpload: () => upload,
    onGiveUp: (u) => gaveUp.push(u.id),
    onPendingChange: () => (pendingChanges += 1),
  });
  return {
    upload,
    retries,
    gaveUp,
    autoRetry,
    pendingChanges: () => pendingChanges,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('retries after 5 s, 20 s and 60 s, then gives up', async () => {
  const { upload, retries, gaveUp, autoRetry } = setup();

  for (const delay of [5000, 20000, 60000]) {
    autoRetry.handleFailure(upload);
    assert.equal(autoRetry.hasPending(), true);
    mock.timers.tick(delay - 1);
    await flush();
    const before = retries.length;
    mock.timers.tick(1);
    await flush();
    assert.equal(retries.length, before + 1, `retry after ${delay} ms`);
  }

  autoRetry.handleFailure(upload);
  assert.deepEqual(gaveUp, ['u1']);
  assert.equal(autoRetry.hasPending(), false);
});

test('waits for the network to return before retrying', async () => {
  const { upload, retries, autoRetry } = setup();
  online = false;

  autoRetry.handleFailure(upload);
  mock.timers.tick(120000);
  await flush();
  assert.equal(retries.length, 0);
  assert.equal(autoRetry.hasPending(), true);

  online = true;
  window.dispatchEvent(new Event('online'));
  mock.timers.tick(3000);
  await flush();
  assert.equal(retries.length, 1);
});

test('gives up when Drive no longer offers a retry', async () => {
  const { upload, gaveUp, autoRetry } = setup(() => false);
  autoRetry.handleFailure(upload);
  mock.timers.tick(5000);
  await flush();
  assert.deepEqual(gaveUp, ['u1']);
});

test('does nothing but report the failure when turned off', () => {
  const { upload, retries, gaveUp, autoRetry } = setup();
  autoRetry.setEnabled(false);
  autoRetry.handleFailure(upload);
  assert.deepEqual(gaveUp, ['u1']);
  assert.equal(retries.length, 0);
});

test('a completed upload cancels its pending retry', async () => {
  const { upload, retries, autoRetry } = setup();
  autoRetry.handleFailure(upload);
  autoRetry.cancel(upload.id);
  mock.timers.tick(60000);
  await flush();
  assert.equal(retries.length, 0);
  assert.equal(autoRetry.hasPending(), false);
});
