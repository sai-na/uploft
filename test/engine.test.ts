import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UploadEngine } from '../src/uploader/engine.js';
import type {
  EngineDeps,
  StoredJob,
  UploadJob,
} from '../src/uploader/engine.js';
import type { RemoteFile } from '../src/uploader/drive-types.js';
import { FakeDrive } from './fake-drive.js';

const MB = 1024 * 1024;

function makeFile(name: string, size: number, seed = name.length): File {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + seed) & 0xff;
  return new File([bytes], name, { lastModified: 1700000000000 + seed });
}

function makeEngine(
  drive: FakeDrive,
  overrides: Partial<EngineDeps> = {}
): UploadEngine {
  return new UploadEngine({
    drive,
    sleep: (_ms, signal) =>
      new Promise((resolve, reject) => {
        if (signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
        else setTimeout(resolve, 0);
      }),
    isOnline: () => true,
    waitForOnline: () => Promise.resolve(),
    ...overrides,
  });
}

function idle(engine: UploadEngine): Promise<UploadJob[]> {
  return new Promise((resolve) => {
    const off = engine.onIdle((jobs) => {
      off();
      resolve(jobs);
    });
  });
}

function remote(
  id: string,
  name: string,
  size: number,
  modifiedTime = 0
): RemoteFile {
  return { id, name, size, modifiedTime };
}

async function assertStored(
  drive: FakeDrive,
  file: File,
  job: UploadJob
): Promise<void> {
  const stored = drive.files.find((f) => f.id === job.driveFile?.id);
  assert.ok(stored, `${file.name} was not stored`);
  const expected = new Uint8Array(await file.arrayBuffer());
  assert.equal(stored.bytes.length, expected.length, `${file.name} size`);
  assert.ok(
    Buffer.from(stored.bytes).equals(Buffer.from(expected)),
    `${file.name} content differs`
  );
}

test('uploads every file intact, several at a time, never more than the limit', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  engine.setConcurrency(3);
  const files = Array.from({ length: 7 }, (_, i) =>
    makeFile(`file-${i}.bin`, (i + 1) * 3 * MB + 123, i)
  );

  const done = idle(engine);
  engine.add(
    files.map((file) => ({ file, relativePath: file.name })),
    'root'
  );
  const jobs = await done;

  assert.equal(drive.maxInFlight, 3);
  assert.ok(
    jobs.every((job) => job.status === 'done'),
    JSON.stringify(jobs.map((j) => [j.name, j.status, j.error]))
  );
  for (const file of files) {
    await assertStored(
      drive,
      file,
      jobs.find((job) => job.name === file.name)!
    );
  }
});

test('large file goes up in several chunks', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  const file = makeFile('big.bin', 70 * MB + 5);
  let chunks = 0;
  drive.chunkFault = () => {
    chunks += 1;
    return null;
  };

  const done = idle(engine);
  engine.add([{ file, relativePath: file.name }], 'root');
  const [job] = await done;

  assert.ok(chunks > 1, `expected several chunks, got ${chunks}`);
  await assertStored(drive, file, job!);
});

test('recovers from dropped connections, partial chunks, 503s and expired sessions', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  engine.setConcurrency(4);
  const files = [
    makeFile('drop.bin', 40 * MB + 7, 1),
    makeFile('partial.bin', 40 * MB + 9, 2),
    makeFile('busy.bin', 20 * MB, 3),
    makeFile('expire.bin', 30 * MB + 1, 4),
  ];
  drive.chunkFault = (name, chunk) => {
    if (name === 'drop.bin' && (chunk === 2 || chunk === 3))
      return { type: 'network' };
    if (name === 'partial.bin' && chunk === 2)
      return { type: 'partial', fraction: 0.6 };
    if (name === 'busy.bin' && chunk <= 2)
      return { type: 'status', status: 503 };
    if (name === 'expire.bin' && chunk === 2) return { type: 'expire' };
    return null;
  };

  const done = idle(engine);
  engine.add(
    files.map((file) => ({ file, relativePath: file.name })),
    'root'
  );
  const jobs = await done;

  assert.ok(
    jobs.every((job) => job.status === 'done'),
    JSON.stringify(jobs.map((j) => [j.name, j.status, j.error]))
  );
  for (const file of files) {
    await assertStored(
      drive,
      file,
      jobs.find((job) => job.name === file.name)!
    );
  }
  // Only the expired file needed a second session
  assert.equal(drive.sessionsStarted, files.length + 1);
});

