import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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
  const onDeleteRecord = vi.fn();
  const onDeleteRecords = vi.fn();
  const onSearch = vi.fn();
  const onTypeFilter = vi.fn();

  const result = render(
    <RecordsTable
      records={[baseRecord]}
      types={['note', 'task']}
      onRecordClick={onRecordClick}
      onDeleteRecord={onDeleteRecord}
      onDeleteRecords={onDeleteRecords}
      onSearch={onSearch}
      onTypeFilter={onTypeFilter}
      {...overrides}
    />
  );

  return {
    ...result,
    onRecordClick,
    onDeleteRecord,
    onDeleteRecords,
    onSearch,
    onTypeFilter,
  };
}

function moveColumnWithKeyboard(columnId: string, direction: 'left' | 'right') {
  const header = document.querySelector<HTMLElement>(`[data-column-id="${columnId}"]`);
  if (!header) throw new Error(`Missing header for ${columnId}`);
  fireEvent.keyDown(header, { key: direction === 'left' ? 'ArrowLeft' : 'ArrowRight' });
}

function getVisibleColumnOrder() {
  return screen
    .getAllByRole('columnheader')
    .map((header) => header.getAttribute('data-column-id'))
    .filter((value): value is string => Boolean(value));
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

    // Close menu via escape to mimic clicking outside
    await user.keyboard('{Escape}');

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
    await user.keyboard('{Escape}');

    expect(screen.queryByText('First note')).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.queryByText('First note')).not.toBeInTheDocument();
  });

  it('reorders columns via drag and drop handles', async () => {
    renderTable();

    expect(getVisibleColumnOrder()[0]).toBe('select');
    moveColumnWithKeyboard('type', 'right');
    await waitFor(() => {
      const storedOrder = JSON.parse(window.localStorage.getItem('recordsTableColumnOrder') ?? '[]');
      expect(storedOrder[1]).toBe('summary');
      expect(getVisibleColumnOrder()[1]).toBe('summary');
    });
  });

  it('persists column order preferences to localStorage', async () => {
    const firstRender = renderTable();
    moveColumnWithKeyboard('type', 'right');
    await waitFor(() => {
      const storedOrder = JSON.parse(window.localStorage.getItem('recordsTableColumnOrder') ?? '[]');
      expect(storedOrder[1]).toBe('summary');
      expect(getVisibleColumnOrder()[1]).toBe('summary');
    });
    firstRender.unmount();

    renderTable();
    expect(getVisibleColumnOrder()[1]).toBe('summary');
  });

  it('opens the actions menu and triggers onRecordClick when View details is selected', async () => {
    const user = userEvent.setup();
    const { onRecordClick } = renderTable();

    const actionsButton = screen.getByRole('button', { name: /actions menu for record rec_1/i });
    await user.click(actionsButton);
    expect(onRecordClick).not.toHaveBeenCalled();

    const viewDetailsItem = await screen.findByRole('menuitem', { name: /view details/i });
    await user.click(viewDetailsItem);

    expect(onRecordClick).toHaveBeenCalledWith(baseRecord);
  });

  it('does not trigger onRecordClick when toggling a row checkbox', async () => {
    const user = userEvent.setup();
    const { onRecordClick } = renderTable();

    const checkbox = screen.getByRole('checkbox', { name: /select record rec_1/i });
    await user.click(checkbox);

    expect(onRecordClick).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('calls onDeleteRecord when Delete record is selected from the actions menu', async () => {
    const user = userEvent.setup();
    const { onDeleteRecord } = renderTable();

    const actionsButton = screen.getByRole('button', { name: /actions menu for record rec_1/i });
    await user.click(actionsButton);

    const deleteItem = await screen.findByRole('menuitem', { name: /delete record/i });
    await user.click(deleteItem);

    expect(onDeleteRecord).toHaveBeenCalledWith(baseRecord);
  });

  it('shows bulk delete controls when rows are selected', async () => {
    const user = userEvent.setup();
    renderTable();

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox', { name: /select record rec_1/i });
    await user.click(checkbox);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete selected' })).toBeInTheDocument();
  });

  it('invokes onDeleteRecords with selected rows when deleting in bulk', async () => {
    const user = userEvent.setup();
    const recordTwo: NeotomaRecord = { ...baseRecord, id: 'rec_2' };
    const { onDeleteRecords } = renderTable({
      records: [baseRecord, recordTwo],
    });

    const secondCheckbox = screen.getByRole('checkbox', { name: /select record rec_2/i });
    await user.click(secondCheckbox);

    const deleteSelectedButton = screen.getByRole('button', { name: 'Delete selected' });
    await user.click(deleteSelectedButton);

    expect(onDeleteRecords).toHaveBeenCalledWith([recordTwo]);
  });
});


