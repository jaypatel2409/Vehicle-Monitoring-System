# Quick Setup Guide

## 1. Install Dependencies

```bash
cd Backend
npm install
```

## 2. Create .env File

Copy the example below and create `.env` in the `Backend` directory:

```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bms_vehicle_db
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h

USE_MOCK_HIKCENTRAL=true
HIKCENTRAL_BASE_URL=https://api.hikcentral.com
HIKCENTRAL_APP_KEY=
HIKCENTRAL_APP_SECRET=

CORS_ORIGIN=http://localhost:8080
```

## 3. Verify Database

Ensure PostgreSQL is running and the database `vehicle_monitoring` exists with tables:
- `vehicles`
- `vehicle_events`
- `vehicle_state`

## 4. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

## 5. Test the API

### Health Check
```bash
curl http://localhost:3001/health
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

### Get Dashboard Stats (requires JWT token)
```bash
curl http://localhost:3001/api/vehicles/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Frontend Integration

Update your frontend API base URL to `http://localhost:3001/api`

For Socket.IO connection, connect to `http://localhost:3001`

## Troubleshooting

- **Port already in use**: Change `PORT` in `.env`
- **Database connection error**: Verify PostgreSQL is running and credentials are correct
- **Module not found**: Run `npm install` again
- **TypeScript errors**: These should resolve after `npm install` completes

