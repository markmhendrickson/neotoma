import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordsTable } from './RecordsTable';
import type { NeotomaRecord } from '@/types/record';

const baseRecord: NeotomaRecord = {
  id: 'rec_1',
  type: 'note',
  summary: 'First note',
  properties: { text: 'First note' },
  file_urls: [],
  created_at: new Date('2024-01-01T00:00:00Z').toISOString(),
  updated_at: new Date('2024-01-02T00:00:00Z').toISOString(),
  embedding: null,
  _status: 'Ready',
};

function renderTable(overrides: Partial<React.ComponentProps<typeof RecordsTable>> = {}) {
  const onRecordClick = vi.fn();
  const onSearch = vi.fn();
  const onTypeFilter = vi.fn();

  const result = render(
    <RecordsTable
      records={[baseRecord]}
      types={['note', 'task']}
      onRecordClick={onRecordClick}
      onSearch={onSearch}
      onTypeFilter={onTypeFilter}
      {...overrides}
    />
  );

  return {
    ...result,
    onRecordClick,
    onSearch,
    onTypeFilter,
  };
}

describe('RecordsTable', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('forwards search input changes to onSearch callback', async () => {
    const user = userEvent.setup();
    const { onSearch } = renderTable();

    const input = screen.getByPlaceholderText('Search records...');
    await user.clear(input);
    await user.type(input, 'work');

    expect(onSearch).toHaveBeenLastCalledWith('work');
    expect(onSearch).toHaveBeenCalledTimes(4); // one call per character
  });

  it('toggles column visibility via the Columns dropdown', async () => {
    const user = userEvent.setup();
    renderTable();

    const columnsButton = screen.getByRole('button', { name: 'Columns' });
    await user.click(columnsButton);

    const menu = await screen.findByRole('menu');
    const summaryToggle = within(menu).getByRole('menuitemcheckbox', { name: 'Summary' });
    await user.click(summaryToggle);

    // Closing the menu ensures layout updates propagate
    await user.click(columnsButton);

    expect(screen.queryByText('First note')).not.toBeInTheDocument();
  });

  it('persists column visibility preferences to localStorage', async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    const columnsButton = screen.getByRole('button', { name: 'Columns' });
    await user.click(columnsButton);
    const menu = await screen.findByRole('menu');
    const summaryToggle = within(menu).getByRole('menuitemcheckbox', { name: 'Summary' });
    await user.click(summaryToggle);
    await user.click(columnsButton);

    expect(screen.queryByText('First note')).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.queryByText('First note')).not.toBeInTheDocument();
  });
});


