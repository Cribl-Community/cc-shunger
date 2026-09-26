# Decisions

One line per non-obvious choice. Sources: [Apps docs](https://docs.cribl.io/apps/) (v4.20), scaffold `AGENTS.md` (`@cribl/apps` 1.1.0), workspace `openapi.json` (4.20.1), and existing apps in [Cribl-Community](https://github.com/Cribl-Community).

## Phase 0 — verify items

| Item | Answer | Source |
| --- | --- | --- |
| App packaging | No separate manifest: metadata in `package.json` (`cribl.type: "app"`, `displayName`, `minLogStreamVersion`, `tags.product`), plus `config/{policies,proxies,backend,schedules}.yml`. Scaffolded with `npx @cribl/apps@latest create`; `npm run package` (`apps package`) builds the `.tgz` and bumps the patch version. | [builder-guide](https://docs.cribl.io/apps/builder-guide/), AGENTS.md |
| Install scope | Apps install per Workspace, not per Worker Group; install needs Org Admin; deleting an app deletes its KV data. Clean-install test = delete app, reinstall `.tgz`. | [admin-guide](https://docs.cribl.io/apps/admin-guide/) |
| API auth | Relative `fetch(window.CRIBL_API_URL + path)`; the iframe proxy injects auth. Calls run as the signed-in member, plus grants declared in `config/policies.yml`. No stored token. | AGENTS.md, [runtime-and-security](https://docs.cribl.io/apps/runtime-and-security/) |
| Config endpoints | Groups: `GET /master/groups`. Per group: `/m/{gid}/routes`, `/m/{gid}/pipelines`, `/m/{gid}/system/inputs`, `/m/{gid}/system/outputs`, `/m/{gid}/packs`. Route write: `PATCH /m/{gid}/routes/{id}` (full table). Commit: `POST /m/{gid}/version/commit`; deploy: `PATCH /master/groups/{gid}/deploy`. | openapi.json; commit/deploy pattern from cc-cribl-power-tools |
| Uncommitted vs deployed | Config GETs carry no commit or deploy marker. Blueprint reports the working config as returned and, in Phase 2, calls `GET /m/{gid}/version/status` to show a "has uncommitted changes" banner. Not blocking. | fixture: `test/fixtures/workspace-default.json` |
| KV API | GET/PUT/DELETE `CRIBL_API_URL + '/kvstore/<key>'`; list keys via `POST /kvstore/keys {prefix}`. 1,000 keys default quota. Shared per app per workspace (not per user). | AGENTS.md, builder-guide |
| KV limits | Probe (4.20.1, 2026-09-26): 100 KB PUT → 201, 128 KB → 413, so chunks are capped at 90 KB. `/` and `.` in keys work; `:` → 404. PUT with `application/json` stores `"[object Object]"`, so always send `JSON.stringify(v)` as `text/plain`. `POST /kvstore/keys` returns a plain `string[]`. In Live Preview the app ID is `__dev__cc-blueprint`, so dev KV data is separate from the installed app's. | `test/fixtures/raw/blueprint-kv-probe.json` (git-ignored) |
| Backend function | Not needed for v1. Frontend-only: delete `config/backend.yml` and `backend/` in Phase 1. | AGENTS.md |
| Proxy hosts | None; `config/proxies.yml` stays empty. | — |
| Diagram / CDN | No CSP docs; bundle everything. File downloads (Blob + `<a download>`) work (probe downloads succeeded). Clipboard is **denied** (`NotAllowedError`), so Markdown export is download-only. No localStorage/cookies. | builder-guide; KV probe |

## Product

- Positioning pivot (Steve, 2026-09-26): cc-di-configquest-for-cribl already lints unreachable routes, orphan pipelines and dead-end destinations. Blueprint leads with the as-built handoff document, risk rules no other app has (L02, L05, L07, L08), suppressions, labelled snapshot diffs, and the L01 fix-it. L03/L04 are optional and needed mainly for the flow diagram.
- L05 simplified: in the 4.20 schema `onBackpressure` is `block | drop | queue`, and `queue` *is* the persistent queue, so L05 fires on `onBackpressure === "drop"`.
- References counted for orphan/diagram purposes: Route `pipeline`/`output`, Source `pipeline`, Source QuickConnect `connections[].pipeline/output` (bypasses Routes), Destination `pipeline`, Output Router rules, and pack references (`pack:<id>`). Routes with `enableOutputExpression` make destination reachability unknowable; such outputs are never flagged orphan.
- L01 "equivalent to true": `true`, `!false`, `1`, empty/whitespace filter. Nothing cleverer.

## API shapes (from fixture)

- Every list endpoint returns `{ items, count }`. `/routes` returns one table: `items[0] = { id: "default", routes: [...], groups: {}, comments }`; route fields `id, name, filter, final, pipeline, output, disabled, groupId?`.
- `/pipelines` also lists packs as pseudo-pipelines `pack:<packId>` with no functions. They are references, not pipelines: exempt from L03/L06 and drawn as packs.
- The built-in `passthru` pipeline is intentionally empty: exempt from L06.
- The `default` destination is an alias: `{ type: "default", defaultId: "devnull" }`. Resolve it before L02/L04 and in the diagram. In the lab workspace the Default route resolves to devnull, which is a real L02 hit.
- Function shape: `{ id, filter, conf, description?, disabled?, final? }`; `id` is the function type (e.g. `eval`).
- A route can point at a destination that doesn't exist (lab has `output: "false"`). A cheap "dangling reference" rule is possible, but Config Quest already has `dangling-route`; not planned.
- No QuickConnect `connections` in the lab workspace; the demo group must seed one to test that path.

## Tooling

- Worker Groups come from `GET /master/groups?product=stream&fields=git.localChanges`. The same call returns the uncommitted-change count for the banner, so `/version/status` isn't needed.
- Groups are filtered to `type === "stream"`, or `!isFleet && !isSearch` on older Leaders. Edge and Search are out of scope.
- `config/policies.yml` declares only the GET paths the app calls. `/system/info` was removed after Phase 0.
- **License question:** Capra (`@capra/*`) is bundled into the UI but is under the proprietary Cribl Developer Agreement, not an OSI license. AGENTS.md mandates Capra, and other Apache-2.0 Cribl-Community apps (e.g. cc-pixel-open, cc-visicore-spl-to-kql) bundle it too. Steve to confirm with hackathon organizers; the fallback is a plain-React UI.
- Production bundle is ~1 MB (Capra plus illustrations). Acceptable; the archive limit is 100 MB.
- `build/` (the packaged `.tgz`) is git-ignored; releases attach it.

- Fixtures: `node scripts/sanitize-fixtures.mjs <raw> <out>` keeps only the 5 config endpoints, redacts secret-named fields (a plaintext HEC token was present), rewrites IPs/hostnames, and refuses to write if any IP, non-Cribl hostname, or UUID survives.

- Phase 0 fixtures are pulled through the app itself (`src/dev/Phase0Probe.tsx`) in Live Preview, not with API credentials. Probe page is removed before 1.0.0.
- In-app confirmations use an inline two-step button, not `window.confirm`, since the iframe sandbox attributes are undocumented.
- `openapi.json` (9.9 MB, workspace-generated) is git-ignored; regenerate via the scaffold command.
- `npm audit`: 2 moderate advisories in esbuild ≤0.24 nested under `@cribl/apps` (dev-server only, no upstream fix). Accepted.
