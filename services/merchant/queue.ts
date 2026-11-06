import { DatabaseSync } from 'node:sqlite';
import { keccak256, type Hex } from 'viem';

export interface TransactionTransport {
  prepare(): Promise<Hex>;
  broadcast(raw: Hex): Promise<unknown>;
  receipt(hash: Hex): Promise<'pending' | 'success' | 'reverted'>;
}

/** Single process signer queue. A persisted raw transaction is never replaced implicitly. */
export class TransactionQueue {
  private db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS transactions (
        job TEXT PRIMARY KEY, hash TEXT NOT NULL, raw TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','success','reverted')),
        created_at INTEGER NOT NULL
      );`);
  }
  close() { this.db.close(); }
  execute(job: string, transport: TransactionTransport) {
    const operation = this.tail.then(() => this.run(job, transport));
    this.tail = operation.catch(() => undefined);
    return operation;
  }
  private async run(job: string, transport: TransactionTransport) {
    type Row = { job: string; hash: Hex; raw: Hex; state: 'pending' | 'success' | 'reverted' };
    let row = this.db.prepare('SELECT * FROM transactions WHERE job = ?').get(job) as Row | undefined;
    if (!row) {
      // Do not allocate the signer another nonce while the previous outcome is unresolved.
      const pending = this.db.prepare("SELECT job FROM transactions WHERE state = 'pending' LIMIT 1").get();
      if (pending) throw new Error('An earlier transaction must be reconciled first');
      const raw = await transport.prepare();
      row = { job, raw, hash: keccak256(raw), state: 'pending' };
      this.db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?)')
        .run(job, row.hash, raw, 'pending', Date.now());
    }
    if (row.state !== 'pending') return { hash: row.hash, state: row.state };
    const state = await transport.receipt(row.hash);
    if (state !== 'pending') {
      this.db.prepare('UPDATE transactions SET state = ? WHERE job = ?').run(state, job);
      return { hash: row.hash, state };
    }
    await transport.broadcast(row.raw);
    return { hash: row.hash, state: 'pending' as const };
  }
  pending(): { job: string; hash: Hex }[] {
    return this.db.prepare("SELECT job, hash FROM transactions WHERE state = 'pending' ORDER BY created_at")
      .all() as { job: string; hash: Hex }[];
  }
}
