# Database Setup Instructions

## Issue
The error shows: **"database 'bms_vehicle_db' does not exist"**

## Solution

You need to create the database and tables in PostgreSQL. Follow these steps:

### Option 1: Using psql Command Line

1. **Open PowerShell or Command Prompt**

2. **Connect to PostgreSQL** (you may need to provide your postgres password):
   ```bash
   psql -U postgres
   ```

3. **Create the database**:
   ```sql
   CREATE DATABASE bms_vehicle_db;
   ```

4. **Connect to the new database**:
   ```sql
   \c bms_vehicle_db
   ```

5. **Run the setup script**:
   ```bash
   psql -U postgres -d bms_vehicle_db -f database-setup.sql
   ```
   
   Or copy and paste the SQL commands from `database-setup.sql` into psql.

### Option 2: Using pgAdmin (GUI)

1. **Open pgAdmin**

2. **Right-click on "Databases"** → **Create** → **Database**

3. **Enter database name**: `bms_vehicle_db`

4. **Click "Save"**

5. **Expand the new database** → **Right-click on "Schemas"** → **public** → **Query Tool**

6. **Copy and paste the table creation SQL** from `database-setup.sql` (skip the CREATE DATABASE line)

7. **Click "Execute" (F5)**

### Option 3: Quick SQL Commands

If you prefer to run commands directly, here are the essential ones:

```sql
-- Create database
CREATE DATABASE bms_vehicle_db;

-- Connect to database (in psql: \c bms_vehicle_db)

-- Create vehicles table
CREATE TABLE vehicles (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    owner_name VARCHAR(255),
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create vehicle_events table
CREATE TABLE vehicle_events (
    id BIGSERIAL PRIMARY KEY,
    vehicle_number VARCHAR(20) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    event_time TIMESTAMP NOT NULL,
    gate_name VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create vehicle_state table
CREATE TABLE vehicle_state (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    is_inside BOOLEAN NOT NULL,
    last_event_time TIMESTAMP NOT NULL
);

-- Create indexes
CREATE INDEX idx_events_time ON vehicle_events(event_time);
CREATE INDEX idx_events_category ON vehicle_events(category);
CREATE INDEX idx_state_inside ON vehicle_state(is_inside);
```

## Verify Setup

After creating the database, restart your backend server:

```bash
npm run dev
```

You should see:
```
✅ Database connection test successful
🚀 Vehicle Monitoring Backend Server
```

## Troubleshooting

### If you get "permission denied" errors:
- Make sure you're using the `postgres` superuser or a user with CREATE DATABASE privileges
- Check your `.env` file has the correct `DB_USER` and `DB_PASSWORD`

### If PostgreSQL is not running:
- Start PostgreSQL service: `Get-Service postgresql* | Start-Service` (PowerShell)
- Or use Services app in Windows

### If you want to use a different database name:
- Update `DB_NAME` in your `.env` file
- Create the database with that name instead

