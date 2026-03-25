import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, Image } from 'lucide-react';
import { apiClient } from '@/api/vehicleApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeMode = 'today' | 'yesterday' | 'custom';

interface HourlyPoint {
  hour: string;
  in: number;
  out: number;
  total: number;
}

interface DailyRow {
  date: string;
  category: string;
  direction: string;
  gate_name: string;
  count: number;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Returns today's date as YYYY-MM-DD in IST.
 * Uses Intl so it reflects the actual IST calendar date, not the UTC date.
 */
function getTodayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getYesterdayIST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * Convert an IST calendar date (YYYY-MM-DD) range into UTC ISO strings
 * for the backend event_time query params.
 *
 * IST midnight  = UTC 18:30 the previous day  (UTC = IST − 5h30m)
 * End of day    = next IST midnight            (add 24 h)
 *
 * Example: startIST = "2026-03-25", endIST = "2026-03-25"
 *   → startUTC = "2026-03-24T18:30:00.000Z"
 *   → endUTC   = "2026-03-25T18:30:00.000Z"
 */
function istDateRangeToUTC(startIST: string, endIST: string) {
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
  const [sy, sm, sd] = startIST.split('-').map(Number);
  const [ey, em, ed] = endIST.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd) - IST_OFFSET_MS);          // IST 00:00 start day
  const end = new Date(Date.UTC(ey, em - 1, ed + 1) - IST_OFFSET_MS);      // IST 00:00 day after end
  return { start, end };
}

/**
 * Extract the IST hour (0–23) from a timestamp string that carries +05:30.
 *
 * The backend now returns e.g. "2026-03-25T09:18:44+05:30".
 * new Date() parses this correctly into an absolute UTC moment.
 * We then use Intl to extract the IST hour from that moment.
 */
function getISTHour(dateStr: string): number {
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return -1;
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(dt);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return h === 24 ? 0 : h;
}

function buildHourlyBuckets(events: any[]): HourlyPoint[] {
  const buckets: Record<string, { in: number; out: number }> = {};
  for (let h = 0; h < 24; h++) {
    buckets[String(h).padStart(2, '0') + ':00'] = { in: 0, out: 0 };
  }
  for (const ev of events) {
    const raw = ev.dateTime || ev.event_time || '';
    if (!raw) continue;
    const h = getISTHour(raw);
    if (h < 0) continue;
    const key = String(h).padStart(2, '0') + ':00';
    if (ev.direction === 'IN') buckets[key].in++;
    if (ev.direction === 'OUT') buckets[key].out++;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({ hour, in: v.in, out: v.out, total: v.in + v.out }));
}

// ── Chart → PNG download ──────────────────────────────────────────────────────

async function saveChartAsImage(
  ref: React.RefObject<HTMLDivElement>,
  filename: string,
  onDone: () => void
) {
  if (!ref.current) { onDone(); return; }
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(ref.current, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    alert('Image save failed.\nRun: npm install html2canvas  (in the Frontend folder)');
  } finally {
    onDone();
  }
}

