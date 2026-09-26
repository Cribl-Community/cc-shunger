# Credits

## AI tools

- **Claude Code** (Anthropic): used throughout the build window starting September 14, 2026, for research, planning, code, tests, and docs. Every change was reviewed by Steve Hunger.

## Scaffolding and platform

- [`@cribl/apps`](https://www.npmjs.com/package/@cribl/apps) 1.1.0 (Apache-2.0): app scaffold, dev server plugins, and `apps package`. Dev dependency only; not bundled.
- Capra design system: `@capra/core`, `@capra/icons`, `@capra/theme`, `@capra/dx-tokens-postcss-plugin` (© Cribl, Inc., [Cribl Developer Agreement](https://cribl.io/legal/packs-developer-agreement/)). Bundled into the app UI, as the Cribl Apps platform recommends.

## Runtime libraries (bundled)

- React, React DOM (MIT)
- React Router (MIT)

## Build and test tools (not bundled)

- Vite, @vitejs/plugin-react, TypeScript, Vitest, oxlint (MIT / Apache-2.0)

## Reference apps consulted (no code copied)

- [cc-di-configquest-for-cribl](https://github.com/Cribl-Community/cc-di-configquest-for-cribl): KV size and key-separator findings.
- [cc-cribl-power-tools](https://github.com/Cribl-Community/cc-cribl-power-tools): commit and deploy endpoint pattern.
- [weather](https://github.com/Cribl-Community/weather): README structure for the `@cribl/apps` 1.1.0 template.
