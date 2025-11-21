import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  const props: React.ComponentProps<typeof RecordsTable> = {
    records: [baseRecord],
    totalCount: 1,
    types: ['note', 'task'],
    onRecordClick,
    onDeleteRecord,
    onDeleteRecords,
    onSearch,
    onTypeFilter,
    ...overrides,
  };

  if (overrides.totalCount === undefined) {
    props.totalCount = props.records.length;
  }

  const result = render(<RecordsTable {...props} />);

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

function getLatestColumnsButton() {
  const buttons = screen.getAllByRole('button', { name: 'Columns' });
  return buttons[buttons.length - 1];
}

async function openColumnsMenu(user: ReturnType<typeof userEvent.setup>) {
  if (screen.queryByRole('menu')) {
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  }
  const columnsButton = getLatestColumnsButton();
  await user.click(columnsButton);
  const menu = await screen.findByRole('menu');
  return { columnsButton, menu };
}

async function togglePropertyColumn(
  user: ReturnType<typeof userEvent.setup>,
  columnLabel: string,
  options: { closeMenu?: boolean } = { closeMenu: true }
) {
  const { menu } = await openColumnsMenu(user);
  const checkbox = within(menu).getByRole('menuitemcheckbox', { name: columnLabel });
  await user.click(checkbox);
  if (options.closeMenu !== false) {
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  }
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

    const columnsButton = getLatestColumnsButton();
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

    const columnsButton = getLatestColumnsButton();
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

  it('resizes columns and persists widths to localStorage', async () => {
    const firstRender = renderTable();

    const summaryHeader = screen.getByRole('columnheader', { name: /Summary/ });
    const resizeHandle = within(summaryHeader).getByLabelText('Resize Summary column');

    fireEvent.mouseDown(resizeHandle, { clientX: 100 });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('recordsTableColumnWidths') ?? '{}');
      expect(stored.summary).toBeGreaterThan(0);
    });
    const stored = JSON.parse(window.localStorage.getItem('recordsTableColumnWidths') ?? '{}');
    const storedWidth = stored.summary;
    expect(summaryHeader.style.width).toBe(`${storedWidth}px`);

    firstRender.unmount();
    renderTable();

    const rerenderedSummaryHeader = screen.getByRole('columnheader', { name: /Summary/ });
    expect(rerenderedSummaryHeader.style.width).toBe(`${storedWidth}px`);
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

  it('renders empty placeholder with upload shortcut when no records exist', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    renderTable({ records: [], totalCount: 0 });

    expect(screen.getByText('No records yet')).toBeInTheDocument();
    const uploadButton = screen.getByRole('button', { name: 'Upload file' });
    await user.click(uploadButton);

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('keeps empty placeholder visible during refetches after first load', () => {
    const props: React.ComponentProps<typeof RecordsTable> = {
      records: [],
      totalCount: 0,
      types: [],
      onRecordClick: vi.fn(),
      onDeleteRecord: vi.fn(),
      onDeleteRecords: vi.fn(),
      onSearch: vi.fn(),
      onTypeFilter: vi.fn(),
      isLoading: true,
    };

    const { rerender } = render(<RecordsTable {...props} />);

    expect(screen.queryByText('No records yet')).not.toBeInTheDocument();

    rerender(<RecordsTable {...props} isLoading={false} />);
    expect(screen.getByText('No records yet')).toBeInTheDocument();

    rerender(<RecordsTable {...props} isLoading />);
    expect(screen.getByText('No records yet')).toBeInTheDocument();
  });

  it('opens the learn more sheet from the empty state', async () => {
    const user = userEvent.setup();
    renderTable({ records: [], totalCount: 0 });

    const learnMoreButton = screen.getByRole('button', { name: 'Learn more' });
    await user.click(learnMoreButton);

    expect(await screen.findByText('What can I store?')).toBeInTheDocument();
  });

  it('displays property columns dynamically from record properties', async () => {
    const user = userEvent.setup();
    const recordWithProperties: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_2',
      properties: {
        'Full Name': 'John Doe',
        amount: 100.5,
        is_active: true,
      },
    };

    renderTable({ records: [recordWithProperties] });

    expect(screen.queryByText('Full Name')).not.toBeInTheDocument();

    await togglePropertyColumn(user, 'Full Name');
    await togglePropertyColumn(user, 'Amount');
    await togglePropertyColumn(user, 'Is Active');

    expect(await screen.findByText('Full Name')).toBeInTheDocument();
    expect(await screen.findByText('Amount')).toBeInTheDocument();
    expect(await screen.findByText('Is Active')).toBeInTheDocument();
  });

  it('renders property values correctly for different types', async () => {
    const user = userEvent.setup();
    const recordWithProperties: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_3',
      properties: {
        name: 'Test',
        count: 42,
        active: true,
        tags: ['tag1', 'tag2'],
      },
    };

    renderTable({ records: [recordWithProperties] });

    await togglePropertyColumn(user, 'Name');
    await togglePropertyColumn(user, 'Count');
    await togglePropertyColumn(user, 'Active');
    await togglePropertyColumn(user, 'Tags');

    expect(await screen.findByText('Test')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(await screen.findByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('2 item(s)')).toBeInTheDocument();
  });

  it('allows toggling property column visibility', async () => {
    const user = userEvent.setup();
    const recordWithProperties: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_4',
      properties: {
        'Full Name': 'Jane Doe',
      },
    };

    renderTable({ records: [recordWithProperties] });

    await togglePropertyColumn(user, 'Full Name');
    expect(await screen.findByText('Full Name')).toBeInTheDocument();
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();

    await togglePropertyColumn(user, 'Full Name');

    expect(screen.queryByText('Full Name')).not.toBeInTheDocument();
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });

  it('persists property column visibility preferences', async () => {
    const user = userEvent.setup();
    const recordWithProperties: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_5',
      properties: {
        'Email Address': 'test@example.com',
      },
    };

    const firstRender = renderTable({ records: [recordWithProperties] });

    await togglePropertyColumn(user, 'Email Address');
    expect((await screen.findAllByText('Email Address'))[0]).toBeInTheDocument();

    firstRender.unmount();
    renderTable({ records: [recordWithProperties] });

    expect((await screen.findAllByText('Email Address'))[0]).toBeInTheDocument();
  });

  it('prunes stale property column visibility when records change', async () => {
    const user = userEvent.setup();
    const record1: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_6',
      properties: {
        old_property: 'value1',
      },
    };

    const firstRender = renderTable({ records: [record1] });

    await togglePropertyColumn(user, 'Old Property');
    expect(await screen.findByText('Old Property')).toBeInTheDocument();

    const record2: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_7',
      properties: {
        new_property: 'value2',
      },
    };

    firstRender.rerender(
      <RecordsTable
        records={[record2]}
        totalCount={1}
        types={['note']}
        onRecordClick={vi.fn()}
        onDeleteRecord={vi.fn()}
        onDeleteRecords={vi.fn()}
        onSearch={vi.fn()}
        onTypeFilter={vi.fn()}
      />
    );

    expect(screen.queryByText('Old Property')).not.toBeInTheDocument();
    await togglePropertyColumn(user, 'New Property');
    expect(await screen.findByText('New Property')).toBeInTheDocument();
  });
});


