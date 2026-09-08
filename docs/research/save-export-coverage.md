# Does the Save Export contain what the Ledger needs?

Research for [#2](https://github.com/Michaelomh/idleFantasy-dex/issues/2).

Source read: `tristinbaker/IdleFantasy` at commit `c5947e00`, `versionName = "1.14.11"`
(`app/build.gradle.kts:19`). All paths below are relative to that checkout.
Every claim cites the Kotlin or JSON that owns it.

## Answer in one line

All four Ledger categories are computable, because the Save Export carries two
ever-obtained records that the ticket did not know about: `PlayerFlags.enemy_kills` and
`PlayerFlags.seen_item_keys`, both serialised inside the export's opaque `flags` string.
`inventory` is not the only evidence available.

| Ledger category | Verdict | Evidence in the Save Export |
| --- | --- | --- |
| Quests not completed | **Computable exactly** | `questProgress[].completed` |
| Monsters never killed | **Computable exactly** for saves from v1.8.11; approximate for older | `flags.enemy_kills` |
| Boss items never obtained | **Computable as a lower bound**; exact for saves from v1.9.4 | `flags.seen_item_keys` ∪ `inventory` ∪ `equipped` ∪ `pets` |
| Items never obtained | **Player State side exact; Game Data side has no catalogue** | same as above; the denominator must be assembled by hand |

## What the export actually contains

`PlayerExport` (`app/src/main/kotlin/com/fantasyidler/data/model/PlayerModels.kt:565-583`)
is assembled in `PlayerRepository.exportSave`
(`app/src/main/kotlin/com/fantasyidler/repository/PlayerRepository.kt:1434-1450`). Five of
its fields — `skillLevels`, `skillXp`, `inventory`, `equipped`, `flags`, `pets` — are
copied verbatim as the raw JSON strings stored in the `Player` Room row. They are strings,
not structured JSON, so a reader has to parse them a second time.

The decisive one is `flags`. It is a serialised `PlayerFlags`
(`PlayerModels.kt:11-311`), a ~150-field record that is far more than settings. It carries
both of the ever-obtained ledgers:

```kotlin
/** Lifetime kill count per enemy/boss key; absent = never encountered. */
@SerialName("enemy_kills") val enemyKills: Map<String, Int> = emptyMap(),
```
`PlayerModels.kt:221-222`

```kotlin
/** All equipment item keys ever obtained; used by the Armory to show items even after they are sold. */
@SerialName("seen_item_keys") val seenItemKeys: Set<String> = emptySet(),
```
`PlayerModels.kt:237-238`

The doc comment on `seen_item_keys` understates it. The set is fed by
`PlayerFlags.plusSeen` (`PlayerRepository.kt:43-44`), which is applied on every
acquisition path, not just equipment: `addItemUnlocked` (`:1710`), `addItemsUnlocked`
(`:1728`), `buyItem` (`:888`), `applyMultiSkillResults` (`:256` and `:1005`, which is how
all session loot lands), and two reward grants (`:1654`, `:1693`). Session loot,
gathered resources, crafted output and shop purchases all register.

The Room DB holds seven entities (`app/src/main/kotlin/com/fantasyidler/data/db/AppDatabase.kt:58-70`).
Three of them never reach the export: `GlobalState` (hole depth, onboarding flag, active
save slot — `app/src/main/kotlin/com/fantasyidler/data/model/GlobalState.kt:9-22`),
`ArenaRecord` (per-fight combat logs —
`app/src/main/kotlin/com/fantasyidler/data/model/ArenaRecord.kt:9-24`), and `CustomTheme`.
None of them hold anything the Ledger wants.

## Monsters never killed — computable

**Game Data side.** The monster universe is two files sharing one key namespace:
`app/src/main/assets/data/enemies.json` (73 entries) and
`app/src/main/assets/data/raid_bosses.json` (11 entries — despite the filename this is
every boss, only 3 of which have `raid: true`). They are loaded as
`GameDataRepository.enemies` (`GameDataRepository.kt:82-84`) and
`GameDataRepository.bosses` (`GameDataRepository.kt:175-177`). The shared namespace is
deliberate and test-enforced: `app/src/test/kotlin/com/fantasyidler/data/BossEnemyKeyCollisionTest.kt:24-30`
asserts no key appears in both files, precisely because "bosses and dungeon enemies share
the `PlayerFlags.enemyKills` namespace" (same file, lines 9-12).

**Player State side.** `flags.enemy_kills`. The game's own Bestiary screen computes the
exact thing the Ledger wants, from exactly this field:
`app/src/main/kotlin/com/fantasyidler/ui/viewmodel/BestiaryViewModel.kt:55-77`, with
`val encountered: Boolean get() = killCount > 0` at `:31`. Our Ledger is that predicate
inverted, and we can reproduce it byte-for-byte from the Save Export.

**Ledger** = `(enemies.keys ∪ bosses.keys) − enemy_kills.keys`.

Caveats, in descending order of how much they matter:

1. **`enemy_kills` shipped in v1.8.11** (`git log -S'enemy_kills'` on `PlayerModels.kt`
   → commit `94d0f7de`, "v1.8.11"). Unlike `seen_item_keys`, there is **no backfill
   function** — nothing equivalent to `migrateSeenItems`. A character that killed
   everything before v1.8.11 and stopped playing exports an empty `enemy_kills`, and the
   Ledger will wrongly report every monster as never killed. Current version is 1.14.11,
   so most live saves are fine, but the failure is silent.
2. **Kills from a run the player lost are not recorded.** The write happens in
   `PlayerRepository.recordDailyKills` (`:1579-1591`), fed from `HomeViewModel`'s
   accumulator. For dungeons the accumulation sits inside `if (!died)`
   (`app/src/main/kotlin/com/fantasyidler/ui/viewmodel/HomeViewModel.kt:939`, guarded at
   `:930`); for bosses inside `if (won)` (`HomeViewModel.kt:868`, guarded at `:857`).
   For the Ledger this is harmless in the direction that matters — a defeat is not a kill —
   but lifetime kill *counts* undercount, so do not present them as a stat.
3. **Arena opponents and thieving NPCs are not enemies** and never enter `enemy_kills`.
   Keep them out of the Ledger's denominator.

## Quests not completed — computable exactly

`questProgress: List<QuestProgress>` is the only structured, non-string collection in the
export that the Ledger needs. `QuestProgress`
(`app/src/main/kotlin/com/fantasyidler/data/model/QuestProgress.kt:10-20`) is
`(questId, progress, completed, completedAt)`. It is written straight from the Room table
at export (`PlayerRepository.kt:1444`, `questProgressDao.getAllProgress()`).

**Ledger** = `quests.keys − {row.questId | row.completed}`.

Two things to get right:

1. **The `quest_progress` table is shared between two quest catalogues.** Main quests come
   from `app/src/main/assets/data/quests.json` (189 entries — matching the "all 189 quests"
   example in `CONTEXT.md`), loaded at `GameDataRepository.kt:128-130`. Guild quests come
   from `app/src/main/assets/data/guild_quests.json` (200 entries), loaded at
   `GameDataRepository.kt:139-141`, and `GuildRepository` writes their progress into the
   same DAO (`app/src/main/kotlin/com/fantasyidler/repository/GuildRepository.kt:273`,
   `:286`, `:347`). So `questProgress` in the export is a union of both tracks.
2. **Always intersect against the catalogue, never trust the row set.** The game does this
   itself: `AchievementsViewModel.kt:61` counts
   `questProgress.count { it.completed && gameData.quests.keys.contains(it.questId) }`.
   That guard exists because rows survive for quest ids that later left the data files. It
   also implies a rolled-back guild quest can hold `progress > 0, completed = false`
   (`GuildRepository.kt:363-365` resets `progress` on tier-up), so "started" is not a
   durable signal — only `completed` is.

Missing rows mean never started. Absence is unambiguous here, which is why this category is
the cleanest of the four.

## Boss items never obtained — computable as a lower bound

**Game Data side.** Per boss, `BossData`
(`app/src/main/kotlin/com/fantasyidler/data/json/BossData.kt:7-28`) gives three drop
sources: `common_loot.items` (`:18`, a `Map<String, BossLootRange>`), `rare_drops` (`:19`,
`List<BossRareDrop>` of `item` + `chance`), and `pet` (`:20`, a `BossPet` with its own
`id`). That is the full boss drop table, enumerable straight from `raid_bosses.json`.

**Player State side.** Union four things from the export:
`flags.seen_item_keys` ∪ `inventory.keys` ∪ non-null `equipped.values` ∪ `pets[].id`.

The union is what the game's Armory does:

```kotlin
owned = (inventory[key] ?: 0) > 0 || key in equippedValues || key in flags.seenItemKeys,
```
`app/src/main/kotlin/com/fantasyidler/ui/viewmodel/ArmoryViewModel.kt:104`

Pets need the fourth term because they never enter `inventory`. `pets` is a
`List<OwnedPet>` written only by append: `addPetIfNewUnlocked`
(`PlayerRepository.kt:1402-1410`) returns early `if (pets.any { it.id == petId })` and
otherwise adds; `updatePets` (`:872-875`) is the only other writer. Nothing removes a pet, so `pets` is already a
perfect ever-obtained record — no lower bound about it.

**Ledger** = `(all boss drop item keys) − (that union)`.

Why it is a lower bound rather than exact:

1. **`seen_item_keys` shipped in v1.9.4** (`git log -S'seen_item_keys'` on
   `PlayerModels.kt` → commit `ae27e952`, "v1.9.4: … fix Armory only counting currently
   owned items by persisting a seen-item set across all acquisition paths").
2. **The backfill is deliberately shallow and lazily triggered.**
   `PlayerRepository.migrateSeenItems` (`:1735-1756`) seeds the set from *current*
   inventory + equipped + four starter items. It cannot recover anything already sold. And
   it is called from exactly one place — `ArmoryViewModel`'s `init` block
   (`ArmoryViewModel.kt:63`) — so it only runs when the player opens the Armory screen.
3. **The backfill can be pre-empted into a no-op.** If a v1.9.4+ player acquires anything
   before first opening the Armory, `seenItemKeys` is already non-empty, and
   `migrateSeenItems` takes the early-return branch at `:1740-1747` that only tops up
   starter items. It never seeds from inventory after that. In practice the union with
   `inventory` covers the still-held case, so the true residual loss is: *items obtained
   before v1.9.4 and disposed of after upgrading, without an Armory visit in between.*

So a "never obtained" verdict from the Ledger may be wrong for a long-lived pre-1.9.4
character. It is never wrong in the other direction: anything the Ledger marks obtained
genuinely was obtained. Presenting the Ledger as "not yet obtained" rather than "never
obtained" is honest and costs nothing.

Prestige does not threaten any of this. `prestigeSkill` (`PlayerRepository.kt:1114-1163`)
resets one skill's level and XP and re-equips from inventory; it does not touch
`seenItemKeys`, `enemyKills`, `pets`, or `inventory` contents. Only
`resetProgression` (`:1525-1530`) → `createDefaultPlayer` (`:1760-1811`) wipes them, and
that is a new character by definition — `carrySettingsFrom` copies 21 UI preferences and
nothing else (`:1784-1802`).

## Items never obtained — Player State fine, Game Data missing

The Player State mechanism is identical to boss items and works just as well. The problem
is the other side of the subtraction: **Idle Fantasy has no canonical item catalogue.**
There is no `items` map in `GameDataRepository` covering every item key. What exists:

| Source | File | Count |
| --- | --- | --- |
| `equipment` (`GameDataRepository.kt:195-197`) | `equipment.json` | 358 |
| `items` (misc) | `items.json` | 15 |
| `pets` (`:169-171`) | `pets.json` | 25 |
| ores, trees, gems, fish, logs, crops, bones, runes | 8 separate files | — |
| recipes | `recipes/{smithing,cooking,fletching,crafting,herblore,construction}.json` | — |
| carnival prizes, marketplace, house tiles, seasonal events | 4 more files | — |

Worse, some item keys are *derived at runtime and exist in no file*:

- Enhanced potions are synthesised as `"enhanced_$key"` in
  `GameDataRepository.potionEffects` (`:241-248`).
- Skill capes are synthesised as `"${skill}_cape"` in
  `capeKeyForSkill` (`PlayerRepository.kt:38-41`).

Any "all items" Ledger therefore rests on a denominator we assemble and maintain by hand,
which will drift every time the game ships content. That is a Completion figure that is
quietly wrong rather than visibly incomplete — the worst failure mode for this app.

**Recommendation:** scope the v1 items Ledger to `equipment.json` alone. It is one file,
358 keys, exactly enumerable, and it mirrors a screen the game already ships (the Armory,
`ArmoryViewModel.kt:129-130` reports `totalOwned` / `totalCount` over precisely this set).
Call the Goal "all equipment" and it is honest. A general "every item in the game" Goal
should wait for a real catalogue.

## The `sig` field

`sig` is HMAC-SHA256, hex-encoded, over seven fields joined by `\n`:

```kotlin
val canonical = listOf(
    export.skillLevels, export.skillXp, export.inventory,
    export.equipped, export.flags, export.pets, export.coins.toString(),
).joinToString("\n")
```
`PlayerRepository.saveSignature`, `:1495-1503`

**It does not affect reading, and we should ignore it.** Three reasons, all in the source:

1. The key is a hardcoded string literal in the open-source app:
   `private const val SAVE_SIG_KEY = "ekEhdMIDo9B63HQSU80U7hvuqVd1HYcciv5Na5d7gEKdaudR4Voa8jkF"`
   (`PlayerRepository.kt:1297`). The field's own doc comment calls it "Deterrence only —
   the key ships in this open-source app" (`PlayerModels.kt:573-577`).
2. The game only checks it when the save claims ironman:
   `if (importedFlags?.ironman == true && export.sig != saveSignature(export))`
   (`PlayerRepository.kt:1464`). A mismatch does not reject the import — it strips ironman
   status and imports anyway (`:1465-1467`).
3. It covers only 7 of the 12 fields. `questProgress`, `farmingPatches`, `sessions`,
   `exported_at` and `sig` itself are outside the canonical form — which is intentional, so
   that later schema additions don't invalidate old signatures (`:1491-1494`).

We are a read-only consumer. Verifying `sig` would buy us nothing and would tie us to a key
that could rotate. If we ever write a Save Export back, ironman saves would silently demote,
which is a strong argument for staying read-only.

## The missing schema version

`PlayerExport` has **no version field**. The nearest thing is `exported_at`
(`PlayerModels.kt:570`), a wall-clock epoch that tells us when, not what.

The serializer config makes this partly survivable. `AppModule`
(`app/src/main/kotlin/com/fantasyidler/di/AppModule.kt:25-27`) sets
`ignoreUnknownKeys = true` and, critically, **`encodeDefaults = true`**. Because defaults
are encoded, any version that has a field always writes it. So *absence* of a key is real
evidence of an old export:

- no `enemy_kills` in `flags` ⇒ export predates v1.8.11
- no `seen_item_keys` in `flags` ⇒ export predates v1.9.4

That gets us a coarse floor. What it cannot do is disambiguate the case that actually
matters: **`"enemy_kills": {}` means either "brand-new character" or "old character whose
history was never recorded"**, and the two demand opposite treatment — one is a real 0%
Completion, the other is a Ledger we must refuse to show. There is no field that separates
them.

Two partial signals exist, neither conclusive:

- `flags.character_created_at` (`PlayerModels.kt:189-192`) is 0 for characters predating
  the field, and is back-filled from the oldest quest completion by
  `ensureCharacterCreatedAt` (`PlayerRepository.kt:1818-1823`), itself only called from
  `HomeViewModel.kt:261`. A creation timestamp older than the v1.8.11 release date is
  reasonable evidence that `enemy_kills` is untrustworthy.
- `flags.last_seen_version_code` (`PlayerModels.kt:75`) is the app version code the
  player last saw a What's New dialog for. It is set to `BuildConfig.VERSION_CODE` for
  brand-new saves (`PlayerRepository.kt:1778`), so it is a lower bound on the version that
  wrote the export — the closest thing to a schema version the format has.

**Recommendation:** treat `last_seen_version_code` as the de facto schema version, and gate
the monsters and items Ledgers on it. Where the export is too old to trust, say so in the
UI rather than rendering a Completion that is silently wrong.

## Consequences for v1 scope

1. **Nothing needs to be cut for lack of data.** The ticket's premise — that `inventory`
   is the only obtained-record — is wrong; `flags` carries two lifetime ledgers. All four
   categories can ship.
2. **Cut the "all items" Ledger anyway, on Game Data grounds.** Ship "all equipment"
   (358 keys, one file) instead. This is the one real scope reduction.
3. **The `flags` string is not optional plumbing — it is the second most important field
   in the export.** Whatever reads the Save Export must parse `flags` as structured JSON,
   not carry it as an opaque blob.
4. **Add a trust gate keyed on `last_seen_version_code`** before the monsters and items
   Ledgers render. Old exports must degrade loudly.
5. **Ignore `sig` entirely, and stay read-only.**
