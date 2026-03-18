CREATE TABLE vehicles (
    vehicle_number      VARCHAR(20)     PRIMARY KEY,

    -- Owner info (from HikCentral, may be null if unregistered)
    owner_name          VARCHAR(255),
    contact             VARCHAR(32),

    -- Classification: SEZ = green sticker, KC = yellow sticker
    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    -- Last camera that saw this vehicle
    camera_index_code   VARCHAR(64),
    camera_name         VARCHAR(100),

    -- Last gate and direction
    gate                VARCHAR(50),
    last_direction      VARCHAR(5)
                            CHECK (last_direction IN ('IN', 'OUT')),

    -- Timestamps
    first_seen_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  vehicles                  IS 'Master record per unique license plate';
COMMENT ON COLUMN vehicles.category         IS 'SEZ = green sticker (SEZ area), KC = yellow sticker (KC area)';
COMMENT ON COLUMN vehicles.last_direction   IS 'Most recent movement direction for this vehicle';
COMMENT ON COLUMN vehicles.first_seen_at    IS 'Timestamp when vehicle was first detected by the system';
COMMENT ON COLUMN vehicles.last_seen_at     IS 'Timestamp of the most recent event for this vehicle';


-- ------------------------------------------------------------
-- TABLE 2: vehicle_events
-- Immutable append-only log of every gate crossing.
-- Never updated — only inserted. Source of truth for reports.
-- ------------------------------------------------------------

CREATE TABLE vehicle_events (
    id                  BIGSERIAL       PRIMARY KEY,

    -- Vehicle reference
    vehicle_number      VARCHAR(20)     NOT NULL
                            REFERENCES vehicles(vehicle_number)
                            ON DELETE CASCADE,

    -- Classification at time of event (may differ from current)
    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    -- IN = entered campus, OUT = exited campus
    direction           VARCHAR(3)      NOT NULL
                            CHECK (direction IN ('IN', 'OUT')),

    -- Gate and camera info at time of event
    gate_name           VARCHAR(50)     NOT NULL,
    camera_index_code   VARCHAR(64),
    camera_name         VARCHAR(100),

    -- Exact time the vehicle crossed (from HikCentral crossTime)
    event_time          TIMESTAMPTZ     NOT NULL,

    -- When this row was written to the database
    recorded_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  vehicle_events                IS 'Immutable log of every gate crossing — never updated, only inserted';
COMMENT ON COLUMN vehicle_events.event_time     IS 'Exact crossing time from HikCentral (crossTime field)';
COMMENT ON COLUMN vehicle_events.recorded_at    IS 'Wall-clock time this row was persisted to the DB';
COMMENT ON COLUMN vehicle_events.direction      IS 'IN = entered campus, OUT = exited campus';

-- ------------------------------------------------------------
-- TABLE 3: vehicle_state
-- Live occupancy — one row per vehicle currently tracked.
-- Updated on every IN/OUT event. Drives the dashboard counts.
-- ------------------------------------------------------------

CREATE TABLE vehicle_state (
    vehicle_number      VARCHAR(20)     PRIMARY KEY
                            REFERENCES vehicles(vehicle_number)
                            ON DELETE CASCADE,

    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    -- TRUE  = vehicle is currently inside the campus
    -- FALSE = vehicle has exited
    is_inside           BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Time of the last IN or OUT event that changed this state
    last_event_time     TIMESTAMPTZ     NOT NULL,

    -- Which gate was last used
    last_gate           VARCHAR(50),

    -- Running totals for this vehicle today (reset at midnight)
    entries_today       INTEGER         NOT NULL DEFAULT 0,
    exits_today         INTEGER         NOT NULL DEFAULT 0
);

COMMENT ON TABLE  vehicle_state                 IS 'Live occupancy state — one row per tracked vehicle';
COMMENT ON COLUMN vehicle_state.is_inside       IS 'TRUE if vehicle is currently inside campus';
COMMENT ON COLUMN vehicle_state.entries_today   IS 'Number of entries by this vehicle today (resets at midnight)';
COMMENT ON COLUMN vehicle_state.exits_today     IS 'Number of exits by this vehicle today (resets at midnight)';

-- ------------------------------------------------------------
-- TABLE 4: daily_counts
-- Pre-aggregated daily summary for fast chart queries.
-- Populated/updated by a trigger on vehicle_events.
-- Avoids expensive COUNT(*) scans on large event tables.
-- ------------------------------------------------------------

CREATE TABLE daily_counts (
    id                  SERIAL          PRIMARY KEY,
    count_date          DATE            NOT NULL,
    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),
    direction           VARCHAR(3)      NOT NULL
                            CHECK (direction IN ('IN', 'OUT')),
    gate_name           VARCHAR(50)     NOT NULL,
    total_count         INTEGER         NOT NULL DEFAULT 0,

    -- One row per (date, category, direction, gate)
    CONSTRAINT uq_daily_counts
        UNIQUE (count_date, category, direction, gate_name)
);

COMMENT ON TABLE daily_counts IS 'Pre-aggregated daily crossing counts for fast dashboard chart queries';

-- ------------------------------------------------------------
-- TABLE 5: integration_state
-- Key-value store for the polling service.
-- Stores the last successful poll timestamp (watermark) so
-- the system can resume from where it left off after restart.
-- ------------------------------------------------------------

CREATE TABLE integration_state (
    key                 TEXT            PRIMARY KEY,
    value               JSONB           NOT NULL,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE integration_state IS 'Polling watermarks and integration cursors — used by HikCentral polling service';

-- Seed the initial polling watermark so the service
-- knows where to start on first boot.
INSERT INTO integration_state (key, value) VALUES
    ('hikcentral_last_poll_time', to_jsonb(NOW() - INTERVAL '5 minutes'));

-- ============================================================
-- STEP 3 — INDEXES
-- ============================================================

-- vehicle_events: most queries filter by time range

CREATE INDEX idx_events_event_time
    ON vehicle_events (event_time DESC);

-- vehicle_events: dashboard filters by category
CREATE INDEX idx_events_category
    ON vehicle_events (category);

-- vehicle_events: dashboard filters by direction
CREATE INDEX idx_events_direction
    ON vehicle_events (direction);

-- vehicle_events: per-vehicle history lookup
CREATE INDEX idx_events_vehicle_time
    ON vehicle_events (vehicle_number, event_time DESC);

-- vehicle_events: gate-level reporting
CREATE INDEX idx_events_gate_time
    ON vehicle_events (gate_name, event_time DESC);

-- vehicle_events: today's events (partial index — very fast)
CREATE INDEX idx_events_today
    ON vehicle_events (event_time DESC, category, direction);


-- vehicle_state: dashboard counts vehicles inside
CREATE INDEX idx_state_is_inside
    ON vehicle_state (is_inside);

-- vehicle_state: dashboard breaks down inside count by category
CREATE INDEX idx_state_inside_category
    ON vehicle_state (category)
    WHERE is_inside = TRUE;

-- vehicles: category lookup
CREATE INDEX idx_vehicles_category
    ON vehicles (category);

-- daily_counts: chart range queries
CREATE INDEX idx_daily_counts_date
    ON daily_counts (count_date DESC);

-- ============================================================
-- STEP 4 — DEDUPLICATION UNIQUE INDEX
-- Prevents duplicate rows when the polling service fetches
-- the same event twice due to overlapping time windows.
-- The natural key is: plate + direction + event_time + gate.
-- ============================================================
CREATE UNIQUE INDEX uniq_vehicle_events_dedupe
    ON vehicle_events (vehicle_number, direction, event_time, gate_name);

-- ============================================================
-- STEP 5 — TRIGGER: auto-update daily_counts
-- Fires after every INSERT on vehicle_events.
-- Increments the matching daily_counts row atomically.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_daily_counts()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_counts (count_date, category, direction, gate_name, total_count)
    VALUES (
        NEW.event_time::DATE,
        NEW.category,
        NEW.direction,
        NEW.gate_name,
        1
    )
    ON CONFLICT (count_date, category, direction, gate_name)
    DO UPDATE SET
        total_count = daily_counts.total_count + 1;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_daily_counts
    AFTER INSERT ON vehicle_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_daily_counts();

COMMENT ON FUNCTION fn_update_daily_counts() IS
    'Keeps daily_counts in sync after every vehicle_events insert';

-- ============================================================
-- STEP 6 — TRIGGER: auto-update vehicles.last_seen_at
-- Keeps the master vehicles table current without extra
-- application-level queries.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_vehicle_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vehicles
    SET
        last_seen_at   = NEW.event_time,
        last_direction = NEW.direction,
        camera_index_code = COALESCE(NEW.camera_index_code, camera_index_code),
        camera_name       = COALESCE(NEW.camera_name, camera_name),
        gate              = COALESCE(NEW.gate_name, gate)
    WHERE vehicle_number = NEW.vehicle_number;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_vehicle_last_seen
    AFTER INSERT ON vehicle_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_vehicle_last_seen();

COMMENT ON FUNCTION fn_update_vehicle_last_seen() IS
    'Keeps vehicles.last_seen_at and last gate/camera current after every event';

-- ============================================================
-- STEP 7 — PERMISSIONS
-- ============================================================
GRANT ALL PRIVILEGES ON DATABASE   bms_vehicle_db  TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- ============================================================
-- STEP 8 — VERIFY
-- Run this block to confirm everything was created correctly.
-- ============================================================
DO $$
DECLARE
    tbl     TEXT;
    tbl_count INT := 0;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM   information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_type   = 'BASE TABLE'
        ORDER  BY table_name
    LOOP
        RAISE NOTICE 'TABLE CREATED: %', tbl;
        tbl_count := tbl_count + 1;
    END LOOP;

    RAISE NOTICE '---';
    RAISE NOTICE 'Total tables: % (expected 5)', tbl_count;

    IF tbl_count = 5 THEN
        RAISE NOTICE 'DATABASE SETUP COMPLETE';
    ELSE
        RAISE WARNING 'Expected 5 tables, found %. Check for errors above.', tbl_count;
    END IF;
END $$;

-- ============================================================
-- SETUP COMPLETE
-- Tables  : vehicles, vehicle_events, vehicle_state,
--           daily_counts, integration_state
-- Indexes : 10 indexes including partial and unique
-- Triggers: trg_update_daily_counts
--           trg_update_vehicle_last_seen
-- ============================================================