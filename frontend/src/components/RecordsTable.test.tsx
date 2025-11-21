import { render, screen, waitFor, within } from '@testing-library/react';
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

    // Closing the menu ensures layout updates propagate
    await user.click(columnsButton);

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
    await user.click(columnsButton);

    expect(screen.queryByText('First note')).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.queryByText('First note')).not.toBeInTheDocument();
  });

  it('displays property columns dynamically from record properties', async () => {
    const user = userEvent.setup();
    const recordWithProperties: NeotomaRecord = {
      ...baseRecord,
      id: 'rec_2',
      properties: {
        'Full Name': 'John Doe',
        amount: 100.50,
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

    // String value
    expect(await screen.findByText('Test')).toBeInTheDocument();
    // Number value (formatted with toLocaleString)
    expect(await screen.findByText('42')).toBeInTheDocument();
    // Boolean value (converted to Yes/No)
    expect(await screen.findByText('Yes')).toBeInTheDocument();
    // Array value (shows count)
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

    // Column should be hidden
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

    // Unmount and remount
    firstRender.unmount();
    renderTable({ records: [recordWithProperties] });

    // Property column should still be visible
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

    // Change records to have different properties
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
        types={['note']}
        onRecordClick={vi.fn()}
        onSearch={vi.fn()}
        onTypeFilter={vi.fn()}
      />
    );

    // Old property column should be gone, new one can be shown
    expect(screen.queryByText('Old Property')).not.toBeInTheDocument();
    await togglePropertyColumn(user, 'New Property');
    expect(await screen.findByText('New Property')).toBeInTheDocument();
  });
});


