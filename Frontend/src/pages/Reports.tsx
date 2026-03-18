import React, { useState } from 'react';
import { Calendar, Download, FileSpreadsheet, FileText, Filter, Search } from 'lucide-react';
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
import { gateOptions, stickerOptions, mockVehicleActivities } from '@/data/mockData';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const Reports: React.FC = () => {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedGate, setSelectedGate] = useState('all');
  const [selectedSticker, setSelectedSticker] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const typeNames = {
      csv: 'CSV',
      excel: 'Excel',
      pdf: 'PDF',
    };
    
    toast({
      title: `Exporting ${typeNames[type]}`,
      description: `Your ${typeNames[type]} report is being generated...`,
    });
  };

  const filteredData = mockVehicleActivities.filter((item) => {
    const matchesGate = selectedGate === 'all' || item.gateName.toLowerCase().includes(selectedGate);
    const matchesSticker = selectedSticker === 'all' || item.stickerColor === selectedSticker;
    const matchesSearch = item.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGate && matchesSticker && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Generate and export vehicle activity reports
          </p>
        </div>
        
        {/* Export Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('excel')}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export Excel
          </Button>
          <Button
            size="sm"
            onClick={() => handleExport('pdf')}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Generate PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Filters</h3>
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Date Range - Start */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Date Range - End */}
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-card rounded-lg border border-border animate-fade-in">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Report Results</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Found {filteredData.length} records matching your criteria
          </p>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Vehicle Number
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Sticker
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Direction
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Gate
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Date & Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredData.map((activity) => (
                <tr key={activity.id} className="table-row-hover">
                  <td className="px-5 py-4">
                    <span className="font-medium text-foreground">{activity.vehicleNumber}</span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'font-medium',
                        activity.stickerColor === 'yellow'
                          ? 'bg-yellow-sticker-light text-yellow-sticker-foreground border-yellow-sticker/30'
                          : 'bg-green-sticker-light text-green-sticker-foreground border-green-sticker/30'
                      )}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full mr-1.5',
                          activity.stickerColor === 'yellow' ? 'bg-yellow-sticker' : 'bg-green-sticker'
                        )}
                      />
                      {activity.stickerColor.charAt(0).toUpperCase() + activity.stickerColor.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge
                      variant={activity.direction === 'IN' ? 'default' : 'secondary'}
                      className={cn(
                        activity.direction === 'IN'
                          ? 'bg-success/10 text-success border-success/30'
                          : 'bg-destructive/10 text-destructive border-destructive/30'
                      )}
                    >
                      {activity.direction}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-muted-foreground">{activity.gateName}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm text-muted-foreground">{activity.dateTime}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No records found matching your criteria</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
