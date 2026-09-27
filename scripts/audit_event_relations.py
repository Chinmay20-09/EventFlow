"""Read-only audit of the event-centered schema in live PostgreSQL (PHASE 1–3).

Connects with DATABASE_URL from backend/.env (the configured database) and
prints the actual state: tables, row counts, primary keys, foreign keys,
indexes, orphan references, NULL event_ids and duplicate-key violations.
This script NEVER modifies anything — it is the evidence base for deciding
which foreign keys can be safely added.

Usage:  python scripts/audit_event_relations.py
"""

import urllib.parse
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "backend" / ".env"


def database_url() -> str:
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("DATABASE_URL="):
            url = line.split("=", 1)[1].strip().strip('"').strip("'")
            # The app rewrites postgresql:// to the psycopg3 driver; do the same.
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
    raise SystemExit(f"DATABASE_URL not found in {ENV_PATH}")


def connect() -> psycopg.Connection:
    url = database_url()
    p = urllib.parse.urlparse(url)
    return psycopg.connect(
        dbname=p.path.lstrip("/"),
        user=p.username,
        password=urllib.parse.unquote(p.password or ""),
        host=p.hostname,
        port=p.port or 5432,
    )


def section(title: str) -> None:
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def rows(cur, sql: str, params: tuple = ()):
    cur.execute(sql, params)
    return cur.fetchall()


