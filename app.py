from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import date, datetime, timedelta
import os

from db import get_db, init_db, get_settings, calc_entry, calc_blocks_from_logs, IS_POSTGRES, sql_strftime_ym

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)

# ── Bootstrap ──────────────────────────────────────────────────────────────────

init_db()


# ── PWA / SPA shell ────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json")


@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js")


# ── Settings ───────────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    conn = get_db()
    s = get_settings(conn)
    conn.close()
    return jsonify(s)


@app.route("/api/settings", methods=["POST"])
def api_save_settings():
    data = request.get_json(force=True)
    conn = get_db()
    for k, v in data.items():
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (k, str(v)),
        )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Daily Log ──────────────────────────────────────────────────────────────────

@app.route("/api/log", methods=["GET"])
def api_get_log():
    """Return log entries. ?date=YYYY-MM-DD for a single entry, or ?limit=N for recent."""
    conn = get_db()
    d = request.args.get("date")
    if d:
        row = conn.execute(
            "SELECT * FROM daily_log WHERE date = ?", (d,)
        ).fetchone()
        conn.close()
        return jsonify(dict(row) if row else {})

    limit = int(request.args.get("limit", 90))
    rows = conn.execute(
        "SELECT * FROM daily_log ORDER BY date DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/log", methods=["POST"])
def api_save_log():
    data = request.get_json(force=True)
    entry_date = data.get("date", str(date.today()))

    conn = get_db()
    s = get_settings(conn)

    # Auto-calculate blocks from habit_logs if any exist for this date
    habit_rows = conn.execute(
        "SELECT * FROM habit_logs WHERE date = ?", (entry_date,)
    ).fetchall()

    if habit_rows:
        blocks      = calc_blocks_from_logs([dict(r) for r in habit_rows])
        tobacco_am  = blocks["tobacco_am"]
        tobacco_pm  = blocks["tobacco_pm"]
        tobacco_eve = blocks["tobacco_eve"]
        weed_am     = blocks["weed_am"]
        weed_pm     = blocks["weed_pm"]
        weed_eve    = blocks["weed_eve"]
    else:
        # Fall back to submitted values (backward compat / manual entry)
        tobacco_am  = int(data.get("tobacco_am",  0))
        tobacco_pm  = int(data.get("tobacco_pm",  0))
        tobacco_eve = int(data.get("tobacco_eve", 0))
        weed_am     = int(data.get("weed_am",     0))
        weed_pm     = int(data.get("weed_pm",     0))
        weed_eve    = int(data.get("weed_eve",    0))

    score, money, xp = calc_entry(
        tobacco_am, tobacco_pm, tobacco_eve,
        weed_am, weed_pm, weed_eve, s
    )

    conn.execute("""
        INSERT INTO daily_log
            (date, tobacco_am, tobacco_pm, tobacco_eve,
             weed_am, weed_pm, weed_eve,
             intention, note, score, money_reclaimed, xp, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
        ON CONFLICT(date) DO UPDATE SET
            tobacco_am      = excluded.tobacco_am,
            tobacco_pm      = excluded.tobacco_pm,
            tobacco_eve     = excluded.tobacco_eve,
            weed_am         = excluded.weed_am,
            weed_pm         = excluded.weed_pm,
            weed_eve        = excluded.weed_eve,
            intention       = excluded.intention,
            note            = excluded.note,
            score           = excluded.score,
            money_reclaimed = excluded.money_reclaimed,
            xp              = excluded.xp,
            updated_at      = excluded.updated_at
    """, (
        entry_date,
        tobacco_am, tobacco_pm, tobacco_eve,
        weed_am, weed_pm, weed_eve,
        data.get("intention"), data.get("note"),
        score, money, xp,
    ))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "score": score, "money": money, "xp": xp})


# ── Dashboard stats ────────────────────────────────────────────────────────────

