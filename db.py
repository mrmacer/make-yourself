import sqlite3
import os
from datetime import datetime, date as _date
from decimal import Decimal

DATABASE_URL = os.environ.get("DATABASE_URL")
IS_POSTGRES = bool(DATABASE_URL)

try:
    import psycopg2
    import psycopg2.extras
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    _PSYCOPG2_AVAILABLE = False

DB_PATH = os.path.join(os.path.dirname(__file__), "reclaim.db")


# ── Postgres helpers ───────────────────────────────────────────────────────────

def _pg_val(v):
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, _date):
        return str(v)
    if isinstance(v, Decimal):
        return float(v)
    return v


def _pg_row(row):
    return {k: _pg_val(v) for k, v in row.items()} if row else None


class _PGCursor:
    def __init__(self, cur):
        self._cur = cur

    def fetchone(self):
        return _pg_row(self._cur.fetchone())

    def fetchall(self):
        return [_pg_row(r) for r in self._cur.fetchall()]

    @property
    def lastrowid(self):
        row = self._cur.fetchone()
        return row["id"] if row else None


class _PGConn:
    def __init__(self, conn):
        self._conn = conn

    def _sql(self, sql):
        return sql.replace("?", "%s").replace("datetime('now')", "NOW()")

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(self._sql(sql), params)
        return _PGCursor(cur)

    def executemany(self, sql, params_list):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.executemany(self._sql(sql), params_list)
        return _PGCursor(cur)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def _pg_connect():
    if not _PSYCOPG2_AVAILABLE:
        raise RuntimeError("psycopg2 is not installed — add psycopg2-binary to requirements.txt")
    url = DATABASE_URL
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    try:
        conn = psycopg2.connect(url)
        conn.autocommit = False
        return conn
    except Exception as exc:
        print(f"[db] ERROR connecting to Postgres: {exc}")
        raise


# ── Public API ─────────────────────────────────────────────────────────────────

def get_db():
    if IS_POSTGRES:
        return _PGConn(_pg_connect())
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def sql_strftime_ym(col):
    """SQL expression for YYYY-MM grouping — differs between SQLite and Postgres."""
    if IS_POSTGRES:
        return f"TO_CHAR({col}::date, 'YYYY-MM')"
    return f"strftime('%Y-%m', {col})"


def init_db():
    if IS_POSTGRES:
        print("Using Postgres (Supabase)")
        _init_postgres()
    else:
        print("Using SQLite (local)")
        _init_sqlite()


# ── Init: SQLite ───────────────────────────────────────────────────────────────

