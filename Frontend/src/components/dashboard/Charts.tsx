import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { mockChartData } from '@/data/mockData';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const EntriesExitsChart: React.FC = () => {
  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-1">Entries vs Exits</h3>
      <p className="text-sm text-muted-foreground mb-4">Weekly vehicle flow comparison</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mockChartData.entriesVsExits} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="entries"
              fill="hsl(var(--chart-2))"
              radius={[4, 4, 0, 0]}
              name="Entries"
            />
            <Bar
              dataKey="exits"
              fill="hsl(var(--chart-5))"
              radius={[4, 4, 0, 0]}
              name="Exits"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const MovementOverTimeChart: React.FC = () => {
  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-1">Vehicle Movement</h3>
      <p className="text-sm text-muted-foreground mb-4">Hourly traffic pattern today</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockChartData.movementOverTime}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="vehicles"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-1))', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: 'hsl(var(--chart-1))' }}
              name="Vehicles"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface StickerDistributionChartProps {
  yellowInside?: number;
  greenInside?: number;
}

export const StickerDistributionChart: React.FC<StickerDistributionChartProps> = ({
  yellowInside,
  greenInside,
}) => {
  const COLORS = ['hsl(var(--chart-3))', 'hsl(var(--chart-2))'];
  const distribution = [
    { name: 'Yellow Sticker', value: yellowInside ?? mockChartData.stickerDistribution[0].value, color: 'hsl(45, 93%, 47%)' },
    { name: 'Green Sticker', value: greenInside ?? mockChartData.stickerDistribution[1].value, color: 'hsl(142, 71%, 45%)' },
  ];

  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <h3 className="text-lg font-semibold text-foreground mb-1">Sticker Distribution</h3>
      <p className="text-sm text-muted-foreground mb-4">Current vehicles inside by sticker type</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distribution}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
              dataKey="value"
            >
              {distribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value) => (
                <span className="text-sm text-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
