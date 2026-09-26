# Seeding the `blueprint-demo` Worker Group

The demo group holds deliberately broken config that trips every Blueprint lint rule. The definition lives in [`seed.ts`](./seed.ts). The same data is the "bad" fixture in the unit tests, so the demo and the tests can't drift apart.

Everything in it is fake: `example.com` hosts, `FAKE` tokens, and Datagen sources only.

## 1. Create the group (Cribl UI, once)

1. In Cribl Stream, open **Worker Groups** and add a group with ID `blueprint-demo`.
2. No Workers are needed. Blueprint reads and writes config through the Leader API, so an unprovisioned group is enough. Check your Cribl.Cloud plan for any per-group cost before provisioning Workers.

For the "no noise" check, also create `blueprint-clean` and leave it at its defaults. It should produce zero findings. Its Default route does go to devnull, but L02 only fires when other routes sit above the catch-all.

## 2. Seed it (Blueprint Live Preview)

1. Run `npm run dev` and open the app in **Live Preview**.
2. Pick `blueprint-demo` in the Worker Group picker.
3. Click **Show dev tools**, then **Seed blueprint-demo**, then **Confirm**.

The seeder:

- Refuses any group whose ID doesn't start with `blueprint-`.
- Reads the group's available Datagen samples instead of assuming file names.
- Creates or overwrites 6 pipelines, 3 destinations, and 4 sources, then replaces the whole Routing table.
- Does not commit or deploy. Commit in Cribl if you want a clean "before" state for the demo.

Re-running is safe: it converges the group back to the seed.

## 3. What should fire

| Seeded object | Rule |
| --- | --- |
| Route 2 `catch_all_early` is Final with filter `true` | L01 |
| Default route outputs to `default`, which resolves to devnull | L02 |
| Pipeline `legacy_cleanup` is referenced by nothing | L03 |
| Destination `old_s3_archive` is referenced by nothing | L04 |
| Destination `splunk_example` has backpressure set to drop | L05 |
| Pipeline `all_disabled` has every function disabled | L06 |
| Pipeline `enrich_auth` evals a `token=FAKE…` literal | L07 |
| Pipeline `parse_auth` regex starts with `.*` | L08 |
| Source `gen_metrics_qc` uses QuickConnect to `webhook_example` | No false L03/L04; dotted path in the diagram |

## Manual fallback

If the seeder can't run, create the objects listed in `seed.ts` by hand in the Cribl UI, keeping the IDs and route order exactly as written.