test('rate limits are retried, a full Drive is not', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  drive.startFault = (name) => {
    if (name === 'full.bin')
      return { type: 'status', status: 403, reason: 'storageQuotaExceeded' };
    return null;
  };
  let limited = 0;
  drive.chunkFault = (name) =>
    name === 'limited.bin' && limited++ < 3
      ? { type: 'status', status: 403, reason: 'userRateLimitExceeded' }
      : null;

  const done = idle(engine);
  engine.add(
    [makeFile('full.bin', MB), makeFile('limited.bin', MB)].map((file) => ({
      file,
      relativePath: file.name,
    })),
    'root'
  );
  const jobs = await done;

  const full = jobs.find((job) => job.name === 'full.bin')!;
  assert.equal(full.status, 'failed');
  assert.equal(full.error, 'Your Google storage is full');
  assert.equal(
    drive.calls.filter((call) => call === 'start:full.bin').length,
    0
  );
  assert.equal(jobs.find((job) => job.name === 'limited.bin')!.status, 'done');
});

test('creates each folder once even when its files upload in parallel', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  engine.setConcurrency(6);
  const paths = [
    'Trip/day1/a.jpg',
    'Trip/day1/b.jpg',
    'Trip/day2/c.jpg',
    'Trip/d.jpg',
    'Trip/day2/e.jpg',
    'Trip/day1/f.jpg',
  ];
  const sources = paths.map((path, i) => ({
    file: makeFile(path.split('/').pop()!, MB + i, i),
    relativePath: path,
  }));

  const done = idle(engine);
  engine.add(sources, 'root');
  const jobs = await done;

  const mkdirs = drive.calls.filter((call) => call.startsWith('mkdir:'));
  assert.equal(mkdirs.length, 3, mkdirs.join(', '));
  for (const source of sources) {
    const job = jobs.find((j) => j.relativePath === source.relativePath)!;
    assert.equal(
      drive.pathOf(job.driveFile!.id),
      `root/${source.relativePath}`
    );
  }
});

test('skips files already uploaded to the folder (same name and size)', async () => {
  const drive = new FakeDrive();
  drive.existing.set('root', [
    remote('a', 'same.bin', MB),
    remote('b', 'resized.bin', 5),
  ]);
  const engine = makeEngine(drive);

  const done = idle(engine);
  engine.add(
    [makeFile('same.bin', MB), makeFile('resized.bin', MB)].map((file) => ({
      file,
      relativePath: file.name,
    })),
    'root'
  );
  const jobs = await done;

  assert.equal(jobs.find((job) => job.name === 'same.bin')!.status, 'skipped');
  assert.equal(jobs.find((job) => job.name === 'resized.bin')!.status, 'done');
  assert.equal(drive.sessionsStarted, 1);
});

test('replace uploads a new version of the same-name file, and leaves unchanged files alone', async () => {
  const drive = new FakeDrive();
  const edited = makeFile('edited.bin', 3 * MB);
  const unchanged = makeFile('unchanged.bin', MB);
  const touched = makeFile('touched.bin', MB);
  drive.existing.set('root', [
    remote('old-edited', 'edited.bin', MB, 1),
    remote('old-unchanged', 'unchanged.bin', MB, unchanged.lastModified),
    remote('old-touched', 'touched.bin', MB, 5),
  ]);
  // The edited file's first session expires: it must restart as a new version too
  drive.chunkFault = (name, chunk) =>
    name === 'edited.bin' && chunk === 1 ? { type: 'expire' } : null;
  const engine = makeEngine(drive);
  engine.setExistingFiles('replace');

  const done = idle(engine);
  engine.add(
    [edited, unchanged, touched].map((file) => ({
      file,
      relativePath: file.name,
    })),
    'root'
  );
  const jobs = await done;
  const job = (name: string): UploadJob =>
    jobs.find((candidate) => candidate.name === name)!;

  assert.equal(job('unchanged.bin').status, 'skipped');
  assert.equal(job('edited.bin').status, 'done');
  assert.equal(job('edited.bin').driveFile?.id, 'old-edited');
  assert.equal(job('edited.bin').replaceId, 'old-edited');
  assert.equal(job('touched.bin').driveFile?.id, 'old-touched');
  await assertStored(drive, edited, job('edited.bin'));
  await assertStored(drive, touched, job('touched.bin'));
  assert.deepEqual(
    drive.calls.filter((call) => call === 'replace:old-edited'),
    ['replace:old-edited', 'replace:old-edited']
  );
  assert.ok(!drive.calls.some((call) => call.startsWith('start:')));
});

