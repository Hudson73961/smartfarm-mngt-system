import { describe, expect, it } from 'vitest';

import { formatDate, formatKES } from '../src/utils/format.js';

describe('Smart Farmer utilities', () => {
  it('formats Kenyan currency values correctly', () => {
    const value = formatKES(1234.5);

    expect(value).toContain('1,234.50');
    expect(value).toContain('K');
  });

  it('formats dates without returning invalid values', () => {
    const value = formatDate('2024-01-01T00:00:00.000Z');

    expect(value).not.toBe('N/A');
    expect(value).toMatch(/\d+/);
  });
});
