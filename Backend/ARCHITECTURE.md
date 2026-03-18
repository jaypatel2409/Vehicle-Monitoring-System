# Backend Architecture

## Overview

The Vehicle Monitoring Backend is a production-ready Node.js/TypeScript API server that processes vehicle events from HikCentral (or mock service) and maintains real-time synchronization with the React frontend.

## Key Features

✅ **Transaction-Safe Event Processing**: All database operations use PostgreSQL transactions to ensure data consistency

✅ **Mock HikCentral Service**: Fully functional mock service that generates realistic events when real API credentials are unavailable

✅ **Real-Time Updates**: Socket.IO broadcasts dashboard statistics and vehicle events to all connected clients

✅ **JWT Authentication**: Secure token-based authentication for all protected routes

✅ **Report Generation**: Export vehicle data as CSV, Excel, or PDF

✅ **Production-Ready**: Error handling, logging, graceful shutdown, and security best practices

## Architecture Layers

### 1. Configuration Layer (`src/config/`)
- **db.ts**: PostgreSQL connection pool and transaction helpers
- **hikcentral.ts**: HikCentral API configuration (mock/real toggle)
- **socket.ts**: Socket.IO server configuration

### 2. Service Layer (`src/services/`)
- **hikcentral.service.ts**: 
  - Mock service: Generates realistic vehicle events
  - Real service: Connects to HikCentral OpenAPI (when credentials available)
  - Factory pattern for easy switching

- **hikcentral-polling.service.ts**:
  - Polls HikCentral every 8 seconds
  - Processes events and updates database
  - Emits Socket.IO events for real-time updates

- **vehicle.service.ts**:
  - Transaction-safe event processing
  - Maps HikCentral data to database schema (GREEN→SEZ, YELLOW→KC)
  - Prevents duplicate IN/OUT events
  - Dashboard statistics queries
  - Historical data queries

### 3. Controller Layer (`src/controllers/`)
- **auth.controller.ts**: Login and user management
- **vehicle.controller.ts**: Vehicle data endpoints

### 4. Route Layer (`src/routes/`)
- **auth.routes.ts**: `/api/auth/*` endpoints
- **vehicle.routes.ts**: `/api/vehicles/*` endpoints (protected)
- **report.routes.ts**: `/api/reports/*` endpoints (protected)

### 5. Middleware (`src/middleware/`)
- **auth.middleware.ts**: JWT token verification

### 6. Socket Layer (`src/sockets/`)
- **vehicle.socket.ts**: 
  - Broadcasts dashboard stats every 5 seconds
  - Handles client requests for stats
  - Emits vehicle events in real-time

### 7. Utilities (`src/utils/`)
- **report.util.ts**: 
  - CSV generation (csv-writer)
  - Excel generation (ExcelJS)
  - PDF generation (PDFKit)

## Data Flow

```
HikCentral API (Mock/Real)
    ↓
hikcentral-polling.service.ts (polls every 8s)
    ↓
vehicle.service.ts (transaction-safe processing)
    ↓
PostgreSQL Database
    ├── vehicles (UPSERT)
    ├── vehicle_events (INSERT - immutable)
    └── vehicle_state (INSERT/UPDATE - current state)
    ↓
Socket.IO (real-time broadcast)
    ↓
React Frontend (updates without refresh)
```

## API Response Formats

### Dashboard Stats
```json
{
  "success": true,
  "data": {
    "yellowSticker": {
      "entered": 247,
      "exited": 189,
      "inside": 58
    },
    "greenSticker": {
      "entered": 412,
      "exited": 356,
      "inside": 56
    },
    "totalInside": 114
  }
}
```

### Vehicle Events
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "vehicleNumber": "KA-01-AB-1234",
      "stickerColor": "yellow",
      "direction": "IN",
      "gateName": "Main Gate",
      "dateTime": "2024-01-15 08:30:00"
    }
  ]
}
```

## Socket.IO Events

### Server → Client
- `dashboard:stats` - Dashboard statistics (broadcast every 5s)
- `vehicle:event` - New vehicle event notification

### Client → Server
- `dashboard:request-stats` - Request current statistics

## Database Transaction Safety

All event processing uses PostgreSQL transactions:

```typescript
await transaction(async (client) => {
  // 1. UPSERT vehicle
  // 2. INSERT event log
  // 3. UPDATE state
  // All or nothing - ACID compliant
});
```

This ensures:
- No partial updates
- No race conditions
- Consistent state even during failures

## Mock Service Behavior

When `USE_MOCK_HIKCENTRAL=true`:
- Generates 1-3 events per poll (every 8 seconds)
- Maintains 50 mock vehicles with realistic plate numbers
- Tracks vehicle state (inside/outside) to generate valid IN/OUT sequences
- Randomly assigns gates (Main Gate, East Gate, West Gate, North Gate)
- Maps GREEN → SEZ, YELLOW → KC

## Switching to Real HikCentral API

1. Set `USE_MOCK_HIKCENTRAL=false` in `.env`
2. Configure `HIKCENTRAL_BASE_URL`, `HIKCENTRAL_APP_KEY`, `HIKCENTRAL_APP_SECRET`
3. Update API endpoint in `src/services/hikcentral.service.ts` (RealHikCentralService class)
4. No other code changes needed - the service factory handles the switch

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Configured for frontend origin only
- **JWT**: Token-based authentication
- **Input Validation**: Express-validator ready
- **SQL Injection Protection**: Parameterized queries (pg driver)

## Error Handling

- Global error handler in `app.ts`
- Try-catch blocks in all async functions
- Database transaction rollback on errors
- Graceful shutdown on SIGTERM/SIGINT

## Performance Optimizations

- Database connection pooling (max 20 connections)
- Indexed queries for fast lookups
- Efficient Socket.IO broadcasting
- Transaction batching for multiple events

## Future Enhancements

- User management system (currently accepts any credentials)
- Rate limiting for API endpoints
- Request logging and analytics
- Database query optimization monitoring
- Webhook support for HikCentral (alternative to polling)