def main() -> None:
    with connect() as conn, conn.cursor() as cur:
        # ------------------------------------------------------------------
        section("1. TABLES + ROW COUNTS")
        tables = [r[0] for r in rows(cur, """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """)]
        counts: dict[str, int] = {}
        for t in tables:
            counts[t] = rows(cur, f'SELECT COUNT(*) FROM "{t}"')[0][0]
        for t in tables:
            print(f"  {t:24s} {counts[t]:>6} rows")

        # ------------------------------------------------------------------
        section("2. PRIMARY KEYS")
        for t, c in rows(cur, """
            SELECT tc.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
            ORDER BY tc.table_name
        """):
            print(f"  {t:24s} PK = {c}")

        # ------------------------------------------------------------------
        section("3. FOREIGN KEY CONSTRAINTS (actual, in the database)")
        fks = rows(cur, """
            SELECT
              tc.table_name,
              kcu.column_name,
              ccu.table_name,
              ccu.column_name,
              rc.delete_rule
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
            JOIN information_schema.referential_constraints rc
              ON rc.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
            ORDER BY tc.table_name, kcu.column_name
        """)
        for child, ccol, parent, pcol, rule in fks:
            print(f"  {child}.{ccol:22s} -> {parent}.{pcol:12s} ON DELETE {rule}")

        # ------------------------------------------------------------------
        section("4. event_id COLUMN TYPES (must match events.event_id)")
        ev_type = rows(cur, """
            SELECT data_type FROM information_schema.columns
            WHERE table_name = 'events' AND column_name = 'event_id'
        """)[0][0]
        print(f"  events.event_id: {ev_type}")
        for t in tables:
            cols = rows(cur, """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = %s AND column_name = 'event_id'
            """, (t,))
            for c, dtype, nullable in cols:
                print(f"  {t}.{c:22s} {dtype:14s} nullable={nullable}")

        # ------------------------------------------------------------------
        section("5. INDEXES on event_id / node_id / strategy_set_id")
        idx = rows(cur, """
            SELECT tablename, indexname FROM pg_indexes
            WHERE schemaname = 'public'
              AND (indexname LIKE '%%event_id%%' OR indexname LIKE '%%node_id%%'
                   OR indexname LIKE '%%strategy_set%%' OR indexname LIKE '%%external%%')
            ORDER BY tablename, indexname
        """)
        for t, name in idx:
            print(f"  {t:24s} {name}")

        # ------------------------------------------------------------------
        section("6. ORPHAN CHECKS (direct event children)")
        direct_children = ["nodes", "edges", "disruptions", "event_settings", "strategy_sets"]
        any_orphan = False
        for t in direct_children:
            orphan, nulls = rows(cur, f"""
                SELECT
                  COUNT(*) FILTER (WHERE e.event_id IS NULL AND c.event_id IS NOT NULL),
                  COUNT(*) FILTER (WHERE c.event_id IS NULL)
                FROM "{t}" c LEFT JOIN events e ON c.event_id = e.event_id
            """)[0]
            status = "OK" if orphan == 0 and nulls == 0 else "ORPHANS/NULLS FOUND"
            if orphan or nulls:
                any_orphan = True
            print(f"  {t:24s} orphans={orphan:>4}  null event_id={nulls:>4}  {status}")

        # ------------------------------------------------------------------
        section("7. ORPHAN CHECKS (indirect children)")
        indirect = [
            ("strategies -> strategy_sets",
             'SELECT COUNT(*) FROM strategies s LEFT JOIN strategy_sets ss '
             'ON s.strategy_set_id = ss.strategy_set_id WHERE ss.strategy_set_id IS NULL'),
            ("simulation_results -> strategy_sets",
             'SELECT COUNT(*) FROM simulation_results r LEFT JOIN strategy_sets ss '
             'ON r.strategy_set_id = ss.strategy_set_id WHERE ss.strategy_set_id IS NULL'),
            ("approvals -> strategy_sets",
             'SELECT COUNT(*) FROM approvals a LEFT JOIN strategy_sets ss '
             'ON a.strategy_set_id = ss.strategy_set_id WHERE ss.strategy_set_id IS NULL'),
            ("approvals.approved_by -> users",
             'SELECT COUNT(*) FROM approvals a LEFT JOIN users u '
             'ON a.approved_by = u.user_id WHERE u.user_id IS NULL'),
            ("executions -> strategy_sets",
             'SELECT COUNT(*) FROM executions x LEFT JOIN strategy_sets ss '
             'ON x.strategy_set_id = ss.strategy_set_id WHERE ss.strategy_set_id IS NULL'),
            ("crowd_state -> nodes",
             'SELECT COUNT(*) FROM crowd_state cs LEFT JOIN nodes n '
             'ON cs.node_id = n.node_id WHERE n.node_id IS NULL'),
            ("predictions -> nodes",
             'SELECT COUNT(*) FROM predictions p LEFT JOIN nodes n '
             'ON p.node_id = n.node_id WHERE n.node_id IS NULL'),
            ("edges.from_node_id -> nodes",
             'SELECT COUNT(*) FROM edges e LEFT JOIN nodes n '
             'ON e.from_node_id = n.node_id WHERE n.node_id IS NULL'),
            ("edges.to_node_id -> nodes",
             'SELECT COUNT(*) FROM edges e LEFT JOIN nodes n '
             'ON e.to_node_id = n.node_id WHERE n.node_id IS NULL'),
            ("strategies.source_node_id -> nodes",
             'SELECT COUNT(*) FROM strategies s LEFT JOIN nodes n '
             'ON s.source_node_id = n.node_id WHERE n.node_id IS NULL'),
            ("strategies.destination_node_id -> nodes",
             'SELECT COUNT(*) FROM strategies s LEFT JOIN nodes n '
             'ON s.destination_node_id = n.node_id WHERE n.node_id IS NULL'),
            ("strategy_sets.simulation_result_id -> simulation_results (pointer, no FK in model)",
             'SELECT COUNT(*) FROM strategy_sets ss LEFT JOIN simulation_results r '
             'ON ss.simulation_result_id = r.simulation_result_id '
             'WHERE ss.simulation_result_id IS NOT NULL AND r.simulation_result_id IS NULL'),
        ]
        for label, sql in indirect:
            n = rows(cur, sql)[0][0]
            status = "OK" if n == 0 else f"{n} DANGLING"
            if n:
                any_orphan = True
            print(f"  {label:75s} {status}")

        # ------------------------------------------------------------------
        section("8. UNIQUENESS that must hold (duplicates would break FK/index adds)")
        dup_checks = [
            ("event_settings.event_id (one settings row per event)",
             'SELECT COUNT(*) FROM (SELECT event_id FROM event_settings '
             'GROUP BY event_id HAVING COUNT(*) > 1) d'),
            ("crowd_state.node_id (one current row per node)",
             'SELECT COUNT(*) FROM (SELECT node_id FROM crowd_state '
             'GROUP BY node_id HAVING COUNT(*) > 1) d'),
            ("predictions.node_id (latest prediction per node)",
             'SELECT COUNT(*) FROM (SELECT node_id FROM predictions '
             'GROUP BY node_id HAVING COUNT(*) > 1) d'),
            ("executions.strategy_set_id (one execution per set)",
             'SELECT COUNT(*) FROM (SELECT strategy_set_id FROM executions '
             'GROUP BY strategy_set_id HAVING COUNT(*) > 1) d'),
            ("nodes(event_id, external_id) composite",
             'SELECT COUNT(*) FROM (SELECT event_id, external_id FROM nodes '
             'WHERE external_id IS NOT NULL '
             'GROUP BY event_id, external_id HAVING COUNT(*) > 1) d'),
        ]
        for label, sql in dup_checks:
            n = rows(cur, sql)[0][0]
            status = "OK" if n == 0 else f"{n} DUPLICATE GROUPS"
            if n:
                any_orphan = True
            print(f"  {label:55s} {status}")

        # ------------------------------------------------------------------
        section("9. EXISTING EVENT DATA (must be preserved)")
        for eid, name, status in rows(cur, """
            SELECT event_id, name, status FROM events ORDER BY event_id
        """):
            n_nodes = rows(cur, "SELECT COUNT(*) FROM nodes WHERE event_id = %s", (eid,))[0][0]
            n_sets = rows(cur, "SELECT COUNT(*) FROM strategy_sets WHERE event_id = %s", (eid,))[0][0]
            n_dis = rows(cur, "SELECT COUNT(*) FROM disruptions WHERE event_id = %s", (eid,))[0][0]
            print(f"  event {eid:>3}  {name[:40]:42s} {status:8s} "
                  f"nodes={n_nodes} strategy_sets={n_sets} disruptions={n_dis}")

        print(f"\nANY ORPHANS/DUPLICATES FOUND: {'YES — FKs must NOT be added blindly' if any_orphan else 'NO — schema is FK-safe'}")


if __name__ == "__main__":
    main()
