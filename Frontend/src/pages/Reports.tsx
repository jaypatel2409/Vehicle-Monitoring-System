import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Download, FileSpreadsheet, FileText,
  Filter, Search, RefreshCw, ChevronLeft, ChevronRight,
  AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/api/vehicleApi';
import { useSocket } from '@/hooks/useSocket';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const GATE_OPTIONS = [
  { value: 'all', label: 'All Gates' },
  { value: 'gate 1', label: 'Gate 1 (KC)' },
  { value: 'gate 2', label: 'Gate 2 (SEZ)' },
];
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'KC', label: 'KC (Yellow)' },
  { value: 'SEZ', label: 'SEZ (Green)' },
];
const DIRECTION_OPTIONS = [
  { value: 'all', label: 'All Directions' },
  { value: 'IN', label: 'Entry (IN)' },
  { value: 'OUT', label: 'Exit (OUT)' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Filters {
  startDate: string;
  endDate: string;
  category: string;
  direction: string;
  gateName: string;
  vehicleNumber: string;
}

interface VehicleEvent {
  id: string;
  vehicleNumber: string;
  ownerName?: string;
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
  cameraName?: string;
  dateTime: string;
}

const EMPTY_FILTERS: Filters = {
  startDate: '', endDate: '', category: 'all',
  direction: 'all', gateName: 'all', vehicleNumber: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(filters: Filters, page: number) {
  const p: Record<string, string | number> = {
    limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  };
  if (filters.startDate) p.startDate = filters.startDate;
  if (filters.endDate) p.endDate = filters.endDate;
  if (filters.category !== 'all') p.category = filters.category;
  if (filters.direction !== 'all') p.direction = filters.direction;
  if (filters.gateName !== 'all') p.gateName = filters.gateName;
  if (filters.vehicleNumber.trim()) p.vehicleNumber = filters.vehicleNumber.trim();
  return p;
}

function buildExportBody(format: string, filters: Filters) {
  const body: Record<string, string> = { format };
  if (filters.startDate) body.startDate = filters.startDate;
  if (filters.endDate) body.endDate = filters.endDate;
  if (filters.category !== 'all') body.category = filters.category;
  if (filters.direction !== 'all') body.direction = filters.direction;
  if (filters.gateName !== 'all') body.gateName = filters.gateName;
  if (filters.vehicleNumber.trim()) body.vehicleNumber = filters.vehicleNumber.trim();
  return body;
}

// ── Component ─────────────────────────────────────────────────────────────────

const Reports: React.FC = () => {
  const { toast } = useToast();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socket = useSocket();

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const loadEvents = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/vehicles/events', { params: buildParams(f, p) });
      if (!data.success) throw new Error(data.message || 'Failed to fetch events');
      setEvents(data.data);
      const count = data.pagination?.count ?? data.data.length;
      setTotal(count);
    } catch (e: any) {
      setError(e.message || 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => { loadEvents(EMPTY_FILTERS, 1); }, [loadEvents]);

  // Load when page changes (using currently applied filters)
  useEffect(() => { loadEvents(applied, page); }, [page]); // eslint-disable-line

  // ── Socket.IO real-time subscriptions ────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onVehicleNew = (saved: any) => {
      // Only prepend when on page 1 with no active filters applied
      const noFilters =
        !applied.startDate && !applied.endDate &&
        applied.category === 'all' && applied.direction === 'all' &&
        applied.gateName === 'all' && !applied.vehicleNumber.trim();
      if (page !== 1 || !noFilters) return;

      const newEvent = {
        id: String(saved.vehicleNumber + '_' + saved.eventTime),
        vehicleNumber: saved.vehicleNumber,
        ownerName: saved.ownerName ?? undefined,
        stickerColor: (saved.category === 'SEZ' ? 'green' : 'yellow') as 'green' | 'yellow',
        direction: saved.eventType as 'IN' | 'OUT',
        gateName: saved.gate ?? 'Unknown Gate',
        cameraName: saved.cameraName ?? undefined,
        dateTime: saved.eventTime,
      };
      setEvents(prev => {
        const exists = prev.some(
          e => e.vehicleNumber === newEvent.vehicleNumber && e.dateTime === newEvent.dateTime
        );
        if (exists) return prev;
        return [newEvent, ...prev].slice(0, PAGE_SIZE);
      });
    };

    // Midnight reset — clear and refetch
    const onReset = () => {
      console.log('[Reports] dashboard:reset received — refetching');
      setPage(1);
      loadEvents(EMPTY_FILTERS, 1);
    };

    socket.on('vehicle:new', onVehicleNew);
    socket.on('dashboard:reset', onReset);
    return () => {
      socket.off('vehicle:new', onVehicleNew);
      socket.off('dashboard:reset', onReset);
    };
  }, [socket, applied, page, loadEvents]);

  const handleApply = () => {
    setApplied(filters);
    setPage(1);
    loadEvents(filters, 1);
  };

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
    loadEvents(EMPTY_FILTERS, 1);
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    setExporting(type);
    try {
      const format = type === 'excel' ? 'excel' : type;
      const { data } = await apiClient.post('/api/reports/export', buildExportBody(format, applied));
      if (!data.success) throw new Error(data.message || 'Export failed');
      const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      window.open(`${base}${data.data.downloadUrl}`, '_blank');
      toast({ title: 'Export ready', description: `Your ${type.toUpperCase()} report is downloading.` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Filter and export vehicle activity records</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}
            disabled={!!exporting} className="gap-2">
            {exporting === 'csv'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}
            disabled={!!exporting} className="gap-2">
            {exporting === 'excel'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileSpreadsheet className="h-4 w-4" />}
            Export Excel
          </Button>
          <Button size="sm" onClick={() => handleExport('pdf')}
            disabled={!!exporting} className="gap-2">
            {exporting === 'pdf'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileText className="h-4 w-4" />}
            Generate PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Filters</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Start Date */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input type="date" value={filters.startDate}
                onChange={e => set('startDate', e.target.value)} className="pl-9" />
            </div>
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label>End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input type="date" value={filters.endDate}
                onChange={e => set('endDate', e.target.value)} className="pl-9" />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={filters.category} onValueChange={v => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Direction */}
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={filters.direction} onValueChange={v => set('direction', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Gate */}
          <div className="space-y-2">
            <Label>Gate</Label>
            <Select value={filters.gateName} onValueChange={v => set('gateName', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GATE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle search */}
          <div className="space-y-2">
            <Label>Vehicle No.</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search plate…" value={filters.vehicleNumber}
                onChange={e => set('vehicleNumber', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleApply()}
                className="pl-9" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleApply} disabled={loading} size="sm">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Apply Filters
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Clear
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results table */}
      <div className="bg-card rounded-lg border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Results</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? 'Loading…' : `${totalCount} record${totalCount !== 1 ? 's' : ''} found`}
            </p>
          </div>
          {totalPages > 1 && (
            <p className="text-sm text-muted-foreground hidden sm:block">
              Page {page} of {totalPages}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Vehicle No.', 'Owner', 'Category', 'Direction', 'Gate', 'Camera', 'Date & Time'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </td></tr>
              ) : events.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No records found</p>
                </td></tr>
              ) : events.map(ev => (
                <tr key={ev.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground whitespace-nowrap">{ev.vehicleNumber}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{ev.ownerName || '—'}</td>
                  <td className="px-5 py-3">
                    <Badge variant="secondary" className={cn(
                      'font-medium text-xs',
                      ev.stickerColor === 'yellow'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        : 'bg-green-100 text-green-800 border-green-300'
                    )}>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full mr-1.5 inline-block',
                        ev.stickerColor === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                      )} />
                      {ev.stickerColor === 'yellow' ? 'KC' : 'SEZ'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant="secondary" className={cn(
                      'text-xs font-medium',
                      ev.direction === 'IN'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-red-100 text-red-700 border-red-300'
                    )}>
                      {ev.direction}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">{ev.gateName}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{ev.cameraName || '—'}</td>
                  <td className="px-5 py-3 text-sm text-muted-foreground whitespace-nowrap">{ev.dateTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <Button variant="outline" size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;