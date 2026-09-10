# Vendored Game Data — third-party, do not edit

These JSON files are a pinned snapshot of Idle Fantasy's static game data, copied
**unmodified** from [tristinbaker/IdleFantasy](https://github.com/tristinbaker/IdleFantasy)
(`app/src/main/assets/data/`) and redistributed under GPL-3.0, the same terms the game
publishes them under.

They live in `public/` so Vite serves and ships them byte-for-byte with no copy step.
The app fetches them lazily at runtime; they are never bundled and never block first paint.

## Pinned version

| | |
| --- | --- |
| Game version | 1.14.11 (`version_code` 149002) |
| Upstream commit | `c5947e00acdd66d8e99f5d8f878d17ed6aeb6aca` |

`manifest.json` is the source of truth: it records the version, the upstream commit, and a
sha256 for every file.

## Refreshing

Run `pnpm sync-game-data --source <local IdleFantasy checkout>` by hand, then review the
diff before committing. `pnpm verify-game-data` re-hashes these files against the manifest
(no checkout, no network) and is safe to run in CI. Tooling may *report* drift; it must
never update this snapshot automatically (see `.scratch/v1-spec/spec.md` §5).
