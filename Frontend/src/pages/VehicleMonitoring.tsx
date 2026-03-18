import React, { useState } from 'react';
import { Car, Search, RefreshCw, Filter, Eye, AlertCircle } from 'lucide-react';
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
import { gateOptions, stickerOptions, mockVehicleActivities, VehicleActivity } from '@/data/mockData';
import { useToast } from '@/hooks/use-toast';

const VehicleMonitoring: React.FC = () => {
  const { toast } = useToast();
  const [selectedGate, setSelectedGate] = useState('all');
  const [selectedSticker, setSelectedSticker] = useState('all');
  const [selectedDirection, setSelectedDirection] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleActivity | null>(null);

  const handleRefresh = () => {
    toast({
      title: 'Data Refreshed',
      description: 'Vehicle monitoring data has been updated.',
    });
  };

  const filteredData = mockVehicleActivities.filter((item) => {
    const matchesGate = selectedGate === 'all' || item.gateName.toLowerCase().includes(selectedGate);
    const matchesSticker = selectedSticker === 'all' || item.stickerColor === selectedSticker;
    const matchesDirection = selectedDirection === 'all' || item.direction === selectedDirection;
    const matchesSearch = item.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGate && matchesSticker && matchesDirection && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vehicle Monitoring</h1>
          <p className="text-muted-foreground mt-1">
            Real-time vehicle tracking and activity monitoring
          </p>
        </div>
        
        <Button onClick={handleRefresh} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh Data
        </Button>
      </div>

      {/* Live Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Car className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entries Today</p>
              <p className="text-xl font-bold text-foreground">659</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <Car className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Exits Today</p>
              <p className="text-xl font-bold text-foreground">545</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Currently Inside</p>
              <p className="text-xl font-bold text-foreground">114</p>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <AlertCircle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Alerts</p>
              <p className="text-xl font-bold text-foreground">3</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Filters</h3>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search Vehicle</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Vehicle number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Sticker Color */}
          <div className="space-y-2">
            <Label>Sticker Color</Label>
            <Select value={selectedSticker} onValueChange={setSelectedSticker}>
              <SelectTrigger>
                <SelectValue placeholder="Select sticker" />
              </SelectTrigger>
              <SelectContent>
                {stickerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gate */}
          <div className="space-y-2">
            <Label>Gate</Label>
            <Select value={selectedGate} onValueChange={setSelectedGate}>
              <SelectTrigger>
                <SelectValue placeholder="Select gate" />
              </SelectTrigger>
              <SelectContent>
                {gateOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Direction */}
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={selectedDirection} onValueChange={setSelectedDirection}>
              <SelectTrigger>
                <SelectValue placeholder="Select direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Directions</SelectItem>
                <SelectItem value="IN">Entry Only</SelectItem>
                <SelectItem value="OUT">Exit Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="bg-card rounded-lg border border-border animate-fade-in">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Live Vehicle Feed</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filteredData.length} vehicles found
          </p>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredData.map((vehicle) => (
            <div
              key={vehicle.id}
              className="bg-background rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Car className="h-5 w-5 text-muted-foreground" />
                </div>
                <Badge
                  variant={vehicle.direction === 'IN' ? 'default' : 'secondary'}
                  className={cn(
                    vehicle.direction === 'IN'
                      ? 'bg-success/10 text-success border-success/30'
                      : 'bg-destructive/10 text-destructive border-destructive/30'
                  )}
                >
                  {vehicle.direction}
                </Badge>
              </div>
              
              <h4 className="font-semibold text-foreground mb-1">{vehicle.vehicleNumber}</h4>
              
              <div className="space-y-1 mb-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs',
                      vehicle.stickerColor === 'yellow'
                        ? 'bg-yellow-sticker-light text-yellow-sticker-foreground'
                        : 'bg-green-sticker-light text-green-sticker-foreground'
                    )}
                  >
                    {vehicle.stickerColor.charAt(0).toUpperCase() + vehicle.stickerColor.slice(1)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{vehicle.gateName}</p>
                <p className="text-xs text-muted-foreground">{vehicle.dateTime}</p>
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setSelectedVehicle(vehicle)}
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Vehicle Details</DialogTitle>
                    <DialogDescription>
                      Complete information about this vehicle
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                        <Car className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{vehicle.vehicleNumber}</h3>
                        <Badge
                          className={cn(
                            vehicle.stickerColor === 'yellow'
                              ? 'bg-yellow-sticker-light text-yellow-sticker-foreground'
                              : 'bg-green-sticker-light text-green-sticker-foreground'
                          )}
                        >
                          {vehicle.stickerColor.charAt(0).toUpperCase() + vehicle.stickerColor.slice(1)} Sticker
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="grid gap-3">
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Direction</span>
                        <span className="font-medium">{vehicle.direction === 'IN' ? 'Entry' : 'Exit'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Gate</span>
                        <span className="font-medium">{vehicle.gateName}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Timestamp</span>
                        <span className="font-medium">{vehicle.dateTime}</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="secondary" className="bg-success/10 text-success">Active</Badge>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <Car className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No vehicles found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleMonitoring;
