import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { VisualizationRequest } from '@/types/visualization';
import type { DatastoreAPI } from '@/hooks/useDatastore';
import type { NeotomaRecord } from '@/types/record';
import type { LocalRecord } from '@/store/types';
import {
  useVisualizations,
  updateVisualizationPreferences,
  setLastViewedVisualization,
} from '@/store/visualizations';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
} from 'recharts';
import { validateVisualizationCandidate } from '@/utils/canVisualize';
import { trackEvent } from '@/lib/analytics';

type GraphPanelProps = {
  messageId: string;
  request: VisualizationRequest;
  datastore: DatastoreAPI;
  seedRecords?: NeotomaRecord[];
  onClose: () => void;
};

const DIMENSION_ORDER_KEY = '__record_order__';
const MEASURE_COLORS = ['#2563eb', '#10b981', '#f97316', '#a855f7'];

const formatDimensionLabel = (value: string | number | Date) => {
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return typeof value === 'number' ? value.toString() : value;
};

const normalizeSeedRecord = (record: NeotomaRecord): LocalRecord => ({
  id: record.id,
  type: record.type,
  summary: record.summary ?? null,
  properties: record.properties ?? {},
  file_urls: Array.isArray(record.file_urls) ? record.file_urls : [],
  embedding: record.embedding ?? null,
  created_at: record.created_at,
  updated_at: record.updated_at,
});

const ChartFallback = ({ message }: { message: string }) => (
  <div className="flex h-64 w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-sm text-muted-foreground">
    {message}
  </div>
);

