import React, { useEffect, useState } from 'react';
import { Car, ArrowDownLeft, ArrowUpRight, Users, Loader2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { VehicleTable } from '@/components/dashboard/VehicleTable';
import {
  EntriesExitsChart,
  MovementOverTimeChart,
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

  const fetchData = React.useCallback(async () => {
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
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const vehicleActivities = events.map((e) => ({
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
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">
          Monitor campus vehicle activity in real-time
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Vehicles"
          value={stats.totalVehicles ?? 0}
          icon={Users}
          variant="default"
          subtitle="Registered vehicles"
        />
        <StatCard
          title="Yellow Sticker - Entered"
          value={stats.yellowSticker.entered}
          icon={ArrowDownLeft}
          variant="yellow"
        />
        <StatCard
          title="Yellow Sticker - Exited"
          value={stats.yellowSticker.exited}
          icon={ArrowUpRight}
          variant="yellow"
        />
        <StatCard
          title="Green Sticker - Entered"
          value={stats.greenSticker.entered}
          icon={ArrowDownLeft}
          variant="green"
        />
        <StatCard
          title="Green Sticker - Exited"
          value={stats.greenSticker.exited}
          icon={ArrowUpRight}
          variant="green"
        />
      </div>

      {/* Currently Inside Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Yellow Sticker - Inside"
          value={stats.yellowSticker.inside}
          icon={Car}
          variant="default"
          subtitle="Currently on campus"
        />
        <StatCard
          title="Green Sticker - Inside"
          value={stats.greenSticker.inside}
          icon={Car}
          variant="default"
          subtitle="Currently on campus"
        />
        <StatCard
          title="Total Vehicles Inside"
          value={stats.totalInside}
          icon={Users}
          variant="primary"
          subtitle="All categories combined"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <EntriesExitsChart />
        <MovementOverTimeChart />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <VehicleTable data={vehicleActivities} />
        </div>
        <StickerDistributionChart
          yellowInside={stats.yellowSticker.inside}
          greenInside={stats.greenSticker.inside}
        />
      </div>
    </div>
  );
};

export default Dashboard;
