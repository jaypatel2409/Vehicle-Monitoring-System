DROP TRIGGER IF EXISTS trg_update_daily_counts     ON vehicle_events;

DROP TRIGGER IF EXISTS trg_update_vehicle_last_seen ON vehicle_events;
DROP FUNCTION IF EXISTS fn_update_daily_counts();

DROP FUNCTION IF EXISTS fn_update_vehicle_last_seen();

DROP TABLE IF EXISTS daily_counts       CASCADE;
DROP TABLE IF EXISTS vehicle_state      CASCADE;
DROP TABLE IF EXISTS vehicle_events     CASCADE;
DROP TABLE IF EXISTS integration_state  CASCADE;
DROP TABLE IF EXISTS vehicles           CASCADE;


-- TABLE 1: vehicles
-- Master record per unique license plate.
CREATE TABLE vehicles (
    vehicle_number      VARCHAR(20)     PRIMARY KEY,

    owner_name          VARCHAR(255),
    contact             VARCHAR(32),

    -- SEZ = green sticker, KC = yellow sticker
    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    -- Last camera that saw this vehicle
    camera_index_code   VARCHAR(64),
    camera_name         VARCHAR(100),

    -- Last gate and movement direction (ENTRY/EXIT from camera, or IN/OUT from event)
    gate                VARCHAR(50),
    direction           VARCHAR(5)
                            CHECK (direction IN ('IN', 'OUT', 'ENTRY', 'EXIT') OR direction IS NULL),

    -- Timestamps — named to match backend INSERT statements
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  vehicles             IS 'Master record per unique license plate';
COMMENT ON COLUMN vehicles.direction   IS 'Most recent movement direction for this vehicle';
COMMENT ON COLUMN vehicles.created_at  IS 'Timestamp when vehicle was first detected';
COMMENT ON COLUMN vehicles.updated_at  IS 'Timestamp of the most recent event for this vehicle';


-- TABLE 2: vehicle_events
-- Immutable append-only log of every gate crossing.
CREATE TABLE vehicle_events (
    id                  BIGSERIAL       PRIMARY KEY,

    vehicle_number      VARCHAR(20)     NOT NULL
                            REFERENCES vehicles(vehicle_number)
                            ON DELETE CASCADE,

    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    -- IN = entered campus, OUT = exited campus
    direction           VARCHAR(3)      NOT NULL
                            CHECK (direction IN ('IN', 'OUT')),

    gate_name           VARCHAR(50)     NOT NULL,
    camera_index_code   VARCHAR(64),
    camera_name         VARCHAR(100),

    -- Exact crossing time from HikCentral
    event_time          TIMESTAMPTZ     NOT NULL,

    -- When this row was written to the DB
    recorded_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  vehicle_events             IS 'Immutable log of every gate crossing';
COMMENT ON COLUMN vehicle_events.direction   IS 'IN = entered campus, OUT = exited campus';
COMMENT ON COLUMN vehicle_events.event_time  IS 'Exact crossing time from HikCentral (crossTime field)';
COMMENT ON COLUMN vehicle_events.recorded_at IS 'Wall-clock time this row was persisted to the DB';


-- TABLE 3: vehicle_state
-- Live occupancy — one row per tracked vehicle.
CREATE TABLE vehicle_state (
    vehicle_number      VARCHAR(20)     PRIMARY KEY
                            REFERENCES vehicles(vehicle_number)
                            ON DELETE CASCADE,

    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),

    is_inside           BOOLEAN         NOT NULL DEFAULT FALSE,

    last_event_time     TIMESTAMPTZ     NOT NULL,
    last_gate           VARCHAR(50),

    -- Running daily totals (reset at midnight via scheduled job or manual reset)
    entries_today       INTEGER         NOT NULL DEFAULT 0,
    exits_today         INTEGER         NOT NULL DEFAULT 0
);

COMMENT ON TABLE  vehicle_state              IS 'Live occupancy state — one row per tracked vehicle';
COMMENT ON COLUMN vehicle_state.is_inside    IS 'TRUE if vehicle is currently inside campus';
COMMENT ON COLUMN vehicle_state.entries_today IS 'Entries by this vehicle today';
COMMENT ON COLUMN vehicle_state.exits_today   IS 'Exits by this vehicle today';


-- TABLE 4: daily_counts
-- Pre-aggregated daily summary for fast chart queries.
CREATE TABLE daily_counts (
    id                  SERIAL          PRIMARY KEY,
    count_date          DATE            NOT NULL,
    category            VARCHAR(3)      NOT NULL
                            CHECK (category IN ('SEZ', 'KC')),
    direction           VARCHAR(3)      NOT NULL
                            CHECK (direction IN ('IN', 'OUT')),
    gate_name           VARCHAR(50)     NOT NULL,
    total_count         INTEGER         NOT NULL DEFAULT 0,

    CONSTRAINT uq_daily_counts
        UNIQUE (count_date, category, direction, gate_name)
);

COMMENT ON TABLE daily_counts IS 'Pre-aggregated daily crossing counts for fast chart queries';



-- TABLE 5: integration_state
-- Key-value store for polling watermarks.
CREATE TABLE integration_state (
    key                 TEXT            PRIMARY KEY,
    value               JSONB           NOT NULL,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE integration_state IS 'Polling watermarks used by HikCentral polling service';

-- Seed initial watermark — poll from 5 minutes ago on first boot
INSERT INTO integration_state (key, value) VALUES
    ('hikcentral_last_poll_time', to_jsonb(NOW() - INTERVAL '5 minutes'));



-- ============================================================
-- STEP 3 — INDEXES
-- ============================================================

-- vehicle_events: time-range queries (most common filter)
CREATE INDEX idx_events_event_time
    ON vehicle_events (event_time DESC);

-- vehicle_events: recorded_at for pagination / export queries
CREATE INDEX idx_events_recorded_at
    ON vehicle_events (recorded_at DESC);

-- vehicle_events: category filter
CREATE INDEX idx_events_category
    ON vehicle_events (category);

-- vehicle_events: direction filter
CREATE INDEX idx_events_direction
    ON vehicle_events (direction);

-- vehicle_events: per-vehicle history
CREATE INDEX idx_events_vehicle_time
    ON vehicle_events (vehicle_number, event_time DESC);

-- vehicle_events: gate-level reporting
CREATE INDEX idx_events_gate_time
    ON vehicle_events (gate_name, event_time DESC);

-- vehicle_events: today's composite (very fast for dashboard)
CREATE INDEX idx_events_today
    ON vehicle_events (event_time DESC, category, direction);

-- vehicle_state: count all vehicles currently inside
CREATE INDEX idx_state_is_inside
    ON vehicle_state (is_inside);

-- vehicle_state: breakdown by category for inside vehicles
CREATE INDEX idx_state_inside_category
    ON vehicle_state (category)
    WHERE is_inside = TRUE;

-- vehicles: category lookup
CREATE INDEX idx_vehicles_category
    ON vehicles (category);

-- daily_counts: date-range chart queries
CREATE INDEX idx_daily_counts_date
    ON daily_counts (count_date DESC);



-- ============================================================
-- STEP 4 — DEDUPLICATION UNIQUE INDEX
-- Prevents saving the same crossing twice when polling windows overlap.
-- ============================================================
CREATE UNIQUE INDEX uniq_vehicle_events_dedupe
    ON vehicle_events (vehicle_number, direction, event_time, gate_name);



-- ============================================================
-- STEP 5 — TRIGGER: auto-update daily_counts
-- Fires after every INSERT on vehicle_events.
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

COMMENT ON FUNCTION fn_update_daily_counts()
    IS 'Keeps daily_counts in sync after every vehicle_events insert';



-- ============================================================
-- STEP 6 — TRIGGER: auto-update vehicles.updated_at
-- Keeps the master vehicles table current after every event.
-- Uses correct column names: updated_at and direction.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_vehicle_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vehicles
    SET
        updated_at        = NEW.event_time,
        direction         = NEW.direction,
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

COMMENT ON FUNCTION fn_update_vehicle_last_seen()
    IS 'Keeps vehicles.updated_at and last gate/camera/direction current after every event';




-- ============================================================
-- STEP 7 — PERMISSIONS
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;



-- ============================================================
-- STEP 8 — VERIFY
-- ============================================================
DO $$
DECLARE
    tbl       TEXT;
    tbl_count INT := 0;
    col_count INT := 0;
BEGIN
    -- Count tables
    FOR tbl IN
        SELECT table_name
        FROM   information_schema.tables
        WHERE  table_schema = 'public'
          AND  table_type   = 'BASE TABLE'
        ORDER  BY table_name
    LOOP
        RAISE NOTICE 'TABLE: %', tbl;
        tbl_count := tbl_count + 1;
    END LOOP;

    -- Verify the critical column names
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name  = 'vehicles'
      AND column_name IN ('direction', 'created_at', 'updated_at');

    RAISE NOTICE '---';
    RAISE NOTICE 'Total tables   : % (expected 5)', tbl_count;
    RAISE NOTICE 'vehicles cols  : % of 3 critical columns correct (direction, created_at, updated_at)', col_count;

    IF tbl_count = 5 AND col_count = 3 THEN
        RAISE NOTICE '✅ DATABASE REBUILD COMPLETE — fully compatible with backend';
    ELSE
        RAISE WARNING '⚠️  Something looks wrong. tbl_count=%, col_count=%', tbl_count, col_count;
    END IF;
END $$;