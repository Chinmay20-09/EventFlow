# P1 Crowd Simulator

Run the manual harness with:

```bash
npx tsx scripts/test_Crowd.ts
```

It uses the public P1 engine APIs and provides deterministic presets for normal traffic, heavy crowds, blocked corridors, gate failures, rerouting, capacity stress, step inspection, custom inputs, comparison, determinism checks, and JSON export.

The step mode displays captured engine steps; it does not implement a second simulation loop. The current engine does not expose interactive pause/resume stepping, so steps are inspected after the run.

Use `E` after a run to write `test_Crowd.latest.json`.
