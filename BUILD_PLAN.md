# Cribl App Build Plan: As-Built + Config Linter

Sep 25, 2026 · @Steve Hunger

## How to use this plan

This doc is `BUILD_PLAN.md` in the repo root and start each Claude Code session with: "Read BUILD\_PLAN.md, then do Phase N. Stop at the phase gate and report." Everything below is written to Claude Code in the second person.

**Your role:** you are building a Cribl App, solo with Steve, for the CriblCon 2026 App Hackathon (Partner track). The app is a combined As-Built report generator and config linter for Cribl Stream on Cribl.Cloud. Working name: **Cribl Blueprint** (rename freely).

**Working rules for Claude Code:**

- Work one phase at a time. At each gate, stop, summarize what works, and list what doesn't.
- Never invent a Cribl API path, manifest field, or SDK call. If Phase 0 did not confirm it, look it up in Cribl's docs or ask Steve.
- Log every non-obvious choice in `DECISIONS.md` (one line each) and every library, template, or AI tool used in `CREDITS.md`. The README needs both.
- Keep the rule engine and report builder as pure TypeScript with no Cribl calls, so they can be unit-tested offline.
- Prefer finishing fewer features well over starting more. Completeness and Craft are 35 of 100 points.

## Hard constraints

The entry must be submitted complete by **1:30 pm CDT, Wednesday September 30, 2026**. Treat noon Tuesday as the real deadline for code, and Wednesday morning as buffer only. Source: [Cribl App Hackathon Official Rules](https://knowledge.cribl.io/p/hackathonterms).

| Rule | What it means for the build |
| --- | --- |
| Must be a Cribl App running inside the Cribl UI on Cribl.Cloud | No standalone scripts, packs, or dashboards as the deliverable |
| Installs cleanly from the package with no manual patching | Test a fresh install from the `.tgz` into a clean workspace before submitting |
| Meaningful use of a Cribl API, KV store, backend function, or proxy host | Cribl config APIs (read and write) plus KV for snapshots and suppressions |
| Public repo under github.com/Cribl-Community | Request org access now; it is outside your control |
| Apache-2.0 LICENSE file; all bundled code license-compatible | Check every dependency's license in Phase 1 |
| Versioned `.tgz` committed or attached to a release | Build script outputs `cribl-blueprint-X.Y.Z.tgz` |
| README covers what it does, install, Cribl APIs used, proxy hosts, setup | Write it as you go, not on the last day |
| No real customer data, PII, production hostnames, or live credentials | Demo config uses `example.com` hosts and Datagen sources only |
| Any secret in KV must use KV encryption | Blueprint stores no secrets; say so in the README |
| Build window opened September 14; AI tools must be credited | README names Claude Code and lists all third-party code |

## Product spec

Blueprint answers two questions for a Cribl admin or consultant: "what is actually deployed in this Worker Group?" and "what in it is broken or risky?" It has three tabs.

**Positioning (decided Sep 26):** [Config Quest](https://github.com/Cribl-Community/cc-di-configquest-for-cribl) already lints unreachable routes, orphan pipelines and dead-end destinations, read-only. Blueprint leads with what no Cribl-Community app does: an as-built handoff document, risk rules (L02, L05, L07, L08), suppressions with reasons, labelled snapshot diffs, and a confirmed fix-it that writes config. The README names Config Quest and explains the difference.

### Tab 1: As-Built

- Worker Group picker, then an inventory of Sources, Routes (in order, with filter, pipeline, output, and Final flag), Pipelines (function count, disabled functions), Destinations, and Packs.
- A flow diagram: Source → Route → Pipeline → Destination, generated from the inventory.
- Export the report as a Markdown file download. Clipboard writes are denied in the app iframe (Phase 0 probe), so there is no copy button.

### Tab 2: Linter

Each rule returns findings with severity (error, warning, info), the object affected, a one-line explanation, and a suggested fix. Build the v1 rules in this order and stop when time runs out. IDs are stable; the order is the build priority.

| ID | Rule | Severity | Priority |
| --- | --- | --- | --- |
| L01 | Route shadowing: an enabled Final route whose filter is `true`, `!false`, `1`, or empty sits above other enabled routes, so those routes never match | Error | Core (has fix-it) |
| L07 | Possible hardcoded secret in a function expression (token- or password-shaped string literal); show only a masked excerpt | Error | Core |
| L05 | Destination with `onBackpressure: "drop"` (in 4.20, `queue` is the persistent queue, so drop means no PQ) | Warning | Core |
| L02 | Catch-all route (filter as in L01) sends to devnull while other routes exist above it, so unmatched data is silently dropped | Warning | Core |
| L08 | Regex starting with an unanchored `.*`, a common performance cost on hot paths | Info | Core |
| L06 | Empty Pipeline, or one where every function is disabled | Info | Optional |
| L03 | Orphan Pipeline: not referenced by any Route, Source, QuickConnect connection, Destination, or pack | Warning | Optional (overlaps Config Quest) |
| L04 | Orphan Destination: not referenced by any Route, QuickConnect connection, or Output Router; skipped when any route uses an output expression | Warning | Optional (overlaps Config Quest) |

References for L03, L04 and the flow diagram come from one shared reference graph in `model/`, so QuickConnect (Source → Pipeline → Destination, bypassing Routes) appears in both.

Users can suppress a finding with a reason; suppressions live in KV so they persist.

### Tab 3: Snapshots

- "Take snapshot" saves the normalized inventory to KV with a timestamp and label.
- Pick any two snapshots and see a diff: added, removed, and changed objects, with field-level changes for Routes.
- This is the change-log story for handoffs and audits.

### Fix-it actions (stretch, Phase 4)

Offer a fix only for L01: move the shadowed routes above the catch-all. The preview shows the before/after route order and warns that moved non-Final routes will now also clone matching events. The confirmation names the group and routes affected. The write is `PATCH /m/{group}/routes/{id}` with the full table. Nothing is committed or deployed automatically; the result screen links to Cribl's commit UI. (The L06 fix-it was dropped: disabling a route changes where its data goes.)

### Out of scope

Multiple workspaces, Edge fleets, Search, scheduled snapshots, and editing anything beyond the two fix-its.

## Architecture

Blueprint is a frontend app that reads config through Cribl's REST API, analyzes it in pure TypeScript, and stores its own state in the KV store. Anything marked **verify** must be confirmed against Cribl's Apps documentation in Phase 0 before code depends on it.

```
src/
  api/        thin client over fetch(CRIBL_API_URL + path): list groups, fetch inputs/routes/pipelines/outputs/packs, write route order
  model/      normalize raw API JSON into one Inventory type
  report/     Inventory -> as-built view model, flow graph, Markdown export
  lint/       one file per rule (L01..L08) + runner; pure functions of Inventory
  diff/       Inventory x Inventory -> ChangeSet
  store/      KV wrapper: snapshots (chunked), suppressions, settings
  ui/         three tabs + shared components
test/fixtures/ sanitized sample Inventory JSON, one good and one deliberately bad
```

| Concern | Approach | Verify in Phase 0 |
| --- | --- | --- |
| App packaging | Follow Cribl's app template and manifest exactly | Manifest fields, build tooling, `.tgz` layout |
| Calling Cribl APIs | Use the app's in-UI session, never a stored token | How an app authenticates API calls and which scopes it gets |
| Config endpoints | `GET /master/groups`; per group `/m/{group}/routes`, `/pipelines`, `/system/inputs`, `/system/outputs`, `/packs` (confirmed in openapi.json 4.20.1); every path declared in `config/policies.yml` | How uncommitted vs deployed config is exposed (confirm from fixtures) |
| KV store | Keys use `/`, never `:`. `snapshot/{group}/{ts}/meta` + `snapshot/{group}/{ts}/chunk/{n}` (chunked below the size limit, meta written last), `suppress/{group}` (one JSON doc per group), `settings`. List with `POST /kvstore/keys {prefix}`. Shared per app per workspace; 1,000-key quota | Max value size and separator behavior (KV probe) |
| Backend function | Not needed for v1; delete the scaffold's `hello` endpoint. Use one only if large diffs freeze the UI | Answered: `config/backend.yml`, 30 s default timeout, 5 MB bundle |
| Proxy hosts | None; README states this | Nothing |
| Diagram rendering | A small SVG layout written in-app, or a bundled library with an Apache-compatible license | Whether any CDN is allowed; assume bundle everything |

Secrets: Blueprint stores no credentials, so KV encryption is not needed, and L07 findings must show only a masked excerpt of the suspected secret.

## Build phases

Six phases over five days, each ending in a gate Steve checks before the next session starts. If a phase runs long, cut from the bottom of the linter rule list or drop fix-its, never the install test or README.

| When | Phase | Gate |
| --- | --- | --- |
| Sat Sep 26 (slipped from Fri) | 0. Discovery spike | Every **verify** item answered in `DECISIONS.md` |
| Sat Sep 26 | 1. Skeleton that installs | Hello-world app installs from `.tgz` and lists Worker Groups |
| Sat Sep 26 – Sun Sep 27 | 2. Inventory and As-Built | As-Built tab renders the seeded demo group, flow diagram included |
| Sun Sep 27 | 3. Linter | Core rules (L01, L02, L05, L07, L08) pass unit tests and fire on the demo group |
| Mon Sep 28 | 4. Snapshots, suppressions, fix-its | Diff shows a route change; suppressions persist across reloads |
| Tue Sep 29 | 5. Polish, docs, package | Clean-workspace install passes; README complete; release tagged |
| Wed Sep 30, by 11:00 CDT | Submit | Checklist in the last section all ticked |

### Phase 0: Discovery spike

1. Read Cribl's published Apps documentation and any official app template or framework repo it points to.
2. Answer every **verify** row in the Architecture table and record each answer in `DECISIONS.md` with the doc link.
3. Pull each config endpoint through the app's dev-only probe page in Live Preview, then sanitize into `test/fixtures/` (raw dumps stay git-ignored in `test/fixtures/raw/`).
4. Report: anything that blocks the plan (for example, apps can't write config) and the proposed change.

### Phase 1: Skeleton that installs

1. Scaffold from the official template. Add `LICENSE` (Apache-2.0), `README.md` stub, `CREDITS.md`, `DECISIONS.md`.
2. Add `npm run package` to produce a versioned `.tgz`.
3. Implement `api/` for listing Worker Groups only, and show them in a picker.
4. Install the `.tgz` in the workspace and confirm it loads inside the Cribl UI.

### Phase 2: Inventory and As-Built

1. Write `model/` to normalize all five object types into one `Inventory` type, tested against the Phase 0 fixtures.
2. Build the As-Built tab: summary counts, per-type tables, ordered Routes table.
3. Build the flow diagram from the Inventory. Keep layout simple: four columns, left to right.
4. Add Markdown export.

### Phase 3: Linter

1. Write the rule runner and the core rules (L01, L07, L05, L02, L08) first, each with a passing and a failing fixture.
2. Build the Linter tab: findings grouped by severity, click-through to the affected object.
3. Add L06, then L03/L04, only if Phase 3 finishes before Sunday evening. The reference graph they need already exists from Phase 2.

### Phase 4: Snapshots, suppressions, fix-its

1. Implement `store/` against KV, then Take Snapshot and the snapshot list.
2. Implement `diff/` and the two-snapshot comparison view.
3. Add finding suppression with a reason, stored in KV.
4. Stretch: the L01 fix-it with preview and confirm.

### Phase 5: Polish, docs, package

1. Empty, loading, and error states on every tab. Test with a group that has zero Routes.
2. Finish the README (see the submission checklist) and add 2–3 screenshots from the demo workspace.
3. Bump to `1.0.0`, package, run the clean install test, tag a GitHub release with the `.tgz` attached.

## Test plan

Testing runs at three levels: offline unit tests on fixtures, a seeded demo Worker Group that trips every rule, and a clean-workspace install test before release.

### 1. Unit tests (every phase)

- Each lint rule has at least one fixture that should fire and one that should not. Run with `npm test`.
- `model/` is tested against the raw Phase 0 fixtures, so an API shape change fails loudly.
- `diff/` is tested with two hand-made Inventories: one route added, one removed, one filter changed.
- Fixtures must be sanitized: `example.com` hosts, fake IDs, no values copied from any customer.

### 2. Seeded demo Worker Group (build in Phase 2)

Create a Worker Group named `blueprint-demo` using only Datagen sources and devnull or dummy destinations. Seed it with these deliberate problems:

| Seeded problem | Should trigger |
| --- | --- |
| Route 2 of 5 is Final with filter `true` | L01 |
| Default route outputs to devnull | L02 |
| Pipeline `legacy_cleanup` not used anywhere | L03 |
| Destination `old_s3_archive` not referenced by any route | L04 |
| Destination `splunk_example` with backpressure behavior set to drop | L05 |
| One Datagen source using QuickConnect straight to a destination | Diagram shows the bypass; no false L03/L04 |
| Pipeline with all functions disabled | L06 |
| Eval function setting a field to a fake `token=FAKE...` literal | L07 |
| Regex Extract starting with `.*` | L08 |

Save the seed steps as `demo/SEED.md` (manual steps or an export of the group's config) so the demo can be rebuilt. Also keep one clean group with zero findings to prove the linter isn't noisy.

### 3. Manual checks at each gate

- [ ] App loads inside the Cribl UI without console errors
- [ ] Switching Worker Groups refreshes every tab
- [ ] Empty group, and a group with 50+ routes, both render
- [ ] Suppressions and snapshots survive a browser reload
- [ ] Fix-it preview matches what is actually written, and nothing deploys without confirmation

### 4. Clean install test (Phase 5, required)

1. Apps install per workspace, so delete Blueprint from the workspace first. That also deletes its KV data. A second workspace is better if one is available.
2. Install the exact `.tgz` from the GitHub release, following only the README.
3. Walk through the demo script end to end.
4. Any manual step you had to take goes into the README or gets fixed. Repeat until none remain.

## Demo script and submission

The demo runs about three minutes on `blueprint-demo` and should land one idea: Blueprint finds real problems a busy admin would miss, then documents the fix.

### Demo script

1. **Hook (20 s):** "You inherit a Cribl deployment. What is actually running, and what is broken?" Open Blueprint inside the Cribl UI.
2. **As-Built (40 s):** pick `blueprint-demo`, show the flow diagram, then export the Markdown report. "That's the as-built doc consultants usually write by hand."
3. **Take a snapshot (10 s):** label it "before".
4. **Linter (60 s):** show the error count. Open L01: route 2 swallows everything, so routes 3–5 never run. Show L07's masked fake token.
5. **Fix (30 s):** apply the L01 fix-it with preview and confirm. If fix-its were cut, make the change by hand in Routes instead.
6. **Diff (20 s):** take an "after" snapshot and show the route-order change in the diff.
7. **Close (10 s):** "Installs from one package, no credentials, Apache-2.0." One line on how it complements Config Quest.

Record a backup screen capture on Tuesday in case the live workspace misbehaves.

### Submission checklist

- [ ] Registered at [knowledge.cribl.io/events/187](https://knowledge.cribl.io/events/187)
- [ ] Access to the Cribl-Community GitHub org granted (request on day one)
- [ ] Public repo in Cribl-Community with the Apache-2.0 `LICENSE` file
- [ ] Versioned `.tgz` attached to a tagged GitHub release
- [ ] README: what Blueprint does, screenshots, install steps, setup steps
- [ ] README: Cribl APIs used, KV keys used, and a statement that no proxy hosts or secrets are used
- [ ] README: built during the window starting September 14, 2026
- [ ] README: AI tool disclosure (Claude Code) and third-party credits from `CREDITS.md`
- [ ] Dependency licenses checked for Apache-2.0 compatibility
- [ ] Repo scanned for customer names, real hostnames, and tokens (`git grep`, plus a secrets scanner)
- [ ] Clean install test passed on the released `.tgz`
- [ ] Submitted before 1:30 pm CDT, Wednesday September 30

