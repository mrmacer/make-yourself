-- Run this once against your Supabase Postgres database.
-- Safe to re-run (IF NOT EXISTS on all tables).

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_log (
    id              SERIAL PRIMARY KEY,
    date            TEXT NOT NULL UNIQUE,
    tobacco_am      INTEGER NOT NULL DEFAULT 0,
    tobacco_pm      INTEGER NOT NULL DEFAULT 0,
    tobacco_eve     INTEGER NOT NULL DEFAULT 0,
    weed_am         INTEGER NOT NULL DEFAULT 0,
    weed_pm         INTEGER NOT NULL DEFAULT 0,
    weed_eve        INTEGER NOT NULL DEFAULT 0,
    intention       TEXT,
    note            TEXT,
    score           INTEGER NOT NULL DEFAULT 0,
    money_reclaimed REAL    NOT NULL DEFAULT 0,
    xp              INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS freedom_fund (
    id         SERIAL PRIMARY KEY,
    date       TEXT NOT NULL,
    source     TEXT NOT NULL,
    amount     REAL NOT NULL,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id            SERIAL PRIMARY KEY,
    service       TEXT NOT NULL,
    monthly_cost  REAL NOT NULL DEFAULT 0,
    last_used     TEXT,
    kill_it       INTEGER NOT NULL DEFAULT 0,
    notes         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workouts (
    id               SERIAL PRIMARY KEY,
    date             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'Run',
    distance_km      REAL,
    duration_minutes REAL,
    avg_hr           INTEGER,
    avg_pace         REAL,
    calories         INTEGER,
    notes            TEXT,
    xp               INTEGER NOT NULL DEFAULT 100,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spending (
    id         SERIAL PRIMARY KEY,
    date       TEXT NOT NULL,
    merchant   TEXT NOT NULL,
    amount     REAL NOT NULL,
    category   TEXT NOT NULL DEFAULT 'Random',
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS habit_logs (
    id        SERIAL PRIMARY KEY,
    timestamp TEXT NOT NULL,
    date      TEXT NOT NULL,
    type      TEXT NOT NULL,
    intensity TEXT NOT NULL DEFAULT 'none',
    trigger   TEXT,
    notes     TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_maintenance (
    id         SERIAL PRIMARY KEY,
    date       TEXT NOT NULL,
    mileage    INTEGER NOT NULL,
    task       TEXT NOT NULL,
    cost       REAL,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_vitals (
    id           SERIAL PRIMARY KEY,
    date         TEXT NOT NULL,
    odometer     INTEGER NOT NULL,
    miles_driven INTEGER,
    gallons      REAL,
    mpg          REAL,
    trans_temp   INTEGER,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicle_checklist (
    id           SERIAL PRIMARY KEY,
    priority     INTEGER NOT NULL,
    item         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'not_done',
    last_checked TEXT,
    notes        TEXT
);

CREATE TABLE IF NOT EXISTS work_captures (
    id              SERIAL PRIMARY KEY,
    date            TEXT NOT NULL,
    domain          TEXT NOT NULL,
    reflection_type TEXT,
    note            TEXT NOT NULL,
    priority        TEXT,
    mood            TEXT,
    energy          INTEGER,
    progress        INTEGER,
    load_complexity INTEGER,
    sow_tags        TEXT,
    people_tags     TEXT,
    synced          INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adventures (
    id               SERIAL PRIMARY KEY,
    date             TEXT NOT NULL,
    title            TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'Hike',
    location         TEXT NOT NULL,
    state            TEXT,
    distance_mi      REAL,
    duration_minutes INTEGER,
    elevation_ft     INTEGER,
    difficulty       TEXT,
    rating           INTEGER,
    notes            TEXT,
    xp               INTEGER NOT NULL DEFAULT 100,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS travel (
    id           SERIAL PRIMARY KEY,
    date         TEXT NOT NULL,
    destination  TEXT NOT NULL,
    miles        REAL,
    purpose      TEXT CHECK(purpose IN ('work','personal')),
    reimbursable INTEGER DEFAULT 0,
    notes        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quick_logs (
    id         SERIAL PRIMARY KEY,
    type       TEXT NOT NULL CHECK(type IN ('tobacco','weed','drink')),
    timestamp  TEXT NOT NULL,
    date       TEXT NOT NULL,
    source     TEXT DEFAULT 'home_quick_log',
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default settings (safe to re-run)
INSERT INTO settings (key, value) VALUES
    ('user_name',          'Macer'),
    ('tobacco_block_save', '3'),
    ('weed_none_save',     '3'),
    ('weed_light_save',    '1'),
    ('weed_mod_save',      '0'),
    ('weed_heavy_save',    '-1'),
    ('xp_base',            '50'),
    ('xp_per_score',       '50'),
    ('xp_perfect_bonus',   '200'),
    ('debt_total',         '13913'),
    ('debt_target',        '4500'),
    ('streak_min_score',   '4')
ON CONFLICT (key) DO NOTHING;

-- Vehicle checklist seed (only if empty)
INSERT INTO vehicle_checklist (priority, item)
SELECT v.priority, v.item FROM (VALUES
    (1, 'Check transmission fluid'),
    (1, 'Check engine oil'),
    (1, 'Inspect coolant level'),
    (1, 'Battery + alternator check'),
    (1, 'Visual leak check under truck'),
    (2, 'Transmission service (fluid + filter)'),
    (2, 'Replace engine air filter'),
    (2, 'Clean MAF sensor + throttle body'),
    (2, 'Check brake system (pads, rotors, fluid)'),
    (2, 'Inspect tires (wear + rotate)'),
    (3, 'Differential fluid change (front + rear)'),
    (3, 'Inspect suspension (shocks, ball joints, tie rods)'),
    (3, 'Check belts + hoses'),
    (3, 'Rust inspection (frame rails, underbody, brake lines)'),
    (4, 'Check oil every 2-3 weeks'),
    (4, 'Watch transmission temp (keep < 200°F)'),
    (4, 'Listen for new noises'),
    (4, 'Track MPG trends'),
    (4, 'Don''t ignore small problems')
) AS v(priority, item)
WHERE NOT EXISTS (SELECT 1 FROM vehicle_checklist LIMIT 1);
