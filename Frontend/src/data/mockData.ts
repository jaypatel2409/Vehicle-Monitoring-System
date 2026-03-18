export interface VehicleActivity {
  id: string;
  vehicleNumber: string;
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
  dateTime: string;
}

export interface DashboardStats {
  yellowSticker: {
    entered: number;
    exited: number;
    inside: number;
  };
  greenSticker: {
    entered: number;
    exited: number;
    inside: number;
  };
  totalInside: number;
}

export const mockDashboardStats: DashboardStats = {
  yellowSticker: {
    entered: 247,
    exited: 189,
    inside: 58,
  },
  greenSticker: {
    entered: 412,
    exited: 356,
    inside: 56,
  },
  totalInside: 114,
};

// Generate more realistic mock vehicle activities
const generateMockActivities = (): VehicleActivity[] => {
  const states = ['KA', 'MH', 'GJ', 'TN', 'DL', 'UP', 'RJ', 'WB', 'AP', 'TS'];
  const gates = ['Main Gate', 'East Gate', 'West Gate', 'North Gate'];
  const activities: VehicleActivity[] = [];
  const now = new Date();
  
  // Generate activities for the last 2 hours
  for (let i = 0; i < 50; i++) {
    const state = states[Math.floor(Math.random() * states.length)];
    const num1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const letter1 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const letter2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const num2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const vehicleNumber = `${state}${num1}${letter1}${letter2}${num2}`;
    
    // Random time in the last 2 hours
    const minutesAgo = Math.floor(Math.random() * 120);
    const eventTime = new Date(now.getTime() - minutesAgo * 60 * 1000);
    const dateTime = eventTime.toISOString().replace('T', ' ').substring(0, 19);
    
    activities.push({
      id: String(i + 1),
      vehicleNumber,
      stickerColor: Math.random() > 0.5 ? 'green' : 'yellow',
      direction: Math.random() > 0.6 ? 'IN' : 'OUT',
      gateName: gates[Math.floor(Math.random() * gates.length)],
      dateTime,
    });
  }
  
  // Sort by dateTime descending (most recent first)
  return activities.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
};

export const mockVehicleActivities: VehicleActivity[] = generateMockActivities();

export const mockChartData = {
  entriesVsExits: [
    { name: 'Mon', entries: 145, exits: 132 },
    { name: 'Tue', entries: 168, exits: 155 },
    { name: 'Wed', entries: 172, exits: 160 },
    { name: 'Thu', entries: 156, exits: 148 },
    { name: 'Fri', entries: 189, exits: 175 },
    { name: 'Sat', entries: 98, exits: 92 },
    { name: 'Sun', entries: 67, exits: 63 },
  ],
  movementOverTime: [
    { time: '06:00', vehicles: 12 },
    { time: '08:00', vehicles: 85 },
    { time: '10:00', vehicles: 45 },
    { time: '12:00', vehicles: 62 },
    { time: '14:00', vehicles: 38 },
    { time: '16:00', vehicles: 55 },
    { time: '18:00', vehicles: 92 },
    { time: '20:00', vehicles: 28 },
    { time: '22:00', vehicles: 8 },
  ],
  stickerDistribution: [
    { name: 'Yellow Sticker', value: 58, color: 'hsl(45, 93%, 47%)' },
    { name: 'Green Sticker', value: 56, color: 'hsl(142, 71%, 45%)' },
  ],
};

export const gateOptions = [
  { value: 'all', label: 'All Gates' },
  { value: 'main', label: 'Main Gate' },
  { value: 'east', label: 'East Gate' },
  { value: 'west', label: 'West Gate' },
];

export const stickerOptions = [
  { value: 'all', label: 'All Stickers' },
  { value: 'yellow', label: 'Yellow Sticker' },
  { value: 'green', label: 'Green Sticker' },
];