test('replace picks the newest of several same-name files', async () => {
  const drive = new FakeDrive();
  drive.existing.set('root', [
    remote('older', 'a.bin', 10, 100),
    remote('newest', 'a.bin', 10, 300),
    remote('middle', 'a.bin', 10, 200),
  ]);
  const engine = makeEngine(drive);
  engine.setExistingFiles('replace');

  const done = idle(engine);
  engine.add([{ file: makeFile('a.bin', MB), relativePath: 'a.bin' }], 'root');
  const [job] = await done;

  assert.equal(job!.driveFile?.id, 'newest');
  assert.deepEqual(drive.replaced, ['newest']);
});

test('replace uploads a new file when the old one was deleted from Drive', async () => {
  const drive = new FakeDrive();
  drive.existing.set('root', [remote('deleted', 'a.bin', 10, 1)]);
  drive.gone.add('deleted');
  const engine = makeEngine(drive);
  engine.setExistingFiles('replace');

  const done = idle(engine);
  const file = makeFile('a.bin', MB);
  engine.add([{ file, relativePath: 'a.bin' }], 'root');
  const [job] = await done;

  assert.equal(job!.status, 'done');
  assert.equal(job!.replaceId, undefined);
  assert.notEqual(job!.driveFile?.id, 'deleted');
  await assertStored(drive, file, job!);
});

test('replace works for empty files too', async () => {
  const drive = new FakeDrive();
  drive.existing.set('root', [remote('old-empty', 'empty.txt', 5, 1)]);
  const engine = makeEngine(drive);
  engine.setExistingFiles('replace');

  const done = idle(engine);
  engine.add(
    [{ file: makeFile('empty.txt', 0), relativePath: 'empty.txt' }],
    'root'
  );
  const [job] = await done;

  assert.equal(job!.driveFile?.id, 'old-empty');
  assert.deepEqual(drive.replaced, ['old-empty']);
});

test('keep both uploads a copy even when the same file is already there', async () => {
  const drive = new FakeDrive();
  const file = makeFile('same.bin', MB);
  drive.existing.set('root', [remote('a', 'same.bin', MB, file.lastModified)]);
  const engine = makeEngine(drive);
  engine.setExistingFiles('keep');

  const done = idle(engine);
  engine.add([{ file, relativePath: 'same.bin' }], 'root');
  const [job] = await done;

  assert.equal(job!.status, 'done');
  assert.notEqual(job!.driveFile?.id, 'a');
  assert.deepEqual(drive.replaced, []);
});

test('restored uploads come back in the order they were added', () => {
  const engine = makeEngine(new FakeDrive());
  const record = (id: string, addedAt: number): StoredJob => ({
    id,
    name: `${id}.bin`,
    relativePath: `${id}.bin`,
    size: MB,
    lastModified: 1,
    mimeType: '',
    destinationId: 'root',
    status: 'uploading',
    uploadedBytes: 0,
    addedAt,
  });

  engine.restore([record('c', 3), record('a', 1), record('b', 2)]);

  assert.deepEqual(
    engine.list().map((job) => job.id),
    ['a', 'b', 'c']
  );

  // Files added in the same millisecond still get distinct, ordered times
  const sameMoment = makeEngine(new FakeDrive(), { now: () => 1000 });
  sameMoment.add(
    ['x', 'y', 'z'].map((name) => ({
      file: makeFile(name, 1),
      relativePath: name,
    })),
    'root'
  );
  const times = sameMoment.list().map((job) => job.addedAt);
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b)
  );
  assert.equal(new Set(times).size, 3);
  sameMoment.pauseAll();
});

test('clearing finished uploads forgets failed ones in storage too', async () => {
  const drive = new FakeDrive();
  drive.startFault = () => ({
    type: 'status',
    status: 403,
    reason: 'forbidden',
  });
  const removed: string[] = [];
  const engine = makeEngine(drive, {
    store: {
      save: () => Promise.resolve(),
      remove: (id) => {
        removed.push(id);
        return Promise.resolve();
      },
    },
  });

  const done = idle(engine);
  engine.add([{ file: makeFile('a.bin', MB), relativePath: 'a.bin' }], 'root');
  const [job] = await done;
  assert.equal(job!.status, 'failed');

  engine.clearFinished();

  assert.deepEqual(removed, [job!.id]);
  assert.equal(engine.list().length, 0);
});

test('pause and resume continue the same session', async () => {
  const drive = new FakeDrive();
  drive.chunkDelay = 20;
  const engine = makeEngine(drive);
  const file = makeFile('pausable.bin', 50 * MB);

  engine.add([{ file, relativePath: file.name }], 'root');
  const id = engine.list()[0]!.id;
  await new Promise((resolve) => setTimeout(resolve, 30));
  engine.pause(id);
  assert.equal(engine.list()[0]!.status, 'paused');
  assert.equal(engine.isBusy(), false);

  const done = idle(engine);
  engine.resume(id);
  const [job] = await done;

  assert.equal(job!.status, 'done');
  assert.equal(drive.sessionsStarted, 1);
  await assertStored(drive, file, job!);
});

