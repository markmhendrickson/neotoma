import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Upload, 
  Search, 
  Users, 
  Calendar, 
  TrendingUp,
  Clock,
  CheckCircle2
} from 'lucide-react';
import type { NeotomaRecord } from '@/types/record';

interface DashboardProps {
  records: NeotomaRecord[];
  totalEntities: number;
  totalEvents: number;
  onNavigate: (view: string) => void;
  onRecordClick?: (record: NeotomaRecord) => void;
}

export function Dashboard({ 
  records, 
  totalEntities, 
  totalEvents, 
  onNavigate,
  onRecordClick 
}: DashboardProps) {
  const recentRecords = records.slice(0, 5);
  const recordsByType = records.reduce((acc, record) => {
    acc[record.type] = (acc[record.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topTypes = Object.entries(recordsByType)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your personal memory system
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => onNavigate('records')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{records.length}</div>
            <p className="text-xs text-muted-foreground">
              Across {Object.keys(recordsByType).length} types
            </p>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => onNavigate('entities')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entities</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEntities}</div>
            <p className="text-xs text-muted-foreground">
              People, companies, locations
            </p>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 cursor-pointer transition-colors" onClick={() => onNavigate('timeline')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Timeline Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEvents}</div>
            <p className="text-xs text-muted-foreground">
              Extracted from date fields
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and workflows</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button onClick={() => onNavigate('upload')} className="justify-start">
            <Upload className="h-4 w-4 mr-2" />
            Upload Documents
          </Button>
          <Button variant="outline" onClick={() => onNavigate('records')} className="justify-start">
            <Search className="h-4 w-4 mr-2" />
            Search Records
          </Button>
          <Button variant="outline" onClick={() => onNavigate('timeline')} className="justify-start">
            <Calendar className="h-4 w-4 mr-2" />
            View Timeline
          </Button>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Records */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Records
            </CardTitle>
            <CardDescription>Last 5 uploaded documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No records yet</p>
                  <Button 
                    variant="link" 
                    onClick={() => onNavigate('upload')}
                    className="mt-2"
                  >
                    Upload your first document
                  </Button>
                </div>
              ) : (
                recentRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => onRecordClick?.(record)}
                  >
                    <div className="flex-shrink-0 mt-1">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-1">
                        {record.summary}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {record.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(record.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Record Types Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Record Types
            </CardTitle>
            <CardDescription>Distribution by document type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topTypes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No records yet to analyze</p>
                </div>
              ) : (
                topTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-sm font-medium">{type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(count / records.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-8 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}








