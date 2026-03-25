// Frontend/src/pages/DailyCounts.tsx
import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/vehicleApi";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, TrendingUp, TrendingDown } from "lucide-react";

// ─── IST helper ──────────────────────────────────────────────────────────────
function toISTDate(dateStr: string): string {
    // dateStr is already a DATE (YYYY-MM-DD), format it nicely
    const d = new Date(dateStr + "T00:00:00+05:30");
    return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "2-digit",
    }).format(d);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SnapshotRow {
    snapshot_date: string;
    category: "KC" | "SEZ";
    direction: "IN" | "OUT";
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

// ─── API call ─────────────────────────────────────────────────────────────────
async function fetchDailySnapshot(startDate?: string, endDate?: string): Promise<SnapshotRow[]> {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    const res = await apiClient.get(`/api/vehicles/daily-snapshot?${params.toString()}`);
    return res.data.data as SnapshotRow[];
}

// ─── Aggregate rows into per-day summary ─────────────────────────────────────
function aggregate(rows: SnapshotRow[]): DaySummary[] {
    const map: Record<string, DaySummary> = {};
    rows.forEach((r) => {
        if (!map[r.snapshot_date]) {
            map[r.snapshot_date] = { date: r.snapshot_date, kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0, totalIn: 0, totalOut: 0, grandTotal: 0 };
        }
        const d = map[r.snapshot_date];
        if (r.category === "KC" && r.direction === "IN") d.kcIn += r.total_count;
        if (r.category === "KC" && r.direction === "OUT") d.kcOut += r.total_count;
        if (r.category === "SEZ" && r.direction === "IN") d.sezIn += r.total_count;
        if (r.category === "SEZ" && r.direction === "OUT") d.sezOut += r.total_count;
        if (r.direction === "IN") d.totalIn += r.total_count;
        if (r.direction === "OUT") d.totalOut += r.total_count;
        d.grandTotal += r.total_count;
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DailyCounts() {
    const [summaries, setSummaries] = useState<DaySummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [appliedStart, setAppliedStart] = useState("");
    const [appliedEnd, setAppliedEnd] = useState("");
    const [lastRefreshed, setLastRefreshed] = useState("");

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchDailySnapshot(from || undefined, to || undefined);
            setSummaries(aggregate(rows));
            setLastRefreshed(new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
            }).format(new Date()));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            setError("Failed to load daily counts: " + msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(appliedStart, appliedEnd); }, [load, appliedStart, appliedEnd]);

    const handleApply = () => { setAppliedStart(startDate); setAppliedEnd(endDate); };
    const handleClear = () => { setStartDate(""); setEndDate(""); setAppliedStart(""); setAppliedEnd(""); };

    // Totals across displayed days
    const totals = summaries.reduce(
        (acc, d) => ({ kcIn: acc.kcIn + d.kcIn, kcOut: acc.kcOut + d.kcOut, sezIn: acc.sezIn + d.sezIn, sezOut: acc.sezOut + d.sezOut, totalIn: acc.totalIn + d.totalIn, totalOut: acc.totalOut + d.totalOut, grand: acc.grand + d.grandTotal }),
        { kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0, totalIn: 0, totalOut: 0, grand: 0 }
    );

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Daily Counts
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Historical daily vehicle totals — stored at midnight IST each day
                    </p>
                    {lastRefreshed && (
                        <p className="text-xs text-gray-400">Last refreshed: {lastRefreshed}</p>
                    )}
                </div>
                <Button variant="outline" onClick={() => load(appliedStart, appliedEnd)} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-4">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                        className="border rounded px-3 py-1.5 text-sm" />
                </div>
                <Button onClick={handleApply} disabled={loading}>Apply Filter</Button>
                {(appliedStart || appliedEnd) && (
                    <Button variant="outline" onClick={handleClear}>Clear</Button>
                )}
            </div>

            {/* Summary Cards */}
            {summaries.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <SummaryCard label="Total Entries" value={totals.totalIn} icon="in" />
                    <SummaryCard label="Total Exits" value={totals.totalOut} icon="out" />
                    <SummaryCard label="KC Total" value={totals.kcIn + totals.kcOut} color="yellow" />
                    <SummaryCard label="SEZ Total" value={totals.sezIn + totals.sezOut} color="green" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
                    {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && summaries.length === 0 && (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No data yet</p>
                    <p className="text-sm mt-1">Daily counts are saved automatically at midnight IST.<br />Data will appear here the morning after the first day of operation.</p>
                </div>
            )}

            {/* Table */}
            {summaries.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Date (IST)</th>
                                    <th className="text-center px-4 py-3 font-semibold text-yellow-700 bg-yellow-50">KC In</th>
                                    <th className="text-center px-4 py-3 font-semibold text-yellow-700 bg-yellow-50">KC Out</th>
                                    <th className="text-center px-4 py-3 font-semibold text-yellow-700 bg-yellow-50">KC Total</th>
                                    <th className="text-center px-4 py-3 font-semibold text-green-700 bg-green-50">SEZ In</th>
                                    <th className="text-center px-4 py-3 font-semibold text-green-700 bg-green-50">SEZ Out</th>
                                    <th className="text-center px-4 py-3 font-semibold text-green-700 bg-green-50">SEZ Total</th>
                                    <th className="text-center px-4 py-3 font-semibold text-blue-700 bg-blue-50">All In</th>
                                    <th className="text-center px-4 py-3 font-semibold text-blue-700 bg-blue-50">All Out</th>
                                    <th className="text-center px-4 py-3 font-semibold text-gray-900">Grand Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {summaries.map((d) => (
                                    <tr key={d.date} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-800">{toISTDate(d.date)}</td>
                                        <td className="text-center px-4 py-3 text-yellow-700">{d.kcIn}</td>
                                        <td className="text-center px-4 py-3 text-yellow-700">{d.kcOut}</td>
                                        <td className="text-center px-4 py-3 font-semibold text-yellow-800 bg-yellow-50">{d.kcIn + d.kcOut}</td>
                                        <td className="text-center px-4 py-3 text-green-700">{d.sezIn}</td>
                                        <td className="text-center px-4 py-3 text-green-700">{d.sezOut}</td>
                                        <td className="text-center px-4 py-3 font-semibold text-green-800 bg-green-50">{d.sezIn + d.sezOut}</td>
                                        <td className="text-center px-4 py-3 text-blue-700">{d.totalIn}</td>
                                        <td className="text-center px-4 py-3 text-blue-700">{d.totalOut}</td>
                                        <td className="text-center px-4 py-3 font-bold text-gray-900 text-base">{d.grandTotal}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {/* Totals Row */}
                            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                <tr>
                                    <td className="px-4 py-3 font-bold text-gray-800">TOTAL ({summaries.length} day{summaries.length !== 1 ? "s" : ""})</td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-800">{totals.kcIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-800">{totals.kcOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-yellow-900 bg-yellow-100">{totals.kcIn + totals.kcOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-800">{totals.sezIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-800">{totals.sezOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-green-900 bg-green-100">{totals.sezIn + totals.sezOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-blue-800">{totals.totalIn}</td>
                                    <td className="text-center px-4 py-3 font-bold text-blue-800">{totals.totalOut}</td>
                                    <td className="text-center px-4 py-3 font-bold text-gray-900 text-lg">{totals.grand}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Small summary card ───────────────────────────────────────────────────────
function SummaryCard({ label, value, icon, color }: { label: string; value: number; icon?: "in" | "out"; color?: "yellow" | "green" }) {
    const bg = color === "yellow" ? "bg-yellow-50 border-yellow-200" : color === "green" ? "bg-green-50 border-green-200" : "bg-white";
    const text = color === "yellow" ? "text-yellow-800" : color === "green" ? "text-green-800" : "text-gray-800";
    return (
        <div className={`rounded-xl border p-4 shadow-sm ${bg}`}>
            <div className="flex items-center gap-2 mb-1">
                {icon === "in" && <TrendingUp className="w-4 h-4 text-blue-500" />}
                {icon === "out" && <TrendingDown className="w-4 h-4 text-red-500" />}
                <span className={`text-xs font-medium ${text} opacity-70`}>{label}</span>
            </div>
            <p className={`text-2xl font-bold ${text}`}>{value.toLocaleString()}</p>
        </div>
    );
}