import Dexie, { type Table } from 'dexie';
import { apiFetch } from '../lib/api';

export interface PendingOperation {
  id?: number;
  clientId: string;
  tableName: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  syncedAt?: string;
  status: 'pending' | 'synced' | 'failed';
}

class OfflineDb extends Dexie {
  operations!: Table<PendingOperation, number>;

  constructor() {
    super('sfms-offline-db');
    this.version(1).stores({
      operations: '++id, clientId, tableName, status, createdAt',
    });
  }
}

export const db = new OfflineDb();

export async function queueOperation(item: Omit<PendingOperation, 'id' | 'createdAt' | 'status'>) {
  await db.operations.add({
    ...item,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
}

export async function getPendingOperations() {
  return db.operations.orderBy('createdAt').toArray();
}

export async function getPendingCount() {
  return db.operations.where('status').equals('pending').count();
}

export async function markOperationSynced(clientId: string) {
  const op = await db.operations.where('clientId').equals(clientId).first();
  if (!op || !op.id) return;

  await db.operations.update(op.id, {
    status: 'synced',
    syncedAt: new Date().toISOString(),
  });
}

export async function markOperationFailed(clientId: string, errorMessage?: string) {
  const op = await db.operations.where('clientId').equals(clientId).first();
  if (!op || !op.id) return;

  await db.operations.update(op.id, {
    status: 'failed',
    syncedAt: new Date().toISOString(),
    payload: { ...op.payload, lastError: errorMessage ?? 'sync failed' },
  });
}

export async function syncPendingOperations() {
  const pending = await getPendingOperations();
  if (pending.length === 0) {
    return { synced: [] as Array<{ clientId: string; status: string }> };
  }

  const response = await apiFetch<{ synced: Array<{ clientId: string; status: string }> }>('/api/sync', {
    method: 'POST',
    body: JSON.stringify({
      operations: pending.map(({ id: _id, createdAt: _createdAt, syncedAt: _syncedAt, status: _status, ...item }) => ({
        ...item,
      })),
    }),
  });

  for (const item of response.synced ?? []) {
    if (item.status === 'synced' || item.status === 'duplicate') {
      await markOperationSynced(item.clientId);
    } else {
      await markOperationFailed(item.clientId, item.status);
    }
  }

  return response;
}

export async function clearPendingOperations() {
  await db.operations.clear();
}
