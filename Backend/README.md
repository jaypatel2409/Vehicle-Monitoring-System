# Vehicle Monitoring Backend

Backend API server for Vehicle Monitoring Dashboard in Building Management System (BMS).

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (pg driver)
- **Real-time**: Socket.IO
- **Authentication**: JWT
- **Reports**: CSV, Excel (ExcelJS), PDF (PDFKit)

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+ running locally
- Database schema already created (vehicles, vehicle_events, vehicle_state tables)

## Installation

1. **Install dependencies:**
   ```bash
   cd Backend
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the `Backend` directory:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=bms_vehicle_db
   DB_USER=postgres
   DB_PASSWORD=postgres

   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   JWT_EXPIRES_IN=24h

   # HikCentral Configuration
   USE_MOCK_HIKCENTRAL=true
   HIKCENTRAL_BASE_URL=https://api.hikcentral.com
   HIKCENTRAL_APP_KEY=
   HIKCENTRAL_APP_SECRET=

   # CORS Configuration
   CORS_ORIGIN=http://localhost:8080
   ```

3. **Ensure PostgreSQL database is running:**
   - Database name: `vehicle_monitoring`
   - Tables: `vehicles`, `vehicle_events`, `vehicle_state` (already created)

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:3001` (or the port specified in `.env`).

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login (returns JWT token)
- `GET /api/auth/me` - Get current user (requires authentication)

### Vehicles
- `GET /api/vehicles/stats` - Get dashboard statistics
- `GET /api/vehicles/inside` - Get currently inside vehicles
- `GET /api/vehicles/events` - Get vehicle events (with filters)
- `GET /api/vehicles/counts` - Get vehicle counts by date range

### Reports
- `POST /api/reports/export` - Generate report (CSV, Excel, PDF)
- `GET /api/reports/download/:filename` - Download generated report

### Health Check
- `GET /health` - Server health status

## Socket.IO Events

### Client → Server
- `dashboard:request-stats` - Request current dashboard statistics

### Server → Client
- `dashboard:stats` - Dashboard statistics update (broadcast every 5 seconds)
- `vehicle:event` - New vehicle event notification

## Mock HikCentral Service

When `USE_MOCK_HIKCENTRAL=true` (default), the backend uses a mock service that:
- Generates realistic vehicle IN/OUT events
- Simulates multiple vehicles with different categories (SEZ/KC)
- Polls every 8 seconds
- Maps GREEN → SEZ, YELLOW → KC

To switch to real HikCentral API:
1. Set `USE_MOCK_HIKCENTRAL=false`
2. Configure `HIKCENTRAL_BASE_URL`, `HIKCENTRAL_APP_KEY`, and `HIKCENTRAL_APP_SECRET`
3. Update the API endpoint in `src/services/hikcentral.service.ts`

## Database Schema

The backend expects the following tables (already created):

### vehicles
- `vehicle_number` (PRIMARY KEY)
- `owner_name`
- `category` (SEZ or KC)
- `created_at`

### vehicle_events
- `id` (SERIAL PRIMARY KEY)
- `vehicle_number`
- `category` (SEZ or KC)
- `direction` (IN or OUT)
- `event_time` (TIMESTAMP)
- `gate_name`
- `created_at`

### vehicle_state
- `vehicle_number` (PRIMARY KEY)
- `category` (SEZ or KC)
- `is_inside` (BOOLEAN)
- `last_event_time` (TIMESTAMP)

## Project Structure

```
Backend/
├── src/
│   ├── config/
│   │   ├── db.ts              # PostgreSQL connection
│   │   ├── hikcentral.ts       # HikCentral configuration
│   │   └── socket.ts           # Socket.IO configuration
│   ├── services/
│   │   ├── hikcentral.service.ts           # HikCentral API service
│   │   ├── hikcentral-polling.service.ts    # Event polling service
│   │   └── vehicle.service.ts              # Vehicle business logic
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── vehicle.controller.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── vehicle.routes.ts
│   │   └── report.routes.ts
│   ├── sockets/
│   │   └── vehicle.socket.ts   # Socket.IO event handlers
│   ├── middleware/
│   │   └── auth.middleware.ts   # JWT authentication
│   ├── utils/
│   │   └── report.util.ts       # Report generation (CSV, Excel, PDF)
│   ├── app.ts                   # Express app configuration
│   └── server.ts                # Server entry point
├── package.json
├── tsconfig.json
└── .env
```

## Security Notes

- JWT tokens are required for all protected routes
- CORS is configured to allow requests from frontend origin only
- Helmet.js provides additional security headers
- Database credentials should never be committed to version control

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database and tables exist

### Socket.IO Not Working
- Verify CORS_ORIGIN matches frontend URL
- Check browser console for connection errors
- Ensure both frontend and backend are running

### Mock Events Not Appearing
- Check server logs for polling service status
- Verify `USE_MOCK_HIKCENTRAL=true` in `.env`
- Check database connection is working

## License

ISC

