# idlefantasy-dex

Track your completion in **[Idle Fantasy](https://github.com/tristinbaker/IdleFantasy)** —
quests, guilds, drops, equipment, and prestige — and see how far every goal is from done.
Projections (time to completion, items per session, XP rates) come later; see the roadmap.

> **Status:** v1 spec is settled (`.scratch/v1-spec/spec.md`); the app is being built.
> Contribution guidelines and "good first issues" land alongside it.

## Why

Idle Fantasy is a deep, offline idle RPG (23 skills, 29 dungeons, 189 quests). Completionist
players juggle a lot of "how long until X" and "what should I train next" math by hand. This
is a companion tool to do that math from the game's own data.

## What it is

- A **mobile-only PWA**, offline-first — it reads your own Idle Fantasy save export, no account, no server.
- Compares your progress against a vendored snapshot of the game's data.
- Shows how far each completion goal is from done, measured against the whole game.

## Roadmap

**v1 — the Completion dashboard**

- Load a save (file upload, or point it at the game's backup folder).
- Five goals + an overall roll-up: Quests, Guilds, Raid boss drops, Armoury, Levels & Prestige.
- Per-goal drill-down showing what's still left.
- No projections, no simulators — just completion.

**v2 — broader coverage + first projections**

- More goals: Monsters, Pets, Craftables, and others.
- Multiple save slots; user-defined goals.
- Projections: time to completion, expected items per session, what to train next.

**v3 — simulators**

- Per-skill simulators and combat/dungeon simulators.

## License

idleFantasy-dex is licensed under the **GNU General Public License v3.0**. See
[LICENSE](./LICENSE).

Idle Fantasy itself is GPL-3.0, and this project matches it deliberately: it removes any
question about whether a companion app built on the game's data is a derivative work, and
keeps everything in the same license family as the project it depends on.

### Game data

This repository vendors a snapshot of Idle Fantasy's static game data — the JSON files under
`app/src/main/assets/data/` in
[tristinbaker/IdleFantasy](https://github.com/tristinbaker/IdleFantasy) — pinned to a
specific game version and refreshed by a checked-in sync script. That data remains the work
of the Idle Fantasy authors and is redistributed here under GPL-3.0, the same terms it is
published under. Vendored files are kept unmodified so they stay traceable to their source.

This project is an independent companion app. It is not affiliated with or endorsed by the
Idle Fantasy maintainers.