// ── Shared Tooltip ────────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.color }}>
          {e.name}: <span className="font-semibold">{e.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Traffic Line Chart ────────────────────────────────────────────────────────

export const TrafficLineChart: React.FC = () => {
  const [mode, setMode] = useState<TimeMode>('today');
  const [customStart, setCustomStart] = useState<string>(getTodayIST);
  const [customEnd, setCustomEnd] = useState<string>(getTodayIST);
  const [data, setData] = useState<HourlyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingImg, setSavingImg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const getRange = useCallback(() => {
    if (mode === 'today') return istDateRangeToUTC(getTodayIST(), getTodayIST());
    if (mode === 'yesterday') return istDateRangeToUTC(getYesterdayIST(), getYesterdayIST());
    if (!customStart || !customEnd) return null;
    return istDateRangeToUTC(customStart, customEnd);
  }, [mode, customStart, customEnd]);

  const load = useCallback(async () => {
    const range = getRange();
    if (!range) return;
    setLoading(true); setError(null);
    try {
      const { data: res } = await apiClient.get('/api/vehicles/events', {
        params: {
          startDate: range.start.toISOString(),
          endDate: range.end.toISOString(),
          limit: 2000, offset: 0,
        },
      });
      if (!res.success) throw new Error(res.message);
      setData(buildHourlyBuckets(res.data));
    } catch (e: any) {
      setError(e.message || 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  }, [getRange]);

  useEffect(() => {
    load();
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (mode === 'today') intervalRef.current = setInterval(load, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, mode]);

  const isMultiDay = mode === 'custom' && customStart !== customEnd && !!customStart && !!customEnd;
  const display = isMultiDay ? data : data.filter(d => parseInt(d.hour) >= 6);
  const modeLabel =
    mode === 'today' ? 'Today (IST)' :
      mode === 'yesterday' ? 'Yesterday (IST)' :
        `${customStart} → ${customEnd} (IST)`;

  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Vehicle Traffic</h3>
          <p className="text-sm text-muted-foreground">Hourly entry &amp; exit — {modeLabel}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(['today', 'yesterday', 'custom'] as TimeMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={[
                  'px-3 py-1.5 font-medium transition-colors capitalize flex items-center gap-1.5',
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted',
                ].join(' ')}>
                {m === 'custom' && <Calendar className="h-3.5 w-3.5" />}
                {m === 'today' ? 'Today' : m === 'yesterday' ? 'Yesterday' : 'Custom'}
              </button>
            ))}
          </div>
          {/* Save image */}
          <Button variant="outline" size="sm" disabled={savingImg || loading}
            onClick={() => { setSavingImg(true); saveChartAsImage(chartRef, `traffic-${mode}.png`, () => setSavingImg(false)); }}
            className="gap-2">
            {savingImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
            Save Image
          </Button>
        </div>
      </div>

      {/* Custom date pickers */}
      {mode === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 mb-5 p-3 bg-muted/40 rounded-lg border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From (IST date)</label>
            <input type="date" value={customStart} max={customEnd || undefined}
              onChange={e => setCustomStart(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">To (IST date)</label>
            <input type="date" value={customEnd} min={customStart || undefined}
              onChange={e => setCustomEnd(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <Button size="sm" onClick={load} disabled={loading} className="h-9">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-72 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="h-72 flex items-center justify-center text-sm text-destructive">{error}</div>
      ) : (
        <div className="h-72" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={display} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="hour"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false}
                interval={isMultiDay ? 'preserveStartEnd' : 1} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" height={28}
                formatter={v => <span className="text-sm text-foreground">{v}</span>} />
              <Line type="monotone" dataKey="in" name="Entries (IN)"
                stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="out" name="Exits (OUT)"
                stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="total" name="Total"
                stroke="hsl(var(--chart-1))" strokeWidth={2.5}
                strokeDasharray="5 3" dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ── Entries vs Exits Bar Chart (last 7 days) ──────────────────────────────────

export const EntriesExitsChart: React.FC = () => {
  const [data, setData] = useState<{ name: string; entries: number; exits: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingImg, setSavingImg] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const end = new Date();
        const start = new Date(); start.setDate(start.getDate() - 7);
        const { data: res } = await apiClient.get('/api/vehicles/counts', {
          params: { startDate: start.toISOString(), endDate: end.toISOString() },
        });
        if (!res.success) throw new Error(res.message);
        const byDate: Record<string, { entries: number; exits: number }> = {};
        for (const r of (res.data as DailyRow[])) {
          const d = String(r.date).substring(5, 10); // MM-DD
          if (!byDate[d]) byDate[d] = { entries: 0, exits: 0 };
          if (r.direction === 'IN') byDate[d].entries += Number(r.count);
          if (r.direction === 'OUT') byDate[d].exits += Number(r.count);
        }
        setData(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({ name, ...v })));
      } catch { setData([]); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Entries vs Exits</h3>
          <p className="text-sm text-muted-foreground mb-4">Last 7 days vehicle flow</p>
        </div>
        <Button variant="outline" size="sm" disabled={savingImg}
          onClick={() => { setSavingImg(true); saveChartAsImage(chartRef, 'entries-vs-exits.png', () => setSavingImg(false)); }}
          className="gap-2">
          {savingImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
          Save Image
        </Button>
      </div>
      <div className="h-64" ref={chartRef}>
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="entries" name="Entries" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="exits" name="Exits" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

// ── Area Distribution Pie (KC vs SEZ) ─────────────────────────────────────────

interface StickerDistributionChartProps {
  yellowInside?: number;
  greenInside?: number;
}

export const StickerDistributionChart: React.FC<StickerDistributionChartProps> = ({
  yellowInside = 0,
  greenInside = 0,
}) => {
  const [savingImg, setSavingImg] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const COLORS = ['hsl(45, 93%, 47%)', 'hsl(142, 71%, 45%)'];
  const distribution = [
    { name: 'KC – Gate 1 (Yellow)', value: yellowInside },
    { name: 'SEZ – Gate 2 (Green)', value: greenInside },
  ];

  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Area Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">Currently inside by area</p>
        </div>
        <Button variant="outline" size="sm" disabled={savingImg}
          onClick={() => { setSavingImg(true); saveChartAsImage(chartRef, 'area-distribution.png', () => setSavingImg(false)); }}
          className="gap-2">
          {savingImg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
          Save Image
        </Button>
      </div>
      <div className="h-64" ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={distribution} cx="50%" cy="45%"
              innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value">
              {distribution.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend verticalAlign="bottom" height={36}
              formatter={v => <span className="text-sm text-foreground">{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const MovementOverTimeChart = TrafficLineChart;