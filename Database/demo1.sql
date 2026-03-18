-- =====================================================
-- BMS VEHICLE MANAGEMENT DATABASE SCHEMA
-- =====================================================

-- =========================
-- 1. VEHICLES (MASTER DATA)
-- =========================
CREATE TABLE vehicles (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    owner_name VARCHAR(100) NOT NULL,
    category VARCHAR(10) CHECK (category IN ('SEZ', 'KC')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 2. VEHICLE EVENTS (HISTORY)
-- =========================
CREATE TABLE vehicle_events (
    id SERIAL PRIMARY KEY,
    vehicle_number VARCHAR(20) NOT NULL,
    category VARCHAR(10) CHECK (category IN ('SEZ', 'KC')) NOT NULL,
    direction VARCHAR(5) CHECK (direction IN ('IN', 'OUT')) NOT NULL,
    event_time TIMESTAMP NOT NULL,
    gate_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_vehicle_events_vehicle
        FOREIGN KEY (vehicle_number)
        REFERENCES vehicles(vehicle_number)
        ON DELETE CASCADE
);

-- =========================
-- 3. VEHICLE STATE (LIVE STATUS)
-- =========================
CREATE TABLE vehicle_state (
    vehicle_number VARCHAR(20) PRIMARY KEY,
    category VARCHAR(10) CHECK (category IN ('SEZ', 'KC')) NOT NULL,
    is_inside BOOLEAN NOT NULL,
    last_event_time TIMESTAMP NOT NULL,

    CONSTRAINT fk_vehicle_state_vehicle
        FOREIGN KEY (vehicle_number)
        REFERENCES vehicles(vehicle_number)
        ON DELETE CASCADE
);

-- =========================
-- 4. INDEXES (PERFORMANCE)
-- =========================
CREATE INDEX idx_vehicle_events_time
    ON vehicle_events(event_time);

CREATE INDEX idx_vehicle_events_category
    ON vehicle_events(category);

CREATE INDEX idx_vehicle_events_direction
    ON vehicle_events(direction);

CREATE INDEX idx_vehicle_state_inside
    ON vehicle_state(is_inside);

CREATE INDEX idx_vehicles_category
    ON vehicles(category);

-- =====================================================
-- END OF SCHEMA
-- =====================================================
