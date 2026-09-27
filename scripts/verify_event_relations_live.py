"""Live PostgreSQL verification of the event-centered relationships (PHASE 10).

Runs against the REAL configured database and proves, end to end:

  1. BEFORE snapshot of every table's row count (data preservation baseline).
  2. A unique test event (EV-EVENT-RELATION-TEST-001) is created through the
     API, with child records (nodes, disruption, crowd, prediction,
     strategy set + strategies) created through the existing APIs.
  3. Event-scoped GETs return ONLY that event's records.
  4. The live database REJECTS an orphan insert (FK enforcement on).
  5. AFTER counts differ only by the newly created test rows.
  6. Cleanup deletes ONLY the test event (ON DELETE CASCADE removes its
     children) — afterwards every count equals the BEFORE snapshot.

Pre-existing user/project data is never modified.

Usage:  python scripts/verify_event_relations_live.py
"""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import psycopg

from audit_event_relations import connect  # same DB config as the audit

BASE_URL = "http://localhost:8000"
MARKER = "EV-EVENT-RELATION-TEST-001"
TABLES = [
    "approvals", "crowd_state", "disruptions", "edges", "event_settings",
    "events", "executions", "nodes", "predictions", "simulation_results",
    "strategies", "strategy_sets", "users",
]

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def api(method: str, path: str, payload: dict | None = None, headers: dict | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"{BASE_URL}{path}", data=body, method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def snapshot(cur) -> dict[str, int]:
    return {t: cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in TABLES}


def fk_list(cur) -> list[str]:
    cur.execute("""
        SELECT tc.table_name || '.' || kcu.column_name || ' -> '
               || ccu.table_name || '.' || ccu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        ORDER BY 1
    """)
    return [r[0] for r in cur.fetchall()]


def main() -> int:
    with connect() as conn, conn.cursor() as cur:
        # Remove rows left over by an earlier interrupted run of THIS script
        # (identified by the reserved test names — never real data).
        cur.execute("DELETE FROM events WHERE name IN (%s, 'EV-REL-OTHER')", (MARKER,))
        conn.commit()

        before = snapshot(cur)
        fks_before = fk_list(cur)
        print("BEFORE:", {t: before[t] for t in TABLES})

        # -- 1. create the unique test event through the API ----------------
        status, body = api("POST", "/api/events", {"name": MARKER,
                                                   "start_time": "2026-10-10T10:00:00Z",
                                                   "end_time": "2026-10-10T22:00:00Z"})
        check("POST /api/events creates test event", status == 201 and body["success"])
        event_id = body["data"]["event_id"]
        print(f"  test event_id = {event_id}")

        # -- 2. children through the existing APIs ---------------------------
        s1, n1 = api("POST", f"/api/events/{event_id}/nodes",
                     {"name": "Rel North", "type": "GATE", "capacity": 1000, "status": "OPEN"})
        s2, n2 = api("POST", f"/api/events/{event_id}/nodes",
                     {"name": "Rel East", "type": "GATE", "capacity": 1000, "status": "OPEN"})
        check("POST nodes under test event", s1 == 201 and s2 == 201)
        node_a, node_b = n1["data"]["node_id"], n2["data"]["node_id"]

        s, _ = api("POST", f"/api/events/{event_id}/disruptions",
                   {"type": "WEATHER_EVENT", "severity": "LOW",
                    "affected_nodes": [node_a], "affected_edges": [],
                    "start_time": "2026-10-10T12:00:00Z", "expected_duration": 600,
                    "source": "external"})
        check("POST disruption under test event", s == 201)

        s, _ = api("POST", "/api/internal/crowd",
                   {"event_id": event_id, "node_id": node_a, "current_crowd": 555})
        check("POST crowd under test event (node owned by event)", s == 201)

        s, _ = api("POST", "/api/internal/predictions",
                   {"node_id": node_a, "metric": "crowd",
                    "predicted_value": 600, "prediction_horizon": 300, "confidence": 0.9})
        check("POST prediction under test event (via node)", s == 201)

        s, ss = api("POST", f"/api/events/{event_id}/strategy-sets",
                    {"strategies": [{"source_node_id": node_a,
                                     "destination_node_id": node_b,
                                     "action": "REDIRECT_FLOW"}]})
        check("POST strategy set under test event", s == 201)
        strategy_set_id = ss["data"]["strategy_set_id"]

        # cross-event rejection: node of ANOTHER event must be rejected (Phase 8)
        other = api("POST", "/api/events", {"name": "EV-REL-OTHER",
                                            "start_time": "2026-10-10T10:00:00Z",
                                            "end_time": "2026-10-10T22:00:00Z"})
        other_id = other[1]["data"]["event_id"]
        s, on = api("POST", f"/api/events/{other_id}/nodes",
                    {"name": "Other Node", "type": "GATE", "capacity": 10, "status": "OPEN"})
        s2, _ = api("POST", f"/api/events/{event_id}/strategy-sets",
                    {"strategies": [{"source_node_id": node_a,
                                     "destination_node_id": on["data"]["node_id"],
                                     "action": "X"}]})
        check("cross-event node reference REJECTED (VALIDATION_ERROR)",
              s2 == 422, f"status {s2}")

        # unknown event rejected (Phase 8)
        s, _ = api("POST", "/api/events/999999/nodes",
                   {"name": "Ghost", "type": "GATE", "capacity": 1, "status": "OPEN"})
        check("child for nonexistent event rejected (404)", s == 404, f"status {s}")

        # -- 3. event-scoped retrieval returns only this event's rows --------
        s, nodes = api("GET", f"/api/events/{event_id}/nodes")
        got = sorted(n["node_id"] for n in nodes["data"])
        check("GET /events/{id}/nodes returns only test event's nodes",
              got == sorted([node_a, node_b]), str(got))
        s, dis = api("GET", f"/api/events/{event_id}/disruptions")
        check("GET /events/{id}/disruptions returns only test event's rows",
              len(dis["data"]) == 1)
        s, sets = api("GET", f"/api/events/{event_id}/strategy-sets")
        check("GET /events/{id}/strategy-sets returns only test event's set",
              [x["strategy_set_id"] for x in sets["data"]] == [strategy_set_id])
        s, fc = api("GET", f"/api/events/{event_id}/predictions/forecast")
        check("GET /events/{id}/predictions/forecast scopes via nodes",
              all(z["node_id"] in (node_a, node_b) for z in fc["data"]["zones"]))

        # -- 4. live FK enforcement: orphan insert must fail -----------------
        orphan_ok = False
        try:
            cur.execute(
                "INSERT INTO nodes (event_id, name, type, capacity, status, created_at) "
                "VALUES (999999, 'ORPHAN', 'GATE', 1, 'OPEN', NOW())"
            )
            conn.rollback()
        except psycopg.errors.ForeignKeyViolation:
            conn.rollback()
            orphan_ok = True
        check("live PostgreSQL rejects orphan node (FK violation)", orphan_ok)

        # -- 5. AFTER counts: only test rows added ---------------------------
        after = snapshot(cur)
        expected_delta = {
            "events": 2,       # test event + helper "EV-REL-OTHER"
            "nodes": 3,        # 2 test nodes + 1 helper node
            "disruptions": 1,
            "crowd_state": 1,
            "predictions": 1,
            "strategy_sets": 1,
            "strategies": 1,
        }
        diffs = {t: after[t] - before[t] for t in TABLES if after[t] != before[t]}
        check("row counts changed only by the test rows", diffs == expected_delta,
              f"actual deltas: { {t: v for t, v in diffs.items()} }")

        # -- 6. cleanup: delete ONLY the test events (cascade children) ------
        cur.execute("DELETE FROM events WHERE name IN (%s, 'EV-REL-OTHER')", (MARKER,))
        conn.commit()
        cleaned = snapshot(cur)
        check("after cleanup every table equals the BEFORE snapshot",
              cleaned == before,
              str({t: (before[t], cleaned[t]) for t in TABLES if before[t] != cleaned[t]}))
        cur.execute("SELECT COUNT(*) FROM events WHERE name LIKE 'EV-EVENT-RELATION-TEST%%'")
        check("no test rows remain in the database", cur.fetchone()[0] == 0)

        fks_after = fk_list(cur)
        check("FK constraint set unchanged by the whole run", fks_after == fks_before)

        print(f"\n{'=' * 60}")
        if failures:
            print(f"RESULT: {len(failures)} FAILED check(s)")
            return 1
        print("RESULT: ALL LIVE CHECKS PASSED — pre-existing data preserved")
        return 0


if __name__ == "__main__":
    sys.exit(main())
