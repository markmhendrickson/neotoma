import { describe, expect, it, beforeEach, vi } from 'vitest';

const mockPrepare = vi.fn();

vi.mock('./sqlite.js', () => ({
  getDB: () => ({
    prepare: mockPrepare,
  }),
}));

import { countRecords } from './records';

const createStmt = (overrides: Partial<Record<string, unknown>> = {}) => {
  const stmt = {
    bind: vi.fn(),
    step: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
    get: vi.fn().mockReturnValue({ count: 0 }),
    finalize: vi.fn(),
    ...overrides,
  };
  mockPrepare.mockReturnValue(stmt);
  return stmt;
};

describe('records datastore helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not attempt to bind parameters when count has no filters', async () => {
    const stmt = createStmt({
      bind: vi.fn(() => {
        throw new Error('bind should not be called');
      }),
    });

    await expect(countRecords()).resolves.toBe(0);

    expect(stmt.bind).not.toHaveBeenCalled();
    expect(stmt.step).toHaveBeenCalled();
    expect(stmt.finalize).toHaveBeenCalled();
  });

  it('binds parameters when count query includes filters', async () => {
    const stmt = createStmt();

    await expect(countRecords({ type: 'note' })).resolves.toBe(0);

    expect(stmt.bind).toHaveBeenCalledWith(['note']);
    expect(stmt.step).toHaveBeenCalled();
  });
});