@app.route("/api/stats")
def api_stats():
    conn = get_db()
    s = get_settings(conn)
    today = str(date.today())
    streak_min = int(s.get("streak_min_score", 4))

    # Today's entry
    today_row = conn.execute(
        "SELECT * FROM daily_log WHERE date = ?", (today,)
    ).fetchone()

    # All-time totals
    totals = conn.execute(
        "SELECT SUM(money_reclaimed) as money, SUM(xp) as xp, COUNT(*) as days "
        "FROM daily_log"
    ).fetchone()
    workout_xp_row = conn.execute(
        "SELECT COALESCE(SUM(xp), 0) as xp FROM workouts"
    ).fetchone()
    adventure_xp_row = conn.execute(
        "SELECT COALESCE(SUM(xp), 0) as xp FROM adventures"
    ).fetchone()

    # Weekly stats (last 7 days)
    week_ago = str(date.today() - timedelta(days=6))
    week = conn.execute(
        "SELECT AVG(score) as avg_score, SUM(xp) as xp "
        "FROM daily_log WHERE date >= ?", (week_ago,)
    ).fetchone()

    # Monthly stats (last 30 days)
    month_ago = str(date.today() - timedelta(days=29))
    month = conn.execute(
        "SELECT SUM(money_reclaimed) as money "
        "FROM daily_log WHERE date >= ?", (month_ago,)
    ).fetchone()

    # Tobacco/weed monthly breakdown
    month_detail = conn.execute("""
        SELECT
            SUM(CASE WHEN tobacco_am=0 THEN ? ELSE 0 END +
                CASE WHEN tobacco_pm=0 THEN ? ELSE 0 END +
                CASE WHEN tobacco_eve=0 THEN ? ELSE 0 END) as tobacco_saved,
            SUM(
                CASE weed_am WHEN 0 THEN ? WHEN 1 THEN ? WHEN 2 THEN ? WHEN 3 THEN ? END +
                CASE weed_pm WHEN 0 THEN ? WHEN 1 THEN ? WHEN 2 THEN ? WHEN 3 THEN ? END +
                CASE weed_eve WHEN 0 THEN ? WHEN 1 THEN ? WHEN 2 THEN ? WHEN 3 THEN ? END
            ) as weed_saved
        FROM daily_log WHERE date >= ?
    """, (
        float(s["tobacco_block_save"]), float(s["tobacco_block_save"]), float(s["tobacco_block_save"]),
        float(s["weed_none_save"]), float(s["weed_light_save"]), float(s["weed_mod_save"]), float(s["weed_heavy_save"]),
        float(s["weed_none_save"]), float(s["weed_light_save"]), float(s["weed_mod_save"]), float(s["weed_heavy_save"]),
        float(s["weed_none_save"]), float(s["weed_light_save"]), float(s["weed_mod_save"]), float(s["weed_heavy_save"]),
        month_ago,
    )).fetchone()

    # Streaks — pull all scores ordered by date desc
    all_scores = conn.execute(
        "SELECT date, score FROM daily_log ORDER BY date DESC"
    ).fetchall()

    current_streak = 0
    best_streak = 0
    temp_streak = 0
    prev_date = None
    today_counted = False

    for i, row in enumerate(all_scores):
        row_date = datetime.strptime(row["date"], "%Y-%m-%d").date()
        qualifies = row["score"] >= streak_min

        if prev_date is None:
            # first row
            if row_date == date.today() or row_date == date.today() - timedelta(days=1):
                if qualifies:
                    temp_streak = 1
                    if i == 0 and row_date == date.today():
                        today_counted = True
                else:
                    temp_streak = 0
            prev_date = row_date
        else:
            expected = prev_date - timedelta(days=1)
            if row_date == expected and qualifies:
                temp_streak += 1
            else:
                break
            prev_date = row_date

        if temp_streak > best_streak:
            best_streak = temp_streak

    current_streak = temp_streak

    # Recalculate best streak across all history
    if all_scores:
        best = 0
        run = 0
        prev = None
        for row in reversed(all_scores):
            d2 = datetime.strptime(row["date"], "%Y-%m-%d").date()
            if row["score"] >= streak_min:
                if prev is None or (d2 - prev).days == 1:
                    run += 1
                else:
                    run = 1
            else:
                run = 0
            if run > best:
                best = run
            prev = d2
        best_streak = best

    # Freedom Fund total
    ff = conn.execute("SELECT SUM(amount) as total FROM freedom_fund").fetchone()
    ff_total = round(ff["total"] or 0, 2)

    # Debt boss
    debt_total  = float(s["debt_total"])
    debt_target = float(s["debt_target"])
    debt_pct    = round(min(ff_total / debt_target * 100, 100), 1) if debt_target else 0

    # Avg monthly FF contribution for estimate
    months_data = conn.execute(f"""
        SELECT {sql_strftime_ym('date')} as ym, SUM(amount) as total
        FROM freedom_fund GROUP BY ym ORDER BY ym
    """).fetchall()
    if months_data:
        avg_monthly_ff = sum(r["total"] for r in months_data) / len(months_data)
        months_to_target = round((debt_target - ff_total) / avg_monthly_ff, 1) if avg_monthly_ff > 0 else None
    else:
        avg_monthly_ff = 0
        months_to_target = None

    conn.close()

    return jsonify({
        "today": dict(today_row) if today_row else None,
        "all_time_money":    round(totals["money"] or 0, 2),
        "all_time_xp":       int(totals["xp"] or 0) + int(workout_xp_row["xp"] or 0) + int(adventure_xp_row["xp"] or 0),
        "all_time_days":     int(totals["days"] or 0),
        "week_avg_score":    round(week["avg_score"] or 0, 1),
        "week_xp":           int(week["xp"] or 0),
        "month_money":       round(month["money"] or 0, 2),
        "month_tobacco_saved": round(month_detail["tobacco_saved"] or 0, 2),
        "month_weed_saved":    round(month_detail["weed_saved"] or 0, 2),
        "current_streak":    current_streak,
        "best_streak":       best_streak,
        "freedom_fund":      ff_total,
        "debt_total":        debt_total,
        "debt_target":       debt_target,
        "debt_pct":          debt_pct,
        "months_to_target":  months_to_target,
        "user_name":         s.get("user_name", "Macer"),
    })


