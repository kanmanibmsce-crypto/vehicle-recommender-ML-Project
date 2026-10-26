"""Interaction logging (SQLite) and success-metric calculations.

Every recommendation shown is logged as an `impression` with its
recommendation_id and position, so clicks / test drives / purchases can be
attributed back to the ranked list that produced them.
"""
from __future__ import annotations

import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

from . import config as C

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    vehicle_id INTEGER,
    event_type TEXT NOT NULL,
    recommendation_id TEXT,
    position INTEGER,
    value REAL,
    ts REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

CREATE TABLE IF NOT EXISTS test_drive_bookings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL,
    vehicle_id      INTEGER NOT NULL,
    name            TEXT    NOT NULL,
    phone           TEXT    NOT NULL,
    city            TEXT    NOT NULL,
    preferred_date  TEXT    NOT NULL,
    recommendation_id TEXT,
    ts              REAL    NOT NULL
);
"""


class EventStore:
    def __init__(self, db_path: Path | str = C.DB_PATH):
        self.db_path = str(db_path)
        with self._conn() as con:
            con.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        con = sqlite3.connect(self.db_path)
        try:
            yield con
            con.commit()
        finally:
            con.close()

    # -- writes -----------------------------------------------------------
    def log(self, user_id, event_type, vehicle_id=None, recommendation_id=None,
            position=None, value=None, ts=None):
        if event_type not in C.VALID_EVENT_TYPES:
            raise ValueError(f"Unknown event_type '{event_type}'")
        with self._conn() as con:
            con.execute(
                "INSERT INTO events (user_id, vehicle_id, event_type, recommendation_id, position, value, ts)"
                " VALUES (?,?,?,?,?,?,?)",
                (user_id, vehicle_id, event_type, recommendation_id, position, value, ts or time.time()),
            )

    def log_impressions(self, user_id, recommendation_id, vehicle_ids):
        now = time.time()
        with self._conn() as con:
            con.executemany(
                "INSERT INTO events (user_id, vehicle_id, event_type, recommendation_id, position, value, ts)"
                " VALUES (?,?,?,?,?,NULL,?)",
                [(user_id, vid, "impression", recommendation_id, i + 1, now) for i, vid in enumerate(vehicle_ids)],
            )

    # -- reads ------------------------------------------------------------
    def user_interactions(self, user_id):
        """Positive interactions (not impressions/feedback) for the implicit profile."""
        types = tuple(C.EVENT_WEIGHTS)
        q = f"SELECT vehicle_id, event_type, ts FROM events WHERE user_id=? AND vehicle_id IS NOT NULL " \
            f"AND event_type IN ({','.join('?' * len(types))})"
        with self._conn() as con:
            return con.execute(q, (user_id, *types)).fetchall()

    def popularity(self) -> dict[int, float]:
        """Weighted engagement count per vehicle (used as a small score boost)."""
        with self._conn() as con:
            rows = con.execute(
                "SELECT vehicle_id, event_type, COUNT(*) FROM events "
                "WHERE vehicle_id IS NOT NULL GROUP BY vehicle_id, event_type"
            ).fetchall()
        pop: dict[int, float] = {}
        for vid, et, n in rows:
            pop[vid] = pop.get(vid, 0.0) + C.EVENT_WEIGHTS.get(et, 0.0) * n
        return pop

    def book_test_drive(self, user_id, vehicle_id, name, phone, city, preferred_date,
                        recommendation_id=None):
        with self._conn() as con:
            cur = con.execute(
                "INSERT INTO test_drive_bookings"
                " (user_id, vehicle_id, name, phone, city, preferred_date, recommendation_id, ts)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (user_id, vehicle_id, name, phone, city, preferred_date,
                 recommendation_id, time.time()),
            )
            booking_id = cur.lastrowid
        self.log(user_id, "test_drive", vehicle_id=vehicle_id,
                 recommendation_id=recommendation_id)
        return booking_id

    def get_test_drive_bookings(self, vehicle_id=None) -> list[dict]:
        cols = ["id", "user_id", "vehicle_id", "name", "phone", "city",
                "preferred_date", "recommendation_id", "ts"]
        with self._conn() as con:
            if vehicle_id is not None:
                rows = con.execute(
                    "SELECT * FROM test_drive_bookings WHERE vehicle_id=? ORDER BY ts DESC",
                    (vehicle_id,),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT * FROM test_drive_bookings ORDER BY ts DESC"
                ).fetchall()
        return [dict(zip(cols, r)) for r in rows]

    def metrics(self) -> dict:
        with self._conn() as con:
            def one(sql, *a):
                return con.execute(sql, a).fetchone()[0] or 0

            impressions = one("SELECT COUNT(*) FROM events WHERE event_type='impression'")
            rec_clicks = one("SELECT COUNT(*) FROM events WHERE event_type='click' AND recommendation_id IS NOT NULL")
            users_shown = one("SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type='impression'")
            td_users = one("SELECT COUNT(DISTINCT user_id) FROM events WHERE event_type='test_drive'")
            test_drives = one("SELECT COUNT(*) FROM events WHERE event_type='test_drive'")
            purchases = one("SELECT COUNT(*) FROM events WHERE event_type='purchase'")
            fb_n = one("SELECT COUNT(*) FROM events WHERE event_type='feedback'")
            fb_pos = one("SELECT COUNT(*) FROM events WHERE event_type='feedback' AND value >= 1")
            by_pos = con.execute(
                "SELECT i.position, COUNT(*) AS shown, "
                "SUM(EXISTS(SELECT 1 FROM events c WHERE c.event_type='click' AND c.recommendation_id=i.recommendation_id "
                "AND c.vehicle_id=i.vehicle_id)) AS clicked "
                "FROM events i WHERE i.event_type='impression' AND i.position <= 10 GROUP BY i.position ORDER BY i.position"
            ).fetchall()

        def rate(a, b):
            return round(a / b, 4) if b else None

        return {
            "impressions": impressions,
            "recommendation_clicks": rec_clicks,
            "ctr": rate(rec_clicks, impressions),
            "users_shown_recommendations": users_shown,
            "test_drive_bookings": test_drives,
            "test_drive_rate": rate(td_users, users_shown),
            "purchases": purchases,
            "lead_conversion_rate": rate(purchases, test_drives),
            "feedback_responses": fb_n,
            "csat": rate(fb_pos, fb_n),
            "ctr_by_position": [
                {"position": p, "shown": s, "clicked": c, "ctr": rate(c, s)} for p, s, c in by_pos
            ],
        }
