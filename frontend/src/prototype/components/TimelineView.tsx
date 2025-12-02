import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Calendar, 
  Clock, 
  FileText,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import type { TimelineEvent } from '@/prototype/fixtures/events';

interface TimelineViewProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

interface GroupedEvents {
  year: number;
  months: {
    month: string;
    monthNum: number;
    events: TimelineEvent[];
  }[];
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  InvoiceIssued: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Purchase: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  PaymentDue: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  ContractSigned: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  ContractEffective: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  ContractExpiry: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  DocumentIssued: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  TravelBooked: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  FlightDeparture: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  FlightArrival: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  HotelCheckIn: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  HotelCheckOut: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  MedicalAppointment: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  PolicyEffective: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  PolicyRenewal: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  EducationCompleted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  RegistrationRenewed: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  BankStatement: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  TaxDocumentIssued: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  UtilityBillDue: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function TimelineView({ events, onEventClick }: TimelineViewProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // Get unique event types for filtering
  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map(e => e.type))).sort();
  }, [events]);

  // Filter and sort events
  const filteredEvents = useMemo(() => {
    let filtered = [...events];
    
    if (filterType !== 'all') {
      filtered = filtered.filter(e => e.type === filterType);
    }

    filtered.sort((a, b) => {
      const dateA = new Date(`${a.date}${a.time ? `T${a.time}` : ''}`).getTime();
      const dateB = new Date(`${b.date}${b.time ? `T${b.time}` : ''}`).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [events, filterType, sortOrder]);

  // Group events by year and month
  const groupedEvents = useMemo((): GroupedEvents[] => {
    const yearMap = new Map<number, Map<number, TimelineEvent[]>>();

    filteredEvents.forEach(event => {
      const date = new Date(event.date);
      const year = date.getFullYear();
      const month = date.getMonth();

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }
      const monthMap = yearMap.get(year)!;
      
      if (!monthMap.has(month)) {
        monthMap.set(month, []);
      }
      monthMap.get(month)!.push(event);
    });

    const grouped: GroupedEvents[] = Array.from(yearMap.entries())
      .map(([year, monthMap]) => ({
        year,
        months: Array.from(monthMap.entries())
          .map(([monthNum, events]) => ({
            month: MONTH_NAMES[monthNum],
            monthNum,
            events,
          }))
          .sort((a, b) => sortOrder === 'asc' ? a.monthNum - b.monthNum : b.monthNum - a.monthNum),
      }))
      .sort((a, b) => sortOrder === 'asc' ? a.year - b.year : b.year - a.year);

    return grouped;
  }, [filteredEvents, sortOrder]);

  // Auto-expand the most recent year
  useMemo(() => {
    if (groupedEvents.length > 0 && expandedYears.size === 0) {
      setExpandedYears(new Set([groupedEvents[0].year]));
    }
  }, [groupedEvents, expandedYears.size]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const formatTime = (time?: string) => {
    if (!time) return null;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold text-foreground">Timeline</h2>
            <Badge variant="secondary">{filteredEvents.length} events</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {eventTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timeline */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {groupedEvents.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No events found</p>
            </div>
          ) : (
            groupedEvents.map(({ year, months }) => (
              <div key={year} className="space-y-4">
                {/* Year Header */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleYear(year)}
                    className="h-8 px-2"
                  >
                    {expandedYears.has(year) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                  <h3 className="text-xl font-bold text-foreground">{year}</h3>
                  <div className="flex-1 h-px bg-border" />
                  <Badge variant="outline">
                    {months.reduce((sum, m) => sum + m.events.length, 0)} events
                  </Badge>
                </div>

                {/* Months */}
                {expandedYears.has(year) && (
                  <div className="ml-8 space-y-6">
                    {months.map(({ month, events }) => (
                      <div key={month} className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                          {month}
                        </h4>
                        <div className="space-y-2">
                          {events.map((event) => (
                            <Card
                              key={event.id}
                              className="hover:bg-accent/50 cursor-pointer transition-colors"
                              onClick={() => onEventClick?.(event)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-4">
                                  {/* Date Badge */}
                                  <div className="flex flex-col items-center justify-center bg-primary/10 rounded-lg p-3 min-w-[70px]">
                                    <span className="text-2xl font-bold text-primary">
                                      {new Date(event.date).getDate()}
                                    </span>
                                    <span className="text-xs text-muted-foreground uppercase">
                                      {MONTH_NAMES[new Date(event.date).getMonth()].substring(0, 3)}
                                    </span>
                                  </div>

                                  {/* Event Details */}
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-start gap-2 flex-wrap">
                                      <Badge 
                                        variant="secondary" 
                                        className={EVENT_TYPE_COLORS[event.type] || 'bg-gray-100 text-gray-800'}
                                      >
                                        {event.type}
                                      </Badge>
                                      {event.time && (
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          {formatTime(event.time)}
                                        </div>
                                      )}
                                    </div>
                                    <h5 className="font-semibold text-foreground line-clamp-1">
                                      {event.title}
                                    </h5>
                                    {event.description && (
                                      <p className="text-sm text-muted-foreground line-clamp-2">
                                        {event.description}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <FileText className="h-3 w-3" />
                                      <span>{event.record_type}</span>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