# ── Freedom Fund ───────────────────────────────────────────────────────────────

@app.route("/api/freedom-fund", methods=["GET"])
def api_get_ff():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM freedom_fund ORDER BY date DESC, id DESC"
    ).fetchall()
    total = conn.execute("SELECT SUM(amount) as t FROM freedom_fund").fetchone()
    conn.close()
    return jsonify({
        "entries": [dict(r) for r in rows],
        "total": round(total["t"] or 0, 2),
    })


@app.route("/api/freedom-fund", methods=["POST"])
def api_add_ff():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO freedom_fund (date, source, amount, notes) VALUES (?,?,?,?)",
        (data["date"], data["source"], float(data["amount"]), data.get("notes")),
    )
    conn.commit()
    total = conn.execute("SELECT SUM(amount) as t FROM freedom_fund").fetchone()
    conn.close()
    return jsonify({"ok": True, "total": round(total["t"] or 0, 2)})


@app.route("/api/freedom-fund/<int:entry_id>", methods=["DELETE"])
def api_delete_ff(entry_id):
    conn = get_db()
    conn.execute("DELETE FROM freedom_fund WHERE id = ?", (entry_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Subscriptions ──────────────────────────────────────────────────────────────

@app.route("/api/subscriptions", methods=["GET"])
def api_get_subs():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM subscriptions ORDER BY kill_it ASC, monthly_cost DESC"
    ).fetchall()
    totals = conn.execute(
        "SELECT SUM(monthly_cost) as current_spend, "
        "SUM(CASE WHEN kill_it=1 THEN monthly_cost ELSE 0 END) as potential_savings "
        "FROM subscriptions"
    ).fetchone()
    conn.close()
    return jsonify({
        "entries": [dict(r) for r in rows],
        "current_spend":     round(totals["current_spend"] or 0, 2),
        "potential_savings": round(totals["potential_savings"] or 0, 2),
    })


@app.route("/api/subscriptions", methods=["POST"])
def api_add_sub():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO subscriptions (service, monthly_cost, last_used, kill_it, notes) "
        "VALUES (?,?,?,?,?)",
        (data["service"], float(data["monthly_cost"]), data.get("last_used"),
         int(data.get("kill_it", 0)), data.get("notes")),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/subscriptions/<int:sid>", methods=["PUT"])
def api_update_sub(sid):
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute("""
        UPDATE subscriptions SET
            service      = ?,
            monthly_cost = ?,
            last_used    = ?,
            kill_it      = ?,
            notes        = ?
        WHERE id = ?
    """, (
        data["service"], float(data["monthly_cost"]),
        data.get("last_used"), int(data.get("kill_it", 0)),
        data.get("notes"), sid,
    ))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/subscriptions/<int:sid>", methods=["DELETE"])
def api_delete_sub(sid):
    conn = get_db()
    conn.execute("DELETE FROM subscriptions WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Workouts ───────────────────────────────────────────────────────────────────

@app.route("/api/workouts", methods=["GET"])
def api_get_workouts():
    conn = get_db()
    limit = int(request.args.get("limit", 20))
    rows = conn.execute(
        "SELECT * FROM workouts ORDER BY date DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()

    week_ago = str(date.today() - timedelta(days=6))
    week_stats = conn.execute(
        "SELECT COALESCE(SUM(distance_km), 0) as km, COUNT(*) as runs "
        "FROM workouts WHERE date >= ?", (week_ago,)
    ).fetchone()

    total_runs = conn.execute("SELECT COUNT(*) as c FROM workouts").fetchone()

    conn.close()
    return jsonify({
        "entries":    [dict(r) for r in rows],
        "week_km":    round(week_stats["km"] or 0, 2),
        "week_runs":  int(week_stats["runs"] or 0),
        "total_runs": int(total_runs["c"] or 0),
    })


@app.route("/api/workouts", methods=["POST"])
def api_add_workout():
    data = request.get_json(force=True)
    entry_date = data.get("date", str(date.today()))
    wtype      = data.get("type", "Run")
    distance   = float(data["distance_km"]) if data.get("distance_km") not in (None, "") else None
    duration   = float(data["duration_minutes"]) if data.get("duration_minutes") not in (None, "") else None
    avg_hr     = int(data["avg_hr"]) if data.get("avg_hr") not in (None, "") else None
    calories   = int(data["calories"]) if data.get("calories") not in (None, "") else None
    notes      = data.get("notes") or None

    avg_pace = None
    if distance and distance > 0 and duration and duration > 0:
        avg_pace = round(duration / distance, 4)

    xp = 150 if (distance and distance >= 5) else 100

    conn = get_db()
    conn.execute("""
        INSERT INTO workouts
            (date, type, distance_km, duration_minutes, avg_hr, avg_pace, calories, notes, xp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (entry_date, wtype, distance, duration, avg_hr, avg_pace, calories, notes, xp))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "xp": xp})


@app.route("/api/workouts/<int:wid>", methods=["DELETE"])
def api_delete_workout(wid):
    conn = get_db()
    conn.execute("DELETE FROM workouts WHERE id = ?", (wid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Habit Logs ────────────────────────────────────────────────────────────────

@app.route("/api/habit-log", methods=["GET"])
def api_get_habit_log():
    d = request.args.get("date", str(date.today()))
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM habit_logs WHERE date = ? ORDER BY timestamp ASC", (d,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/habit-log", methods=["POST"])
def api_add_habit_log():
    data = request.get_json(force=True)
    now        = datetime.now()
    timestamp  = now.strftime("%Y-%m-%d %H:%M:%S")
    entry_date = str(now.date())
    htype      = data.get("type", "tobacco")
    intensity  = data.get("intensity", "none") if htype == "weed" else "none"
    trigger    = data.get("trigger") or None
    notes      = data.get("notes") or None

    conn = get_db()
    conn.execute(
        "INSERT INTO habit_logs (timestamp, date, type, intensity, trigger, notes) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (timestamp, entry_date, htype, intensity, trigger, notes),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "timestamp": timestamp})


# ── Spending ───────────────────────────────────────────────────────────────────

@app.route("/api/spending", methods=["GET"])
def api_get_spending():
    conn  = get_db()
    today = str(date.today())
    week_ago = str(date.today() - timedelta(days=6))

    rows = conn.execute(
        "SELECT * FROM spending ORDER BY date DESC, id DESC LIMIT 50"
    ).fetchall()

    today_total = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as t FROM spending WHERE date = ?", (today,)
    ).fetchone()["t"]

    week_total = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as t FROM spending WHERE date >= ?", (week_ago,)
    ).fetchone()["t"]

    last5 = conn.execute(
        "SELECT * FROM spending ORDER BY date DESC, id DESC LIMIT 5"
    ).fetchall()

    conn.close()
    return jsonify({
        "entries":     [dict(r) for r in rows],
        "today_total": round(today_total, 2),
        "week_total":  round(week_total, 2),
        "last5":       [dict(r) for r in last5],
    })


@app.route("/api/spending", methods=["POST"])
def api_add_spending():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO spending (date, merchant, amount, category, notes) VALUES (?,?,?,?,?)",
        (
            data.get("date", str(date.today())),
            data["merchant"],
            float(data["amount"]),
            data.get("category", "Random"),
            data.get("notes") or None,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/spending/<int:sid>", methods=["DELETE"])
def api_delete_spending(sid):
    conn = get_db()
    conn.execute("DELETE FROM spending WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Work Capture ──────────────────────────────────────────────────────────────

@app.route("/api/work-capture", methods=["GET"])
def api_get_work_captures():
    limit = int(request.args.get("limit", 20))
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM work_captures ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/work-capture", methods=["POST"])
def api_add_work_capture():
    data = request.get_json(force=True)
    params = (
        data.get("date", str(date.today())),
        data.get("domain", ""),
        data.get("reflection_type") or None,
        data.get("note", ""),
        data.get("priority") or None,
        data.get("mood") or None,
        int(data["energy"]) if data.get("energy") not in (None, "") else None,
        int(data["progress"]) if data.get("progress") not in (None, "") else None,
        int(data["load_complexity"]) if data.get("load_complexity") not in (None, "") else None,
        data.get("sow_tags") or None,
        data.get("people_tags") or None,
        1 if data.get("synced") else 0,
    )
    conn = get_db()
    if IS_POSTGRES:
        cursor = conn.execute(
            "INSERT INTO work_captures "
            "(date, domain, reflection_type, note, priority, mood, energy, progress, "
            " load_complexity, sow_tags, people_tags, synced) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
            params,
        )
        new_id = cursor.fetchone()["id"]
    else:
        cursor = conn.execute(
            "INSERT INTO work_captures "
            "(date, domain, reflection_type, note, priority, mood, energy, progress, "
            " load_complexity, sow_tags, people_tags, synced) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            params,
        )
        new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": new_id})


# ── Vehicle — Maintenance ──────────────────────────────────────────────────────

@app.route("/api/vehicle/maintenance", methods=["GET"])
def api_get_vehicle_maintenance():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM vehicle_maintenance ORDER BY date DESC, id DESC"
    ).fetchall()
    total = conn.execute(
        "SELECT COALESCE(SUM(cost), 0) as t FROM vehicle_maintenance"
    ).fetchone()
    conn.close()
    return jsonify({
        "entries": [dict(r) for r in rows],
        "total_cost": round(total["t"] or 0, 2),
    })


@app.route("/api/vehicle/maintenance", methods=["POST"])
def api_add_vehicle_maintenance():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO vehicle_maintenance (date, mileage, task, cost, notes) VALUES (?,?,?,?,?)",
        (
            data["date"],
            int(data["mileage"]),
            data["task"],
            float(data["cost"]) if data.get("cost") not in (None, "") else None,
            data.get("notes") or None,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/vehicle/maintenance/<int:mid>", methods=["DELETE"])
def api_delete_vehicle_maintenance(mid):
    conn = get_db()
    conn.execute("DELETE FROM vehicle_maintenance WHERE id = ?", (mid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Vehicle — Vitals ───────────────────────────────────────────────────────────

@app.route("/api/vehicle/vitals", methods=["GET"])
def api_get_vehicle_vitals():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM vehicle_vitals ORDER BY date DESC, id DESC"
    ).fetchall()
    last = conn.execute(
        "SELECT odometer FROM vehicle_vitals ORDER BY date DESC, id DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return jsonify({
        "entries": [dict(r) for r in rows],
        "last_odometer": last["odometer"] if last else None,
    })


@app.route("/api/vehicle/vitals", methods=["POST"])
def api_add_vehicle_vitals():
    data = request.get_json(force=True)
    odometer   = int(data["odometer"])
    gallons    = float(data["gallons"]) if data.get("gallons") not in (None, "") else None
    trans_temp = int(data["trans_temp"]) if data.get("trans_temp") not in (None, "") else None
    notes      = data.get("notes") or None

    conn = get_db()
    prev = conn.execute(
        "SELECT odometer FROM vehicle_vitals ORDER BY date DESC, id DESC LIMIT 1"
    ).fetchone()

    miles_driven = None
    mpg          = None
    if prev:
        miles_driven = odometer - prev["odometer"]
        if gallons and gallons > 0 and miles_driven and miles_driven > 0:
            mpg = round(miles_driven / gallons, 2)

    conn.execute(
        "INSERT INTO vehicle_vitals (date, odometer, miles_driven, gallons, mpg, trans_temp, notes) "
        "VALUES (?,?,?,?,?,?,?)",
        (data["date"], odometer, miles_driven, gallons, mpg, trans_temp, notes),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "miles_driven": miles_driven, "mpg": mpg})


# ── Vehicle — Checklist ────────────────────────────────────────────────────────

@app.route("/api/vehicle/checklist", methods=["GET"])
def api_get_vehicle_checklist():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM vehicle_checklist ORDER BY priority ASC, id ASC"
    ).fetchall()
    conn.close()
    grouped = {1: [], 2: [], 3: [], 4: []}
    for r in rows:
        grouped[r["priority"]].append(dict(r))
    return jsonify(grouped)


@app.route("/api/vehicle/checklist/<int:cid>", methods=["POST"])
def api_update_vehicle_checklist(cid):
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "UPDATE vehicle_checklist SET status=?, last_checked=?, notes=? WHERE id=?",
        (
            data.get("status", "not_done"),
            str(date.today()),
            data.get("notes") or None,
            cid,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Adventures ─────────────────────────────────────────────────────────────────

@app.route("/api/adventures", methods=["GET"])
def api_get_adventures():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM adventures ORDER BY date DESC, id DESC"
    ).fetchall()
    totals = conn.execute(
        "SELECT COUNT(*) as cnt, COALESCE(SUM(distance_mi),0) as miles, COALESCE(SUM(xp),0) as xp "
        "FROM adventures"
    ).fetchone()
    states = conn.execute(
        "SELECT DISTINCT state FROM adventures WHERE state IS NOT NULL AND state != '' ORDER BY state"
    ).fetchall()
    conn.close()
    return jsonify({
        "entries":          [dict(r) for r in rows],
        "total_adventures": int(totals["cnt"] or 0),
        "total_miles":      round(totals["miles"] or 0, 2),
        "states_visited":   [r["state"] for r in states],
        "total_xp":         int(totals["xp"] or 0),
    })


@app.route("/api/adventures", methods=["POST"])
def api_add_adventure():
    data        = request.get_json(force=True)
    entry_date  = data.get("date", str(date.today()))
    title       = data["title"]
    atype       = data.get("type", "Hike")
    location    = data["location"]
    state       = data.get("state") or None
    distance_mi = float(data["distance_mi"]) if data.get("distance_mi") not in (None, "") else None
    duration    = int(data["duration_minutes"]) if data.get("duration_minutes") not in (None, "") else None
    elevation   = int(data["elevation_ft"]) if data.get("elevation_ft") not in (None, "") else None
    difficulty  = data.get("difficulty") or None
    rating      = int(data["rating"]) if data.get("rating") not in (None, "") else None
    notes       = data.get("notes") or None

    # XP calculation
    xp = 100
    if distance_mi and distance_mi >= 5:
        xp += 50
    if elevation and elevation >= 500:
        xp += 50

    # New state bonus — check if state hasn't been logged before
    if state:
        conn = get_db()
        existing_state = conn.execute(
            "SELECT 1 FROM adventures WHERE state = ? LIMIT 1", (state,)
        ).fetchone()
        if not existing_state:
            xp += 25
        conn.execute(
            "INSERT INTO adventures (date, title, type, location, state, distance_mi, duration_minutes, "
            "elevation_ft, difficulty, rating, notes, xp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (entry_date, title, atype, location, state, distance_mi, duration, elevation, difficulty, rating, notes, xp),
        )
        conn.commit()
        conn.close()
    else:
        conn = get_db()
        conn.execute(
            "INSERT INTO adventures (date, title, type, location, state, distance_mi, duration_minutes, "
            "elevation_ft, difficulty, rating, notes, xp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (entry_date, title, atype, location, state, distance_mi, duration, elevation, difficulty, rating, notes, xp),
        )
        conn.commit()
        conn.close()

    return jsonify({"ok": True, "xp": xp})


@app.route("/api/adventures/<int:aid>", methods=["DELETE"])
def api_delete_adventure(aid):
    conn = get_db()
    conn.execute("DELETE FROM adventures WHERE id = ?", (aid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Travel ─────────────────────────────────────────────────────────────────────

@app.route("/api/travel", methods=["GET"])
def api_get_travel():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM travel ORDER BY date DESC, id DESC LIMIT 30"
    ).fetchall()
    conn.close()
    return jsonify({"entries": [dict(r) for r in rows]})


@app.route("/api/travel", methods=["POST"])
def api_add_travel():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO travel (date, destination, miles, purpose, reimbursable, notes) "
        "VALUES (?,?,?,?,?,?)",
        (
            data.get("date", str(date.today())),
            data["destination"],
            float(data["miles"]) if data.get("miles") not in (None, "") else None,
            data.get("purpose") or None,
            int(data.get("reimbursable", 0)),
            data.get("notes") or None,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Quick Log ──────────────────────────────────────────────────────────────────

@app.route("/api/quick-log", methods=["GET"])
def api_get_quick_log():
    d = request.args.get("date", str(date.today()))
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM quick_logs WHERE date = ? ORDER BY timestamp ASC", (d,)
    ).fetchall()
    counts_rows = conn.execute(
        "SELECT type, COUNT(*) as cnt FROM quick_logs WHERE date = ? GROUP BY type", (d,)
    ).fetchall()
    last = conn.execute(
        "SELECT * FROM quick_logs WHERE date = ? ORDER BY timestamp DESC LIMIT 1", (d,)
    ).fetchone()
    conn.close()
    return jsonify({
        "entries": [dict(r) for r in rows],
        "counts":  {r["type"]: r["cnt"] for r in counts_rows},
        "last":    dict(last) if last else None,
    })


@app.route("/api/quick-log", methods=["POST"])
def api_add_quick_log():
    data = request.get_json(force=True)
    now        = datetime.now()
    timestamp  = data.get("timestamp") or now.strftime("%Y-%m-%d %H:%M:%S")
    entry_date = data.get("date") or str(now.date())
    log_type   = data["type"]
    print(f"[quick-log] inserting type={log_type!r} db=postgres={IS_POSTGRES}")
    conn = get_db()
    conn.execute(
        "INSERT INTO quick_logs (type, timestamp, date, source, notes) VALUES (?,?,?,?,?)",
        (
            log_type,
            timestamp,
            entry_date,
            data.get("source", "home_quick_log"),
            data.get("notes") or None,
        ),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "timestamp": timestamp})


if __name__ == "__main__":
    port  = int(os.environ.get("PORT", 5052))
    debug = os.environ.get("FLASK_DEBUG", "1") != "0"
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
