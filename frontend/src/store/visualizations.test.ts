import { describe, it, expect, beforeEach } from 'vitest';
import type { VisualizationRequest } from '@/types/visualization';
import {
  registerVisualization,
  updateVisualizationPreferences,
  getVisualizationState,
  __resetVisualizationsStoreForTest,
} from './visualizations';

const request: VisualizationRequest = {
  graphType: 'bar',
  justification: 'Mock chart',
  recordIds: ['a', 'b'],
  measureFields: [{ key: 'amount', label: 'Amount' }],
};

describe('visualizations store', () => {
  beforeEach(() => {
    __resetVisualizationsStoreForTest();
  });

  it('registers a visualization payload', () => {
    registerVisualization('message-1', request);
    const state = getVisualizationState();
    expect(state.entries['message-1']).toBeDefined();
    expect(state.entries['message-1'].request.graphType).toBe('bar');
  });

  it('persists user preferences', () => {
    registerVisualization('message-2', request);
    updateVisualizationPreferences('message-2', {
      selectedGraphType: 'line',
      measureFieldKeys: ['amount'],
    });
    const state = getVisualizationState();
    expect(state.entries['message-2'].preferences?.selectedGraphType).toBe('line');
  });
});

