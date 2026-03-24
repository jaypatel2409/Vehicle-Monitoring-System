import React, { useEffect, useState, useCallback } from 'react';
import { Car, ArrowDownLeft, ArrowUpRight, Users, Loader2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { VehicleTable } from '@/components/dashboard/VehicleTable';
import {
  TrafficLineChart,
  EntriesExitsChart,
  StickerDistributionChart,
} from '@/components/dashboard/Charts';
import {
  getDashboardStats,
  getVehicleEvents,
  type DashboardStats as DashboardStatsType,
  type VehicleEvent,
} from '@/api/vehicleApi';

const DEFAULT_STATS: DashboardStatsType = {
  totalVehicles: 0,
  yellowSticker: { entered: 0, exited: 0, inside: 0 },
  greenSticker: { entered: 0, exited: 0, inside: 0 },
  totalInside: 0,
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStatsType>(DEFAULT_STATS);
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsData, eventsData] = await Promise.all([
        getDashboardStats(),
        getVehicleEvents({ limit: 50 }),
      ]);
      setStats(statsData);
      setEvents(eventsData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setStats(DEFAULT_STATS);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh stat cards every 15 s — the charts manage their own data fetching
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const vehicleActivities = events.map(e => ({
    id: e.id,
    vehicleNumber: e.vehicleNumber,
    stickerColor: e.stickerColor,
    direction: e.direction,
    gateName: e.gateName,
    dateTime: e.dateTime,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
        <p className="font-medium">Error loading dashboard</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-sm mt-2 text-muted-foreground">
          Ensure the backend is running and you are logged in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor campus vehicle activity in real-time</p>
      </div>

      {/* Today's IN / OUT stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Vehicles"
          value={stats.totalVehicles ?? 0}
          icon={Users}
          variant="default"
          subtitle="Registered vehicles"
        />
        <StatCard
          title="KC (Yellow) – Entered"
          value={stats.yellowSticker.entered}
          icon={ArrowDownLeft}
          variant="yellow"
        />
        <StatCard
          title="KC (Yellow) – Exited"
          value={stats.yellowSticker.exited}
          icon={ArrowUpRight}
          variant="yellow"
        />
        <StatCard
          title="SEZ (Green) – Entered"
          value={stats.greenSticker.entered}
          icon={ArrowDownLeft}
          variant="green"
        />
        <StatCard
          title="SEZ (Green) – Exited"
          value={stats.greenSticker.exited}
          icon={ArrowUpRight}
          variant="green"
        />
      </div>

      {/* Currently inside stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="KC (Yellow) – Inside Now"
          value={stats.yellowSticker.inside}
          icon={Car}
          variant="default"
          subtitle="Currently on campus"
        />
        <StatCard
          title="SEZ (Green) – Inside Now"
          value={stats.greenSticker.inside}
          icon={Car}
          variant="default"
          subtitle="Currently on campus"
        />
        <StatCard
          title="Total Inside"
          value={stats.totalInside}
          icon={Users}
          variant="primary"
          subtitle="All categories combined"
        />
      </div>

      {/* Traffic line chart — full width with day toggle + PDF export */}
      <TrafficLineChart />

      {/* Weekly bar chart + pie */}
      <div className="grid gap-6 lg:grid-cols-2">
        <EntriesExitsChart />
        <StickerDistributionChart
          yellowInside={stats.yellowSticker.inside}
          greenInside={stats.greenSticker.inside}
        />
      </div>

      {/* Recent events table */}
      <VehicleTable data={vehicleActivities} />
    </div>
  );
};

export default Dashboard;