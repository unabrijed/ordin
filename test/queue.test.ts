import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TransactionQueue } from '../services/merchant/queue.ts';

test('persist before broadcast, recover same bytes, and refuse another signer nonce until reconciled', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ordin-queue-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'billing.sqlite');
  let queue = new TransactionQueue(path);
  let preparations = 0;
  const transport = {
    prepare: async () => { preparations++; return '0x1234' as const; },
    broadcast: async () => { throw new Error('connection lost after submission'); },
    receipt: async () => 'pending' as const,
  };
  await assert.rejects(queue.execute('first', transport));
  assert.equal(queue.pending().length, 1);
  queue.close();
  queue = new TransactionQueue(path);
  t.after(() => queue.close());
  await assert.rejects(queue.execute('second', transport), /reconciled/);
  let broadcast = '';
  await queue.execute('first', { ...transport, broadcast: async raw => { broadcast = raw; } });
  assert.equal(broadcast, '0x1234');
  assert.equal(preparations, 1);
  const result = await queue.execute('first', { ...transport, receipt: async () => 'success' });
  assert.equal(result.state, 'success');
  await queue.execute('first', transport);
  assert.equal(preparations, 1);
  assert.deepEqual(queue.pending(), []);
});
