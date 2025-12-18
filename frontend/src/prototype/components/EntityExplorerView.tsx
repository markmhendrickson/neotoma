import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Users, 
  Building2, 
  MapPin, 
  Package,
  Search,
  ArrowLeft,
  ExternalLink
} from 'lucide-react';
import type { Entity } from '@/prototype/fixtures/entities';

interface EntityExplorerViewProps {
  entities: Entity[];
  onRecordClick?: (recordId: string) => void;
}

export function EntityExplorerView({ entities, onRecordClick }: EntityExplorerViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const filteredEntities = entities.filter(entity => {
    const matchesSearch = entity.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || entity.type === filterType;
    return matchesSearch && matchesType;
  });

  const entityCounts = {
    Person: entities.filter(e => e.type === 'Person').length,
    Company: entities.filter(e => e.type === 'Company').length,
    Location: entities.filter(e => e.type === 'Location').length,
    Product: entities.filter(e => e.type === 'Product').length,
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'Person': return <Users className="h-5 w-5" />;
      case 'Company': return <Building2 className="h-5 w-5" />;
      case 'Location': return <MapPin className="h-5 w-5" />;
      case 'Product': return <Package className="h-5 w-5" />;
      default: return <Users className="h-5 w-5" />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'Person': return 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/20';
      case 'Company': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'Location': return 'text-pink-600 bg-pink-100 dark:bg-pink-900/20';
      case 'Product': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  if (selectedEntity) {
    return (
      <div className="h-full overflow-y-auto bg-background p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedEntity(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getColor(selectedEntity.type)}`}>
                {getIcon(selectedEntity.type)}
              </div>
              <div className="flex-1">
                <CardTitle>{selectedEntity.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{selectedEntity.type}</Badge>
                  <span>{selectedEntity.related_records.length} linked records</span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Properties */}
            {Object.keys(selectedEntity.properties).length > 0 && (
              <div>
                <h4 className="font-semibold mb-3">Properties</h4>
                <div className="space-y-2">
                  {Object.entries(selectedEntity.properties).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3 text-sm">
                      <span className="text-muted-foreground min-w-[120px]">{key}:</span>
                      <span className="font-medium">
                        {Array.isArray(value) ? value.join(', ') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Records */}
            <div>
              <h4 className="font-semibold mb-3">Linked Records ({selectedEntity.related_records.length})</h4>
              <div className="space-y-2">
                {selectedEntity.related_records.map((recordId) => (
                  <Button
                    key={recordId}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => onRecordClick?.(recordId)}
                  >
                    <span>{recordId}</span>
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4 space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Entity Explorer</h1>
          <p className="text-muted-foreground mt-1">
            Extracted entities from your records with canonical naming
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['all', 'Person', 'Company', 'Location', 'Product'] as const).map((type) => (
            <Button
              key={type}
              variant={filterType === type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterType(type)}
              className="justify-between"
            >
              <span>{type === 'all' ? 'All' : type}</span>
              <Badge variant="secondary" className="ml-2">
                {type === 'all' ? entities.length : entityCounts[type as keyof typeof entityCounts]}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Entity List */}
      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEntities.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No entities found</p>
            </div>
          ) : (
            filteredEntities.map((entity) => (
              <Card
                key={entity.id}
                className="hover:bg-accent cursor-pointer transition-colors"
                onClick={() => setSelectedEntity(entity)}
              >
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColor(entity.type)}`}>
                      {getIcon(entity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base line-clamp-1">{entity.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{entity.type}</Badge>
                        <span className="text-xs">{entity.related_records.length} records</span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
















