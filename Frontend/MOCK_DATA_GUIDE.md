# Mock Data Guide

## Current Status

✅ **Frontend is using mock data** - The dashboard is currently displaying mock data to show how it will look with real data.

## Viewing the Dashboard

1. **Start the frontend server** (if not already running):
   ```bash
   cd Frontend
   npm run dev
   ```

2. **Open your browser** and navigate to:
   ```
   http://localhost:8080
   ```

3. **Login** with any email and password (mock authentication)

4. **View the Dashboard** - You'll see:
   - Real-time statistics cards (Yellow/Green sticker counts)
   - Currently inside vehicles count
   - Charts (Entries vs Exits, Movement Over Time, Sticker Distribution)
   - Recent vehicle activity table

## Mock Data Structure

The mock data includes:

### Dashboard Statistics
- **Yellow Sticker (KC)**:
  - Entered: 247
  - Exited: 189
  - Inside: 58

- **Green Sticker (SEZ)**:
  - Entered: 412
  - Exited: 356
  - Inside: 56

- **Total Inside**: 114 vehicles

### Vehicle Activities
- 50 recent vehicle events
- Realistic vehicle numbers (KA, MH, GJ, etc.)
- Random gates (Main Gate, East Gate, West Gate, North Gate)
- Timestamps from the last 2 hours
- Mix of IN/OUT directions
- Mix of Yellow/Green stickers

### Charts Data
- **Entries vs Exits**: Weekly comparison (Mon-Sun)
- **Movement Over Time**: Hourly traffic pattern
- **Sticker Distribution**: Current vehicles inside by type

## Data Format

The mock data matches the backend API format:

```typescript
interface DashboardStats {
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

interface VehicleActivity {
  id: string;
  vehicleNumber: string;
  stickerColor: 'yellow' | 'green';
  direction: 'IN' | 'OUT';
  gateName: string;
  dateTime: string;
}
```

## Switching to Real Backend Data

When the backend is ready, you'll need to:

1. **Create API service** in `Frontend/src/services/api.ts`
2. **Update components** to fetch from API instead of using mock data
3. **Add Socket.IO client** for real-time updates
4. **Update AuthContext** to use real JWT authentication

The data structure will remain the same, so the UI won't need changes!

## Testing Different Scenarios

You can modify `Frontend/src/data/mockData.ts` to test different scenarios:

- **High traffic**: Increase entered/exited numbers
- **Low occupancy**: Decrease inside counts
- **More activities**: Add more items to `mockVehicleActivities` array
- **Different time ranges**: Adjust timestamps in vehicle activities

## Next Steps

1. ✅ View the dashboard with mock data (current)
2. ⏳ Set up database and backend
3. ⏳ Connect frontend to backend API
4. ⏳ Test real-time updates via Socket.IO

