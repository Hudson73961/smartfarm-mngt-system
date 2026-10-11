import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDate, formatKES } from '../src/utils/format.ts';

test('formats Kenyan currency values correctly', () => {
  const value = formatKES(1234.5);

  assert.match(value, /1,234.50|1\s234,50/);
  assert.match(value, /K|Sh/);
});

test('formats dates without returning invalid values', () => {
  const value = formatDate('2024-01-01T00:00:00.000Z');

  assert.notEqual(value, 'N/A');
  assert.match(value, /\d+/);
});
