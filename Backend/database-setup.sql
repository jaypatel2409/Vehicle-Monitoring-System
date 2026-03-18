-- =====================================================================
-- Database Setup Script for Vehicle Monitoring System
-- =====================================================================
-- Run this script in PostgreSQL to create the database and tables
-- =====================================================================

-- 1. Create the database (run this as postgres superuser)
-- =====================================================================
CREATE DATABASE bms_vehicle_db;

-- Connect to the database
\c bms_vehicle_db;

-- =====================================================================
-- 2. Create Tables
-- =====================================================================

-- Vehicles table (master vehicle information)
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    owner_name VARCHAR(255),
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    camera_index_code TEXT,
    camera_name TEXT,
    gate TEXT,
    direction TEXT CHECK (direction IN ('ENTRY', 'EXIT')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible schema upgrades (safe to re-run)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS camera_index_code TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS camera_name TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS gate TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS direction TEXT;
DO $$
BEGIN
  ALTER TABLE vehicles
    ADD CONSTRAINT vehicles_direction_check
    CHECK (direction IN ('ENTRY', 'EXIT'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Vehicle events table (immutable event log)
CREATE TABLE IF NOT EXISTS vehicle_events (
    id BIGSERIAL PRIMARY KEY,
    vehicle_number VARCHAR(20) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    direction VARCHAR(5) NOT NULL CHECK (direction IN ('IN', 'OUT')),
    event_time TIMESTAMP NOT NULL,
    gate_name VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Vehicle state table (current occupancy)
CREATE TABLE IF NOT EXISTS vehicle_state (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    category VARCHAR(10) NOT NULL CHECK (category IN ('SEZ', 'KC')),
    is_inside BOOLEAN NOT NULL,
    last_event_time TIMESTAMP NOT NULL
);

-- Integration state table (watermarks, cursors, offsets)
CREATE TABLE IF NOT EXISTS integration_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- 3. Create Indexes for Performance
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_events_time ON vehicle_events(event_time);
CREATE INDEX IF NOT EXISTS idx_events_category ON vehicle_events(category);
CREATE INDEX IF NOT EXISTS idx_events_direction ON vehicle_events(direction);
CREATE INDEX IF NOT EXISTS idx_events_vehicle_time ON vehicle_events(vehicle_number, event_time DESC);
CREATE INDEX IF NOT EXISTS idx_state_inside ON vehicle_state(is_inside);
CREATE INDEX IF NOT EXISTS idx_state_inside_category ON vehicle_state(is_inside, category);

-- Prevent duplicate events when polling (natural key dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vehicle_events_dedupe
ON vehicle_events (vehicle_number, direction, event_time, gate_name);

-- =====================================================================
-- 4. Add Foreign Key Constraints (optional but recommended)
-- =====================================================================

-- Add foreign key from vehicle_events to vehicles
ALTER TABLE vehicle_events 
ADD CONSTRAINT fk_vehicle_events_vehicle 
FOREIGN KEY (vehicle_number) REFERENCES vehicles(vehicle_number) 
ON DELETE CASCADE;

-- Add foreign key from vehicle_state to vehicles
ALTER TABLE vehicle_state 
ADD CONSTRAINT fk_vehicle_state_vehicle 
FOREIGN KEY (vehicle_number) REFERENCES vehicles(vehicle_number) 
ON DELETE CASCADE;

-- =====================================================================
-- 5. Grant Permissions (adjust username as needed)
-- =====================================================================

-- Grant all privileges to postgres user (or your app user)
GRANT ALL PRIVILEGES ON DATABASE bms_vehicle_db TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- =====================================================================
-- Setup Complete!
-- =====================================================================
-- The database and tables are now ready for the backend application.
-- =====================================================================