test('cancel stops the upload and closes its Drive session', async () => {
  const drive = new FakeDrive();
  drive.chunkDelay = 20;
  const engine = makeEngine(drive);
  const file = makeFile('cancel.bin', 50 * MB);

  engine.add([{ file, relativePath: file.name }], 'root');
  await new Promise((resolve) => setTimeout(resolve, 30));
  engine.cancel(engine.list()[0]!.id);
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(engine.list()[0]!.status, 'cancelled');
  assert.equal(drive.cancelled.length, 1);
  assert.equal(drive.files.length, 0);
});

test('waits for the network to return without using up retries', async () => {
  const drive = new FakeDrive();
  let online = true;
  let reconnect: () => void = () => undefined;
  const engine = makeEngine(drive, {
    isOnline: () => online,
    waitForOnline: () => new Promise((resolve) => (reconnect = resolve)),
  });
  const file = makeFile('offline.bin', 20 * MB);
  let drops = 0;
  drive.chunkFault = (_name, chunk) => {
    if (chunk === 2 && drops++ === 0) {
      online = false;
      return { type: 'network' };
    }
    return null;
  };

  const done = idle(engine);
  engine.add([{ file, relativePath: file.name }], 'root');
  while (engine.list()[0]!.status !== 'offline')
    await new Promise((resolve) => setTimeout(resolve, 1));
  online = true;
  reconnect();
  const [job] = await done;

  assert.equal(job!.status, 'done');
  await assertStored(drive, file, job!);
});

test('a restored upload continues from the bytes Drive already has', async () => {
  const drive = new FakeDrive();
  const file = makeFile('resume.bin', 30 * MB);

  // First run: Drive stores 16 MiB, then the browser "closes"
  const saved: StoredJob[] = [];
  const first = makeEngine(drive, {
    store: {
      save: async (job) => void saved.splice(0, saved.length, job),
      remove: async () => undefined,
    },
  });
  drive.chunkFault = (_name, chunk) =>
    chunk === 2 ? { type: 'partial', fraction: 0.5 } : null;
  first.add([{ file, relativePath: file.name }], 'root');
  while (!saved[0]?.uploadedBytes)
    await new Promise((resolve) => setTimeout(resolve, 1));
  first.pauseAll();

  // Second run: the same file is picked again
  drive.chunkFault = () => null;
  const second = makeEngine(drive);
  second.restore(saved);
  assert.equal(second.waitingForFiles().length, 1);
  const done = idle(second);
  second.add([{ file, relativePath: file.name }], 'root');
  const [job] = await done;

  assert.equal(job!.status, 'done');
  assert.equal(drive.sessionsStarted, 1);
  await assertStored(drive, file, job!);
});

test('refuses to resume with a file that changed', () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  const file = makeFile('changed.bin', MB);
  engine.restore([
    {
      id: 'x',
      name: file.name,
      relativePath: file.name,
      size: file.size + 1,
      lastModified: file.lastModified,
      mimeType: '',
      destinationId: 'root',
      status: 'uploading',
      uploadedBytes: 0,
      addedAt: 0,
    },
  ]);
  assert.equal(engine.reattach('x', file), false);
});

test('empty files are created without a resumable session', async () => {
  const drive = new FakeDrive();
  const engine = makeEngine(drive);
  const done = idle(engine);
  engine.add(
    [{ file: makeFile('empty.txt', 0), relativePath: 'empty.txt' }],
    'root'
  );
  const [job] = await done;
  assert.equal(job!.status, 'done');
  assert.equal(drive.sessionsStarted, 0);
});

test('reports speed and time left while uploading', async () => {
  const drive = new FakeDrive();
  drive.chunkDelay = 150;
  let clock = 0;
  const engine = makeEngine(drive, { now: () => clock });
  const file = makeFile('timed.bin', 40 * MB);
  const ticker = setInterval(() => (clock += 100), 10);

  engine.add([{ file, relativePath: file.name }], 'root');
  while (engine.stats().uploadedBytes === 0)
    await new Promise((resolve) => setTimeout(resolve, 5));
  clock += 1000;
  const stats = engine.stats();
  clearInterval(ticker);
  engine.cancel(engine.list()[0]!.id);

  assert.ok(stats.speed > 0, 'speed should be known after the first chunk');
  assert.ok(stats.secondsLeft !== null && stats.secondsLeft > 0);
});
