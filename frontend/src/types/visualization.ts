export type VisualizationGraphType = 'line' | 'bar' | 'stacked_bar' | 'scatter';

export interface VisualizationMeasureField {
  key: string;
  label?: string;
  aggregate?: 'sum' | 'avg' | 'mean' | 'count' | 'min' | 'max';
  color?: string;
}

export interface VisualizationDimensionField {
  key: string;
  label?: string;
  kind?: 'time' | 'category';
}

export type VisualizationFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between';

export interface VisualizationFilter {
  key: string;
  operator: VisualizationFilterOperator;
  value: string | number | Array<string | number>;
}

export interface VisualizationRequest {
  graphType: VisualizationGraphType;
  justification: string;
  title?: string;
  datasetLabel?: string;
  summary?: string;
  recordIds?: string[];
  dimensionField?: VisualizationDimensionField;
  measureFields?: VisualizationMeasureField[];
  filters?: VisualizationFilter[];
  notes?: string;
}