export function GraphPanel({ messageId, request, datastore, seedRecords = [], onClose }: GraphPanelProps) {
  const visualizationState = useVisualizations();
  const preferences = visualizationState.entries[messageId]?.preferences;
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const datastoreReady = datastore.initialized;
  const getRecord = datastore.getRecord;

  const selectedGraphType = preferences?.selectedGraphType ?? request.graphType;
  const selectedDimensionMode =
    preferences?.dimensionFieldKey ?? (request.dimensionField ? request.dimensionField.key : DIMENSION_ORDER_KEY);
  const initialSelectedMeasures =
    preferences?.measureFieldKeys ??
    (request.measureFields?.map((field) => field.key) ?? []);

  const [selectedMeasures, setSelectedMeasures] = useState<string[]>(
    initialSelectedMeasures.length > 0
      ? initialSelectedMeasures
      : request.measureFields?.length
      ? [request.measureFields[0].key]
      : []
  );

  useEffect(() => {
    // Keep local selection synced if preferences change externally
    if (
      preferences?.measureFieldKeys &&
      preferences.measureFieldKeys.length > 0 &&
      preferences.measureFieldKeys.join('|') !== selectedMeasures.join('|')
    ) {
      setSelectedMeasures(preferences.measureFieldKeys);
    }
  }, [preferences?.measureFieldKeys, selectedMeasures]);

  useEffect(() => {
    setLastViewedVisualization(messageId);
  }, [messageId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateRecords = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!datastoreReady) {
          setError('Datastore is still initializing. Try again shortly.');
          setLoading(false);
          return;
        }

        const seedMap = new Map<string, LocalRecord>();
        seedRecords.forEach((record) => {
          seedMap.set(record.id, normalizeSeedRecord(record));
        });

        const hydrated: LocalRecord[] = Array.from(seedMap.values());
        const targetIds = request.recordIds && request.recordIds.length > 0
          ? request.recordIds.filter((id) => !seedMap.has(id))
          : [];

        if (targetIds.length === 0) {
          if (hydrated.length === 0) {
            setError('Visualization did not include any record references.');
          } else {
            setRecords(hydrated);
          }
          setLoading(false);
          return;
        }

        for (const id of targetIds) {
          if (seedMap.has(id)) {
            hydrated.push(seedMap.get(id)!);
            continue;
          }
          try {
            const fetched = await getRecord(id);
            if (fetched) {
              hydrated.push(fetched);
            } else {
              setError((prev) => prev ?? `Record ${id} is not available locally yet.`);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError((prev) => prev ?? `Failed to load record ${id}: ${message}`);
          }
        }

        if (!cancelled) {
          setRecords(hydrated);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to hydrate visualization data.';
          setError(message);
          setLoading(false);
        }
      }
    };

    hydrateRecords();

    return () => {
      cancelled = true;
    };
  }, [datastoreReady, getRecord, request.recordIds, seedRecords, messageId]);

  const effectiveRequest = useMemo<VisualizationRequest>(() => {
    const dimensionField =
      selectedDimensionMode === DIMENSION_ORDER_KEY ? undefined : request.dimensionField;

    const allowedMeasureKeys =
      request.measureFields?.filter((field) => selectedMeasures.includes(field.key)) ?? [];

    return {
      ...request,
      graphType: selectedGraphType,
      dimensionField,
      measureFields: allowedMeasureKeys.length > 0 ? allowedMeasureKeys : request.measureFields,
    };
  }, [request, selectedGraphType, selectedDimensionMode, selectedMeasures]);

  const validation = useMemo(() => {
    return validateVisualizationCandidate({
      request: effectiveRequest,
      records,
    });
  }, [effectiveRequest, records]);

  const formattedData = useMemo(() => {
    if (!validation.records.length) {
      return [];
    }
    return validation.records.map((row) => {
      const dimensionValue =
        row.dimension instanceof Date ? row.dimension.getTime() : row.dimension;
      return {
        id: row.id,
        dimensionValue,
        dimensionLabel: formatDimensionLabel(row.dimension),
        ...row.measures,
      };
    });
  }, [validation.records]);

  useEffect(() => {
    if (!validation.ok || !formattedData.length) {
      return;
    }
    trackEvent('visualization_rendered', {
      messageId,
      graphType: selectedGraphType,
      sampleSize: formattedData.length,
      dimension: effectiveRequest.dimensionField?.key ?? DIMENSION_ORDER_KEY,
      datasetLabel: request.datasetLabel ?? 'chat',
    });
  }, [
    validation.ok,
    formattedData.length,
    messageId,
    selectedGraphType,
    effectiveRequest.dimensionField?.key,
    request.datasetLabel,
  ]);

  const handleToggleMeasure = (key: string, checked: boolean) => {
    setSelectedMeasures((prev) => {
      let next: string[];
      if (checked) {
        next = [...prev, key];
      } else {
        next = prev.filter((value) => value !== key);
        if (next.length === 0) {
          // Always keep at least one measure selected
          next = [key];
        }
      }
      updateVisualizationPreferences(messageId, { measureFieldKeys: next });
      return next;
    });
  };

  const handleGraphTypeChange = (type: VisualizationRequest['graphType']) => {
    updateVisualizationPreferences(messageId, { selectedGraphType: type });
  };

  const handleDimensionChange = (value: string) => {
    updateVisualizationPreferences(messageId, { dimensionFieldKey: value });
  };

  const handleExportCsv = () => {
    if (!formattedData.length) return;
    const measureKeys = effectiveRequest.measureFields?.map((field) => field.key) ?? [];
    const header = ['dimension', ...measureKeys];
    const rows = formattedData.map((row) => [
      row.dimensionLabel,
      ...measureKeys.map((key) => row[key] ?? ''),
    ]);
    const csv = [header, ...rows]
      .map((line) =>
        line
          .map((cell) => {
            if (cell === null || cell === undefined) return '';
            const stringValue = String(cell);
            return stringValue.includes(',') ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${request.datasetLabel || 'visualization'}-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const chartContent = (() => {
    if (loading) {
      return <ChartFallback message="Loading records…" />;
    }
    if (error) {
      return <ChartFallback message={error} />;
    }
    if (!validation.ok) {
      return <ChartFallback message={validation.errors[0] ?? 'Visualization unavailable.'} />;
    }
    if (!formattedData.length) {
      return <ChartFallback message="No numeric data available for this visualization." />;
    }
    const measureKeys = effectiveRequest.measureFields?.map((field) => field.key) ?? [];
    const dimensionIsNumeric = typeof formattedData[0]?.dimensionValue === 'number';

    const tooltipFormatter = (value: number, key: string) => [`${value}`, key];
    const tooltipLabelFormatter = (_: unknown, payload: any[]) => {
      const target = payload?.[0];
      return target?.payload?.dimensionLabel ?? '';
    };

    const renderLines = () =>
      measureKeys.map((key, index) => (
        <Line
          key={key}
          dataKey={key}
          type="monotone"
          stroke={MEASURE_COLORS[index % MEASURE_COLORS.length]}
          strokeWidth={2}
          dot={selectedGraphType === 'scatter'}
          isAnimationActive={false}
        />
      ));

    const renderBars = (stacked = false) =>
      measureKeys.map((key, index) => (
        <Bar
          key={key}
          dataKey={key}
          stackId={stacked ? 'stack' : undefined}
          fill={MEASURE_COLORS[index % MEASURE_COLORS.length]}
          isAnimationActive={false}
        />
      ));

    switch (selectedGraphType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dimensionValue"
                type={dimensionIsNumeric ? 'number' : 'category'}
                tickFormatter={(_value, index) => formattedData[index]?.dimensionLabel ?? ''}
              />
              <YAxis />
              <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
              <Legend />
              {renderLines()}
            </LineChart>
          </ResponsiveContainer>
        );
      case 'stacked_bar':
        return (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dimensionValue"
                type={dimensionIsNumeric ? 'number' : 'category'}
                tickFormatter={(_value, index) => formattedData[index]?.dimensionLabel ?? ''}
              />
              <YAxis />
              <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
              <Legend />
              {renderBars(true)}
            </BarChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dimensionValue"
                type={dimensionIsNumeric ? 'number' : 'category'}
                tickFormatter={(_value, index) => formattedData[index]?.dimensionLabel ?? ''}
              />
              <YAxis dataKey={measureKeys[0]} />
              <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
              <Legend />
              <Scatter
                data={formattedData}
                fill={MEASURE_COLORS[0]}
                dataKey={measureKeys[0]}
                name={measureKeys[0]}
                isAnimationActive={false}
              />
            </ScatterChart>
          </ResponsiveContainer>
        );
      case 'bar':
      default:
        return (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={formattedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="dimensionValue"
                type={dimensionIsNumeric ? 'number' : 'category'}
                tickFormatter={(_value, index) => formattedData[index]?.dimensionLabel ?? ''}
              />
              <YAxis />
              <Tooltip formatter={tooltipFormatter} labelFormatter={tooltipLabelFormatter} />
              <Legend />
              {renderBars(false)}
            </BarChart>
          </ResponsiveContainer>
        );
    }
  })();

  const dimensionOptions = [
    request.dimensionField && {
      value: request.dimensionField.key,
      label: request.dimensionField.label ?? request.dimensionField.key,
    },
    { value: DIMENSION_ORDER_KEY, label: 'Record order' },
  ].filter(Boolean) as Array<{ value: string; label: string }>;

  const measureOptions = request.measureFields ?? [];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="uppercase tracking-wide">
              {selectedGraphType.replace('_', ' ')}
            </Badge>
            {request.datasetLabel && (
              <span className="text-sm font-medium text-muted-foreground">{request.datasetLabel}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {request.justification}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!formattedData.length}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <Card className="border-border/70">
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-border/70">
          <CardTitle className="text-base font-semibold">Visualization Controls</CardTitle>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Graph type</span>
              <div className="flex flex-wrap gap-2">
                {(['line', 'bar', 'stacked_bar', 'scatter'] as VisualizationRequest['graphType'][]).map((type) => (
                  <Button
                    key={type}
                    variant={type === selectedGraphType ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleGraphTypeChange(type)}
                  >
                    {type.replace('_', ' ')}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Dimension</span>
              <Select value={selectedDimensionMode} onValueChange={handleDimensionChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose dimension" />
                </SelectTrigger>
                <SelectContent>
                  {dimensionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Measures</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-between">
                    {selectedMeasures.length} selected
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Measures</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {measureOptions.map((field) => (
                    <DropdownMenuCheckboxItem
                      key={field.key}
                      checked={selectedMeasures.includes(field.key)}
                      onCheckedChange={(checked) => handleToggleMeasure(field.key, Boolean(checked))}
                    >
                      {field.label ?? field.key}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">{chartContent}</CardContent>
      </Card>
      {validation.warnings.length > 0 && (
        <>
          <Separator />
          <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <strong className="font-semibold">Warnings:</strong> {validation.warnings.slice(0, 3).join(' • ')}
            {validation.warnings.length > 3 && ' • …'}
          </div>
        </>
      )}
    </div>
  );
}

