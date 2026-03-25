// Frontend/src/components/dashboard/Charts.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { getDailyCounts } from "@/api/vehicleApi";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";
import html2canvas from "html2canvas";

// ─── IST helper ──────────────────────────────────────────────────────────────
function toIST(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true,
  }).format(date);
}

function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function yesterdayIST(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface DailyCount {
  count_date: string;
  category: string;
  direction: string;
  gate_name: string;
  total_count: number;
}

interface ChartDataPoint {
  date: string;
  kcIn: number; kcOut: number;
  sezIn: number; sezOut: number;
  total: number;
}

// ─── Download helper (downloads all charts as a single PNG) ──────────────────
async function downloadAllChartsAsImage(containerRef: React.RefObject<HTMLDivElement>) {
  if (!containerRef.current) return;
  try {
    const canvas = await html2canvas(containerRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-charts-${todayIST()}.png`;
    a.click();
  } catch (err) {
    console.error("Chart image download failed:", err);
  }
}

// ─── Traffic Line Chart ───────────────────────────────────────────────────────
export function TrafficLineChart() {
  type Mode = "today" | "yesterday" | "custom";
  const [mode, setMode] = useState<Mode>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(todayIST());
  const [appliedTo, setAppliedTo] = useState(todayIST());
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const chartRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const raw: DailyCount[] = await getDailyCounts(from, to);
      const map: Record<string, ChartDataPoint> = {};
      raw.forEach((r) => {
        if (!map[r.count_date]) map[r.count_date] = { date: r.count_date, kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0, total: 0 };
        const p = map[r.count_date];
        if (r.category === "KC" && r.direction === "IN") p.kcIn += r.total_count;
        if (r.category === "KC" && r.direction === "OUT") p.kcOut += r.total_count;
        if (r.category === "SEZ" && r.direction === "IN") p.sezIn += r.total_count;
        if (r.category === "SEZ" && r.direction === "OUT") p.sezOut += r.total_count;
        p.total += r.total_count;
      });
      setData(Object.values(map).sort((a, b) => a.date.localeCompare(b.date)));
      setLastRefreshed(toIST(new Date()));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh every 15s in Today mode
  useEffect(() => {
    fetchData(appliedFrom, appliedTo);
    if (mode !== "today") return;
    const t = setInterval(() => fetchData(appliedFrom, appliedTo), 15000);
    return () => clearInterval(t);
  }, [appliedFrom, appliedTo, mode, fetchData]);

  const handleModeChange = (m: Mode) => {
    setMode(m);
    if (m === "today") { const d = todayIST(); setAppliedFrom(d); setAppliedTo(d); }
    else if (m === "yesterday") { const d = yesterdayIST(); setAppliedFrom(d); setAppliedTo(d); }
  };
  const handleApplyCustom = () => { if (customFrom && customTo) { setAppliedFrom(customFrom); setAppliedTo(customTo); } };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Traffic Overview</h3>
          {lastRefreshed && <p className="text-xs text-gray-400 mt-0.5">Last refreshed: {lastRefreshed}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "yesterday", "custom"] as Mode[]).map((m) => (
            <button key={m} onClick={() => handleModeChange(m)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${mode === m ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 border-gray-300 hover:border-blue-400"}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
          {mode === "custom" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border rounded px-2 py-1" />
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border rounded px-2 py-1" />
              <button onClick={handleApplyCustom}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-full hover:bg-blue-700">Apply</button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => fetchData(appliedFrom, appliedTo)} disabled={loading}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadAllChartsAsImage(chartRef)}>
            <Download className="w-3 h-3 mr-1" />Save Image
          </Button>
        </div>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="kcIn" stroke="#EAB308" strokeWidth={2} name="KC In" dot={false} />
            <Line type="monotone" dataKey="kcOut" stroke="#CA8A04" strokeWidth={2} name="KC Out" dot={false} />
            <Line type="monotone" dataKey="sezIn" stroke="#22C55E" strokeWidth={2} name="SEZ In" dot={false} />
            <Line type="monotone" dataKey="sezOut" stroke="#16A34A" strokeWidth={2} name="SEZ Out" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Entries vs Exits Chart ───────────────────────────────────────────────────
export function EntriesExitsChart() {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const from = yesterdayIST();
    const to = todayIST();
    getDailyCounts(from, to).then((raw: DailyCount[]) => {
      const map: Record<string, ChartDataPoint> = {};
      raw.forEach((r) => {
        if (!map[r.count_date]) map[r.count_date] = { date: r.count_date, kcIn: 0, kcOut: 0, sezIn: 0, sezOut: 0, total: 0 };
        const p = map[r.count_date];
        if (r.direction === "IN") { p.kcIn += r.category === "KC" ? r.total_count : 0; p.sezIn += r.category === "SEZ" ? r.total_count : 0; }
        if (r.direction === "OUT") { p.kcOut += r.category === "KC" ? r.total_count : 0; p.sezOut += r.category === "SEZ" ? r.total_count : 0; }
      });
      setData(Object.values(map).sort((a, b) => a.date.localeCompare(b.date)));
    });
  }, []);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Entries vs Exits</h3>
        <Button size="sm" variant="outline" onClick={() => downloadAllChartsAsImage(chartRef)}>
          <Download className="w-3 h-3 mr-1" />Save Image
        </Button>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="kcIn" fill="#EAB308" name="KC Entries" />
            <Bar dataKey="kcOut" fill="#CA8A04" name="KC Exits" />
            <Bar dataKey="sezIn" fill="#22C55E" name="SEZ Entries" />
            <Bar dataKey="sezOut" fill="#16A34A" name="SEZ Exits" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Area Distribution Chart ──────────────────────────────────────────────────
const COLORS = { KC: "#EAB308", SEZ: "#22C55E" };

export function StickerDistributionChart() {
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const from = todayIST();
    getDailyCounts(from, from).then((raw: DailyCount[]) => {
      const kc = raw.filter((r) => r.category === "KC").reduce((s, r) => s + r.total_count, 0);
      const sez = raw.filter((r) => r.category === "SEZ").reduce((s, r) => s + r.total_count, 0);
      setData([{ name: "KC", value: kc }, { name: "SEZ", value: sez }]);
    });
  }, []);

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Area Distribution (Today)</h3>
        <Button size="sm" variant="outline" onClick={() => downloadAllChartsAsImage(chartRef)}>
          <Download className="w-3 h-3 mr-1" />Save Image
        </Button>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS] ?? "#8884d8"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Download ALL charts at once ──────────────────────────────────────────────
// This component wraps all three charts and provides a single "Download All" button.
export function ChartsSection() {
  const allChartsRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="outline" onClick={() => downloadAllChartsAsImage(allChartsRef)}>
          <Download className="w-4 h-4 mr-2" />Download All Charts as Image
        </Button>
      </div>
      <div ref={allChartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="lg:col-span-2"><TrafficLineChart /></div>
        <EntriesExitsChart />
        <StickerDistributionChart />
      </div>
    </div>
  );
}