def _init_sqlite():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS freedom_fund (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            date       TEXT NOT NULL,
            source     TEXT NOT NULL,
            amount     REAL NOT NULL,
            notes      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            service       TEXT NOT NULL,
            monthly_cost  REAL NOT NULL DEFAULT 0,
            last_used     TEXT,
            kill_it       INTEGER NOT NULL DEFAULT 0,
            notes         TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS workouts (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            date             TEXT NOT NULL,
            type             TEXT NOT NULL DEFAULT 'Run',
            distance_km      REAL,
            duration_minutes REAL,
            avg_hr           INTEGER,
            avg_pace         REAL,
            calories         INTEGER,
            notes            TEXT,
            xp               INTEGER NOT NULL DEFAULT 100,
            created_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS spending (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            date       TEXT NOT NULL,
            merchant   TEXT NOT NULL,
            amount     REAL NOT NULL,
            category   TEXT NOT NULL DEFAULT 'Random',
            notes      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS habit_logs (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            date      TEXT NOT NULL,
            type      TEXT NOT NULL,
            intensity TEXT NOT NULL DEFAULT 'none',
            trigger   TEXT,
            notes     TEXT
        );

        CREATE TABLE IF NOT EXISTS vehicle_maintenance (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            date       TEXT NOT NULL,
            mileage    INTEGER NOT NULL,
            task       TEXT NOT NULL,
            cost       REAL,
            notes      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vehicle_vitals (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            date         TEXT NOT NULL,
            odometer     INTEGER NOT NULL,
            miles_driven INTEGER,
            gallons      REAL,
            mpg          REAL,
            trans_temp   INTEGER,
            notes        TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vehicle_checklist (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            priority     INTEGER NOT NULL,
            item         TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'not_done',
            last_checked TEXT,
            notes        TEXT
        );

        CREATE TABLE IF NOT EXISTS work_captures (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS adventures (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
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
            created_at       TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS travel (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            date         TEXT NOT NULL,
            destination  TEXT NOT NULL,
            miles        REAL,
            purpose      TEXT CHECK(purpose IN ('work','personal')),
            reimbursable INTEGER DEFAULT 0,
            notes        TEXT,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS quick_logs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            type       TEXT NOT NULL CHECK(type IN ('tobacco','weed','drink')),
            timestamp  TEXT NOT NULL,
            date       TEXT NOT NULL,
            source     TEXT DEFAULT 'home_quick_log',
            notes      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    defaults = {
        "user_name":          "Macer",
        "tobacco_block_save": "3",
        "weed_none_save":     "3",
        "weed_light_save":    "1",
        "weed_mod_save":      "0",
        "weed_heavy_save":    "-1",
        "xp_base":            "50",
        "xp_per_score":       "50",
        "xp_perfect_bonus":   "200",
        "debt_total":         "13913",
        "debt_target":        "4500",
        "streak_min_score":   "4",
    }
    for k, v in defaults.items():
        c.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v)
        )

    existing = c.execute("SELECT COUNT(*) as n FROM vehicle_checklist").fetchone()["n"]
    if existing == 0:
        _seed_checklist_sqlite(c)

    conn.commit()
    conn.close()


def _seed_checklist_sqlite(c):
    c.executemany(
        "INSERT OR IGNORE INTO vehicle_checklist (priority, item) VALUES (?, ?)",
        _checklist_items(),
    )


# ── Init: Postgres ─────────────────────────────────────────────────────────────

_PG_DDL = """
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
"""


def _init_postgres():
    conn = _pg_connect()
    cur = conn.cursor()

    for stmt in _PG_DDL.split(";"):
        stmt = stmt.strip()
        if stmt:
            cur.execute(stmt)

    defaults = {
        "user_name":          "Macer",
        "tobacco_block_save": "3",
        "weed_none_save":     "3",
        "weed_light_save":    "1",
        "weed_mod_save":      "0",
        "weed_heavy_save":    "-1",
        "xp_base":            "50",
        "xp_per_score":       "50",
        "xp_perfect_bonus":   "200",
        "debt_total":         "13913",
        "debt_target":        "4500",
        "streak_min_score":   "4",
    }
    for k, v in defaults.items():
        cur.execute(
            "INSERT INTO settings (key, value) VALUES (%s, %s) "
            "ON CONFLICT (key) DO NOTHING",
            (k, v),
        )

    cur.execute("SELECT COUNT(*) FROM vehicle_checklist")
    if cur.fetchone()[0] == 0:
        cur.executemany(
            "INSERT INTO vehicle_checklist (priority, item) VALUES (%s, %s)",
            _checklist_items(),
        )

    conn.commit()
    cur.close()
    conn.close()


# ── Shared data ────────────────────────────────────────────────────────────────

def _checklist_items():
    return [
        (1, "Check transmission fluid"),
        (1, "Check engine oil"),
        (1, "Inspect coolant level"),
        (1, "Battery + alternator check"),
        (1, "Visual leak check under truck"),
        (2, "Transmission service (fluid + filter)"),
        (2, "Replace engine air filter"),
        (2, "Clean MAF sensor + throttle body"),
        (2, "Check brake system (pads, rotors, fluid)"),
        (2, "Inspect tires (wear + rotate)"),
        (3, "Differential fluid change (front + rear)"),
        (3, "Inspect suspension (shocks, ball joints, tie rods)"),
        (3, "Check belts + hoses"),
        (3, "Rust inspection (frame rails, underbody, brake lines)"),
        (4, "Check oil every 2-3 weeks"),
        (4, "Watch transmission temp (keep < 200°F)"),
        (4, "Listen for new noises"),
        (4, "Track MPG trends"),
        (4, "Don't ignore small problems"),
    ]


# ── Query helpers (used by app.py) ─────────────────────────────────────────────

def get_settings(conn):
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


def calc_blocks_from_logs(logs):
    """Derive tobacco/weed block values from a list of habit_log dicts."""
    blocks = {
        "tobacco_am": 0, "tobacco_pm": 0, "tobacco_eve": 0,
        "weed_am":    0, "weed_pm":    0, "weed_eve":    0,
    }
    intensity_map = {"none": 0, "light": 1, "mod": 2, "heavy": 3}

    for log in logs:
        try:
            ts   = datetime.strptime(log["timestamp"], "%Y-%m-%d %H:%M:%S")
            hour = ts.hour
        except Exception:
            continue

        suffix = "am" if hour < 12 else ("pm" if hour < 18 else "eve")

        if log["type"] == "tobacco":
            blocks[f"tobacco_{suffix}"] = 1
        elif log["type"] == "weed":
            iv  = intensity_map.get(log.get("intensity", "none"), 0)
            key = f"weed_{suffix}"
            blocks[key] = max(blocks[key], iv)

    return blocks


def calc_entry(tobacco_am, tobacco_pm, tobacco_eve,
               weed_am, weed_pm, weed_eve, s):
    """Return (score, money_reclaimed, xp) given block values and settings dict."""
    t_save = float(s["tobacco_block_save"])
    w = {
        0: float(s["weed_none_save"]),
        1: float(s["weed_light_save"]),
        2: float(s["weed_mod_save"]),
        3: float(s["weed_heavy_save"]),
    }

    score = 0
    for t in (tobacco_am, tobacco_pm, tobacco_eve):
        if t == 0:
            score += 1
    for wv in (weed_am, weed_pm, weed_eve):
        if wv == 0:
            score += 1

    money = 0.0
    for t in (tobacco_am, tobacco_pm, tobacco_eve):
        if t == 0:
            money += t_save
    for wv in (weed_am, weed_pm, weed_eve):
        money += w[wv]

    xp = int(s["xp_base"]) + score * int(s["xp_per_score"])
    if score == 6:
        xp += int(s["xp_perfect_bonus"])

    return score, round(money, 2), xp
