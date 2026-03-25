/**
 * VehicleMonitoring.tsx — Real-time vehicle monitoring
 * Polls GET /api/vehicles/inside every 10 seconds for live occupancy data.
 * Supports filter by area (KC/SEZ), search by plate number.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Car,
  Search,
  RefreshCw,
  Filter,
  Eye,
  Wifi,
  WifiOff,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getInsideVehicles, getDashboardStats, type InsideVehicle } from '@/api/vehicleApi';

const POLL_INTERVAL_MS = 10_000; // 10 seconds — matches backend poll cycle

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

/** How many seconds ago was the last refresh */
function secondsAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 1000);
}

const VehicleMonitoring: React.FC = () => {
  const [vehicles, setVehicles] = useState<InsideVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [secondsSince, setSecondsSince] = useState(0);
  const [totalInside, setTotalInside] = useState(0);
  const [kcInside, setKcInside] = useState(0);
  const [sezInside, setSezInside] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<'all' | 'KC' | 'SEZ'>('all');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [vehicleData, statsData] = await Promise.all([
        getInsideVehicles(500),
        getDashboardStats(),
      ]);
      setVehicles(vehicleData);
      setTotalInside(statsData.totalInside);
      setKcInside(statsData.yellowSticker.inside);
      setSezInside(statsData.greenSticker.inside);
      setIsLive(true);
      setLastRefreshed(new Date());
      setSecondsSince(0);
    } catch {
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Start/stop polling
  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
    // Tick to update "Xs ago" counter
    tickRef.current = setInterval(() => setSecondsSince(s => s + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [fetchData]);

  const handleManualRefresh = () => {
    setLoading(true);
    fetchData();
    // Reset interval so we don't double-poll immediately
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchData, POLL_INTERVAL_MS);
  };

  // Filter
  const filtered = vehicles.filter(v => {
    const matchesArea = areaFilter === 'all' || v.category === areaFilter;
    const matchesSearch = v.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesArea && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Vehicle Monitoring</h1>
            {/* Live indicator */}
            <span className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
              isLive
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive'
            )}>
              {isLive
                ? <><Wifi className="h-3 w-3" /> LIVE</>
                : <><WifiOff className="h-3 w-3" /> OFFLINE</>}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Last updated: {toIST(lastRefreshed.toISOString())}
            {secondsSince > 0 && (
              <span className="text-muted-foreground/60">({secondsSince}s ago)</span>
            )}
            <span className="text-muted-foreground/50 ml-1">· Auto-refreshes every 10s</span>
          </p>
        </div>

        <Button onClick={handleManualRefresh} className="gap-2" disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Refresh Now
        </Button>
      </div>

      {/* Live Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Inside</p>
              <p className="text-2xl font-bold text-foreground">{totalInside}</p>
            </div>
          </div>
        </div>

        <div className="bg-yellow-sticker-light rounded-lg border border-yellow-sticker/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-sticker/20">
              <Car className="h-5 w-5 text-yellow-sticker" />
            </div>
            <div>
              <p className="text-sm text-yellow-sticker-foreground/70">KC (Gate 1) Inside</p>
              <p className="text-2xl font-bold text-yellow-sticker-foreground">{kcInside}</p>
            </div>
          </div>
        </div>

        <div className="bg-green-sticker-light rounded-lg border border-green-sticker/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-sticker/20">
              <Car className="h-5 w-5 text-green-sticker" />
            </div>
            <div>
              <p className="text-sm text-green-sticker-foreground/70">SEZ (Gate 2) Inside</p>
              <p className="text-2xl font-bold text-green-sticker-foreground">{sezInside}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Filters</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Search by plate */}
          <div className="space-y-1.5">
            <Label htmlFor="vm-search">Search by Plate Number</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="vm-search"
                placeholder="e.g. GJ01AB1234"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Area filter */}
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Select value={areaFilter} onValueChange={v => setAreaFilter(v as 'all' | 'KC' | 'SEZ')}>
              <SelectTrigger><SelectValue placeholder="All areas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                <SelectItem value="KC">KC — Gate 1 (Yellow)</SelectItem>
                <SelectItem value="SEZ">SEZ — Gate 2 (Green)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Result count */}
          <div className="flex items-end">
            <p className="text-sm text-muted-foreground pb-2">
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> vehicles currently inside
            </p>
          </div>
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="bg-card rounded-lg border border-border">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Currently Inside</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} vehicle{filtered.length !== 1 ? 's' : ''} on campus right now
          </p>
        </div>

        {loading && vehicles.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading live data…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Car className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No vehicles currently inside</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {searchQuery || areaFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'The campus appears to be empty right now'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((vehicle) => {
              const isKC = vehicle.category === 'KC';
              return (
                <div
                  key={vehicle.vehicleNumber}
                  className="bg-background rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      isKC ? 'bg-yellow-sticker/20' : 'bg-green-sticker/20'
                    )}>
                      <Car className={cn('h-5 w-5', isKC ? 'text-yellow-sticker' : 'text-green-sticker')} />
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'font-medium text-xs',
                        isKC
                          ? 'bg-yellow-sticker-light text-yellow-sticker-foreground border-yellow-sticker/30'
                          : 'bg-green-sticker-light text-green-sticker-foreground border-green-sticker/30'
                      )}
                    >
                      <span className={cn('w-1.5 h-1.5 rounded-full mr-1', isKC ? 'bg-yellow-sticker' : 'bg-green-sticker')} />
                      {vehicle.category}
                    </Badge>
                  </div>

                  {/* Plate */}
                  <h4 className="font-bold text-foreground text-base mb-1 tracking-wide">
                    {vehicle.vehicleNumber}
                  </h4>

                  {/* Meta */}
                  <div className="space-y-1 mb-3">
                    <p className="text-xs text-muted-foreground">
                      {vehicle.vehicleType ?? 'Unknown type'}
                    </p>
                    {vehicle.lastGate && (
                      <p className="text-xs text-muted-foreground">{vehicle.lastGate}</p>
                    )}
                    {vehicle.ownerName && (
                      <p className="text-xs text-muted-foreground truncate" title={vehicle.ownerName}>
                        {vehicle.ownerName}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70">
                      Since {toIST(vehicle.lastEventTime)}
                    </p>
                  </div>

                  {/* Details dialog */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-2">
                        <Eye className="h-4 w-4" />
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Vehicle Details</DialogTitle>
                        <DialogDescription>
                          Live status for vehicle <strong>{vehicle.vehicleNumber}</strong>
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            'flex h-16 w-16 items-center justify-center rounded-xl',
                            isKC ? 'bg-yellow-sticker/15' : 'bg-green-sticker/15'
                          )}>
                            <Car className={cn('h-8 w-8', isKC ? 'text-yellow-sticker' : 'text-green-sticker')} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold tracking-wide">{vehicle.vehicleNumber}</h3>
                            <Badge className={cn(
                              isKC
                                ? 'bg-yellow-sticker-light text-yellow-sticker-foreground'
                                : 'bg-green-sticker-light text-green-sticker-foreground'
                            )}>
                              {vehicle.category} — {isKC ? 'Gate 1' : 'Gate 2'}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid gap-2">
                          {[
                            ['Status', 'Inside Campus'],
                            ['Vehicle Type', vehicle.vehicleType ?? 'Unknown'],
                            ['Last Gate', vehicle.lastGate ?? '—'],
                            ['Owner', vehicle.ownerName ?? '—'],
                            ['Last Event (IST)', toIST(vehicle.lastEventTime)],
                          ].map(([label, value]) => (
                            <div key={label} className="flex justify-between py-2 border-b border-border last:border-0">
                              <span className="text-sm text-muted-foreground">{label}</span>
                              <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleMonitoring;