import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/api/vehicleApi';
import { Loader2, CalendarDays, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SnapshotRow {
    snapshot_date: string;
    category: 'KC' | 'SEZ';
    direction: 'IN' | 'OUT';
    gate_name: string;
    total_count: number;
    snapped_at: string;
}

interface DaySummary {
    date: string;
    kcIn: number;
    kcOut: number;
    sezIn: number;
    sezOut: number;
    totalIn: number;
    totalOut: number;
    grandTotal: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format a YYYY-MM-DD date string as a readable IST date label.
 * e.g. "2026-03-25" → "Tue, 25 Mar 2026"
 */
function formatDate(dateStr: string): string {
    try {
        // Parse as IST midnight so the displayed date matches what was stored
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d) + 5.5 * 3600000); // shift to IST noon (avoids date flip)
        return new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        }).format(dt);
    } catch {
        return dateStr;
    }
}

function aggregate(rows: SnapshotRow[]): DaySummary[] {
    const map: Record<string, DaySummary> = {};
    rows.forEach(r => {
        if (!map[r.snapshot_date]) {
            map[r.snapshot_date] = {
                date: r.snapshot_date,
                kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0,
                totalIn: 0, totalOut: 0, grandTotal: 0,
            };
        }
        const d = map[r.snapshot_date];
        if (r.category === 'KC' && r.direction === 'IN') d.kcIn += r.total_count;
        if (r.category === 'KC' && r.direction === 'OUT') d.kcOut += r.total_count;
        if (r.category === 'SEZ' && r.direction === 'IN') d.sezIn += r.total_count;
        if (r.category === 'SEZ' && r.direction === 'OUT') d.sezOut += r.total_count;
        if (r.direction === 'IN') d.totalIn += r.total_count;
        if (r.direction === 'OUT') d.totalOut += r.total_count;
        d.grandTotal += r.total_count;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Component ─────────────────────────────────────────────────────────────────

const DailyCounts: React.FC = () => {
    const [summaries, setSummaries] = useState<DaySummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [applied, setApplied] = useState({ start: '', end: '' });
    const [lastRefreshed, setLastRefreshed] = useState('');

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            if (from) params.startDate = from;
            if (to) params.endDate = to;

            const { data: res } = await apiClient.get('/api/vehicles/daily-snapshot', { params });
            if (!res.success) throw new Error(res.message);

            setSummaries(aggregate(res.data as SnapshotRow[]));
            setLastRefreshed(new Intl.DateTimeFormat('en-IN', {
                timeZone: 'Asia/Kolkata',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            }).format(new Date()));
        } catch (e: any) {
            setError(e.message || 'Failed to load daily counts');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(applied.start, applied.end); }, [load, applied]);

    const handleApply = () => setApplied({ start: startDate, end: endDate });
    const handleClear = () => {
        setStartDate(''); setEndDate('');
        setApplied({ start: '', end: '' });
    };

    const totals = summaries.reduce(
        (acc, d) => ({
            kcIn: acc.kcIn + d.kcIn, kcOut: acc.kcOut + d.kcOut,
            sezIn: acc.sezIn + d.sezIn, sezOut: acc.sezOut + d.sezOut,
            totalIn: acc.totalIn + d.totalIn, totalOut: acc.totalOut + d.totalOut,
            grand: acc.grand + d.grandTotal,
        }),
        { kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0, totalIn: 0, totalOut: 0, grand: 0 }
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <CalendarDays className="h-6 w-6 text-primary" />
                        Daily Counts
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Historical daily totals — saved automatically at midnight IST each day
                    </p>
                    {lastRefreshed && (
                        <p className="text-xs text-muted-foreground">Last refreshed: {lastRefreshed}</p>
                    )}
                </div>
                <Button
                    variant="outline" size="sm"
                    onClick={() => load(applied.start, applied.end)}
                    disabled={loading}
                    className="gap-2 self-start"
                >
                    <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <div className="bg-card rounded-lg border border-border p-4 flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From Date</label>
                    <input
                        type="date" value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To Date</label>
                    <input
                        type="date" value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <Button onClick={handleApply} disabled={loading} className="h-9">Apply</Button>
                {(applied.start || applied.end) && (
                    <Button variant="outline" onClick={handleClear} className="h-9">Clear</Button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-4 text-sm">
                    {error}
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Summary Cards */}
            {!loading && summaries.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <SummaryCard label="Total Entries" value={totals.totalIn} icon="in" />
                    <SummaryCard label="Total Exits" value={totals.totalOut} icon="out" />
                    <SummaryCard label="KC Total" value={totals.kcIn + totals.kcOut} color="yellow" />
                    <SummaryCard label="SEZ Total" value={totals.sezIn + totals.sezOut} color="green" />
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && summaries.length === 0 && (
                <div className="bg-card rounded-lg border border-border p-12 text-center">
                    <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="font-medium text-foreground">No data yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        Daily counts are saved automatically at midnight IST.<br />
                        Data will appear here the morning after the first day of operation.
                    </p>
                </div>
            )}

            {/* Table */}
            {!loading && summaries.length > 0 && (
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <div className="overflow-x-auto scrollbar-thin">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                                        Date (IST)
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-yellow-600 bg-yellow-sticker-light/30">
                                        KC In
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-yellow-600 bg-yellow-sticker-light/30">
                                        KC Out
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-yellow-700 bg-yellow-sticker-light/50">
                                        KC Total
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-green-600 bg-green-sticker-light/30">
                                        SEZ In
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-green-600 bg-green-sticker-light/30">
                                        SEZ Out
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-green-700 bg-green-sticker-light/50">
                                        SEZ Total
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-muted-foreground">
                                        All In
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-muted-foreground">
                                        All Out
                                    </th>
                                    <th className="text-center text-xs font-medium uppercase tracking-wider px-4 py-3 text-foreground">
                                        Grand Total
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {summaries.map(d => (
                                    <tr key={d.date} className="table-row-hover">
                                        <td className="px-5 py-3 font-medium text-foreground">{formatDate(d.date)}</td>
                                        <td className="text-center px-4 py-3 text-yellow-600">{d.kcIn}</td>
                                        <td className="text-center px-4 py-3 text-yellow-600">{d.kcOut}</td>
                                        <td className="text-center px-4 py-3 font-semibold text-yellow-700 bg-yellow-sticker-light/20">{d.kcIn + d.kcOut}</td>
                                        <td className="text-center px-4 py-3 text-green-600">{d.sezIn}</td>
                                        <td className="text-center px-4 py-3 text-green-600">{d.sezOut}</td>
                                        <td className="text-center px-4 py-3 font-semibold text-green-700 bg-green-sticker-light/20">{d.sezIn + d.sezOut}</td>
                                        <td className="text-center px-4 py-3 text-muted-foreground">{d.totalIn}</td>
                                        <td className="text-center px-4 py-3 text-muted-foreground">{d.totalOut}</td>
                                        <td className="text-center px-4 py-3 font-bold text-foreground text-base">{d.grandTotal}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* Totals row */}
                            <tfoot>
                                <tr className="border-t-2 border-border bg-muted/50">
                                    <td className="px-5 py-3 font-bold text-foreground">
                                        TOTAL ({summaries.length} day{summaries.length !== 1 ? 's' : ''})
                                    </td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-700">{totals.kcIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-700">{totals.kcOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-800 bg-yellow-sticker-light/30">{totals.kcIn + totals.kcOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-700">{totals.sezIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-700">{totals.sezOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-800 bg-green-sticker-light/30">{totals.sezIn + totals.sezOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-foreground">{totals.totalIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-foreground">{totals.totalOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-foreground text-lg">{totals.grand}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DailyCounts;

// ── Small stat card ───────────────────────────────────────────────────────────

interface SummaryCardProps {
    label: string;
    value: number;
    icon?: 'in' | 'out';
    color?: 'yellow' | 'green';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, color }) => (
    <div className={cn(
        'bg-card rounded-lg border border-border p-4',
        color === 'yellow' && 'bg-yellow-sticker-light/30 border-yellow-sticker/30',
        color === 'green' && 'bg-green-sticker-light/30 border-green-sticker/30',
    )}>
        <div className="flex items-center gap-2 mb-1">
            {icon === 'in' && <TrendingUp className="h-4 w-4 text-success" />}
            {icon === 'out' && <TrendingDown className="h-4 w-4 text-destructive" />}
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <p className={cn(
            'text-2xl font-bold',
            color === 'yellow' ? 'text-yellow-700' :
                color === 'green' ? 'text-green-700' : 'text-foreground'
        )}>
            {value.toLocaleString('en-IN')}
        </p>
    </div>
);