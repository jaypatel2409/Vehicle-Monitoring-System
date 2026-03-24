import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownLeft, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VehicleActivity } from '@/data/mockData';
import { Badge } from '@/components/ui/badge';

interface VehicleTableProps {
  data: VehicleActivity[];
}

export const VehicleTable: React.FC<VehicleTableProps> = ({ data }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));

  const paginatedData = data.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${baseUrl}/api/vehicles/export`, { headers });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vehicle_events_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export CSV. Please ensure you are logged in and the backend is running.');
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border animate-fade-in">
      {/* Header */}
      <div className="p-5 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Vehicle Activity</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time vehicle entries and exits</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Vehicle Number
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Vehicle Type
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Area
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Direction
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Gate
              </th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-5 py-3">
                Date &amp; Time
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No vehicle activity recorded yet.
                </td>
              </tr>
            ) : (
              paginatedData.map((activity) => (
                <tr key={activity.id} className="table-row-hover">
                  {/* Vehicle Number */}
                  <td className="px-5 py-4">
                    <span className="font-medium text-foreground">{activity.vehicleNumber}</span>
                  </td>

                  {/* Vehicle Type */}
                  <td className="px-5 py-4">
                    <span className={cn(
                      'text-sm font-medium',
                      activity.vehicleType === 'Four-Wheeler'
                        ? 'text-foreground'
                        : 'text-muted-foreground italic'
                    )}>
                      {activity.vehicleType}
                    </span>
                  </td>

                  {/* Area (replaces Sticker) — KC = yellow, SEZ = green */}
                  <td className="px-5 py-4">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'font-medium',
                        activity.area === 'KC'
                          ? 'bg-yellow-sticker-light text-yellow-sticker-foreground border-yellow-sticker/30'
                          : 'bg-green-sticker-light  text-green-sticker-foreground  border-green-sticker/30'
                      )}
                    >
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full mr-1.5',
                          activity.area === 'KC' ? 'bg-yellow-sticker' : 'bg-green-sticker'
                        )}
                      />
                      {activity.area}
                    </Badge>
                  </td>

                  {/* Direction */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      {activity.direction === 'IN' ? (
                        <ArrowDownLeft className="h-4 w-4 text-success" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-destructive" />
                      )}
                      <span className={cn(
                        'text-sm font-medium',
                        activity.direction === 'IN' ? 'text-success' : 'text-destructive'
                      )}>
                        {activity.direction}
                      </span>
                    </div>
                  </td>

                  {/* Gate */}
                  <td className="px-5 py-4">
                    <span className="text-sm text-muted-foreground">{activity.gateName}</span>
                  </td>

                  {/* Date & Time */}
                  <td className="px-5 py-4">
                    <span className="text-sm text-muted-foreground">{activity.dateTime}</span>
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
          {data.length === 0
            ? 'No results'
            : `Showing ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, data.length)} of ${data.length} results`}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors',
                page === currentPage
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};