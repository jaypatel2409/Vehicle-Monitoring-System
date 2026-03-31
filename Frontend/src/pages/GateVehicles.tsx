/**
 * GateVehicles.tsx
 * Shows all vehicle events for a specific gate/area (KC = Gate 1, SEZ = Gate 2).
 * Reached by clicking the KC or SEZ stat cards on the Dashboard.
 * URL: /gate/kc  or  /gate/sez
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Search,
    RefreshCw,
    ArrowDownLeft,
    ArrowUpRight,
    Loader2,
    Car,
    ChevronLeft,
    ChevronRight,
    Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { getVehicleEvents, type VehicleEvent } from '@/api/vehicleApi';

/** Format to IST */
function toIST(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    } catch {
        return dateStr;
    }
}

const ITEMS_PER_PAGE = 15;

const GateVehicles: React.FC = () => {
    const { gate } = useParams<{ gate: string }>();
    const navigate = useNavigate();

    // Derive area from URL param: /gate/kc → KC, /gate/sez → SEZ
    const area = gate?.toUpperCase() === 'SEZ' ? 'SEZ' : 'KC';
    const isKC = area === 'KC';
    const gateName = isKC ? 'GATE 1' : 'GATE 2';
    const accentClass = isKC
        ? 'bg-yellow-sticker-light text-yellow-sticker-foreground border-yellow-sticker/30'
        : 'bg-green-sticker-light text-green-sticker-foreground border-green-sticker/30';
    const dotClass = isKC ? 'bg-yellow-sticker' : 'bg-green-sticker';

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [directionFilter, setDirectionFilter] = useState<'all' | 'IN' | 'OUT'>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Data
    const [events, setEvents] = useState<VehicleEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    const fetchEvents = useCallback(async () => {
        try {
            setError(null);
            const data = await getVehicleEvents({
                category: area as 'KC' | 'SEZ',
                limit: 500,
                ...(directionFilter !== 'all' && { direction: directionFilter }),
                ...(startDate && { startDate }),
                ...(endDate && { endDate }),
            });
            setEvents(data);
            setCurrentPage(1);
            setLastRefreshed(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [area, directionFilter, startDate, endDate]);

    // Initial load + auto-refresh every 15s
    useEffect(() => {
        setLoading(true);
        fetchEvents();
        const interval = setInterval(fetchEvents, 15_000);
        return () => clearInterval(interval);
    }, [fetchEvents]);

    // Client-side plate search filter
    const filtered = events.filter(e =>
        e.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const paginated = filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Summary counts
    const entryCount = filtered.filter(e => e.direction === 'IN').length;
    const exitCount = filtered.filter(e => e.direction === 'OUT').length;

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/dashboard')}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground">
                            {area} Zone Vehicles
                        </h1>
                        <Badge className={cn('font-semibold', accentClass)}>
                            <span className={cn('w-2 h-2 rounded-full mr-1.5', dotClass)} />
                            {gateName}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                        {isKC ? 'Yellow sticker — Gate 1 entries and exits' : 'Green sticker — Gate 2 entries and exits'}
                    </p>
                </div>
                <button
                    onClick={() => { setLoading(true); fetchEvents(); }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-accent transition-colors"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            {/* Summary stat cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-card rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">Total Events</p>
                    <p className="text-3xl font-bold text-foreground mt-1">{filtered.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Matching current filters</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                    <div className="flex items-center gap-1.5 mb-1">
                        <ArrowDownLeft className="h-4 w-4 text-success" />
                        <p className="text-sm text-muted-foreground">Entries</p>
                    </div>
                    <p className="text-3xl font-bold text-success">{entryCount}</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                    <div className="flex items-center gap-1.5 mb-1">
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                        <p className="text-sm text-muted-foreground">Exits</p>
                    </div>
                    <p className="text-3xl font-bold text-destructive">{exitCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-card rounded-lg border border-border p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-foreground text-sm">Filters</h3>
                    <span className="text-xs text-muted-foreground ml-auto">Auto-refreshes every 15s</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Plate search */}
                    <div className="space-y-1.5">
                        <Label htmlFor="plate-search">Search by Plate</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="plate-search"
                                placeholder="e.g. GJ01AB1234"
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {/* Direction */}
                    <div className="space-y-1.5">
                        <Label>Direction</Label>
                        <Select value={directionFilter} onValueChange={v => setDirectionFilter(v as 'all' | 'IN' | 'OUT')}>
                            <SelectTrigger><SelectValue placeholder="All directions" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Directions</SelectItem>
                                <SelectItem value="IN">Entry (IN)</SelectItem>
                                <SelectItem value="OUT">Exit (OUT)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Start date */}
                    <div className="space-y-1.5">
                        <Label htmlFor="start-date">From Date</Label>
                        <Input
                            id="start-date"
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>

                    {/* End date */}
                    <div className="space-y-1.5">
                        <Label htmlFor="end-date">To Date</Label>
                        <Input
                            id="end-date"
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
                {(startDate || endDate || directionFilter !== 'all' || searchQuery) && (
                    <button
                        onClick={() => {
                            setSearchQuery('');
                            setDirectionFilter('all');
                            setStartDate('');
                            setEndDate('');
                        }}
                        className="mt-3 text-xs text-primary hover:underline"
                    >
                        Clear all filters
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-card rounded-lg border border-border">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-foreground">Vehicle Events</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Last refreshed: {toIST(lastRefreshed.toISOString())}
                        </p>
                    </div>
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {error ? (
                    <div className="p-8 text-center text-destructive text-sm">{error}</div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                        {['Vehicle Number', 'Vehicle Type', 'Owner Name', 'Area', 'Direction', 'Gate', 'Date & Time (IST)'].map(h => (
                                            <th key={h} className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {paginated.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-12 text-center">
                                                <Car className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                                                <p className="text-sm text-muted-foreground">No events found for the current filters.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        paginated.map(event => (
                                            <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-5 py-3">
                                                    <span className="font-semibold text-foreground text-sm">{event.vehicleNumber}</span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={cn(
                                                        'text-sm',
                                                        event.vehicleType === 'Four-Wheeler' ? 'text-foreground' : 'text-muted-foreground italic'
                                                    )}>
                                                        {event.vehicleType ?? 'Unknown'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-sm text-muted-foreground">
                                                        {(event as any).ownerName || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-sm text-muted-foreground">
                                                        {event.area ?? (event.stickerColor === 'green' ? 'SEZ' : 'KC')}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        {event.direction === 'IN'
                                                            ? <ArrowDownLeft className="h-4 w-4 text-success" />
                                                            : <ArrowUpRight className="h-4 w-4 text-destructive" />}
                                                        <span className={cn(
                                                            'text-sm font-medium',
                                                            event.direction === 'IN' ? 'text-success' : 'text-destructive'
                                                        )}>
                                                            {event.direction}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className="text-sm text-muted-foreground">{event.gateName}</span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    {/* dateTime is pre-formatted IST from backend */}
                                                    <span className="text-sm text-muted-foreground">{event.dateTime}</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
                            <p className="text-sm text-muted-foreground">
                                {filtered.length === 0
                                    ? 'No results'
                                    : `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length}`}
                            </p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    // Show pages around current
                                    const page = totalPages <= 7 ? i + 1
                                        : currentPage <= 4 ? i + 1
                                            : currentPage >= totalPages - 3 ? totalPages - 6 + i
                                                : currentPage - 3 + i;
                                    return (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors',
                                                page === currentPage
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'border border-border text-muted-foreground hover:bg-accent'
                                            )}
                                        >
                                            {page}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default GateVehicles;