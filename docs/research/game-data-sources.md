# Game Data sources per Ledger category

Research for [#3](https://github.com/Michaelomh/idleFantasy-dex/issues/3).

All paths are relative to the Idle Fantasy checkout (`tristinbaker/IdleFantasy`, GPL-3.0).
Game Data lives in `app/src/main/assets/data/`; display strings live in
`app/src/main/res/values/strings*.xml`. Line numbers are from the checkout read on
2026-09-09.

Everything below was read from the actual files. Where a claim is about behaviour rather
than shape, it cites the Kotlin that consumes the data, because several JSON fields are
present but never read.

---

## 1. Ledger category to source file

| Ledger category | Source of truth | Key structure | Count |
| --- | --- | --- | --- |
| Monsters | `data/enemies.json` | object keyed by enemy key (`giant_rat`) | 73 |
| Quests | `data/quests.json` | object keyed by quest id (`mining_1`) | 189 |
| Boss drops | `data/raid_bosses.json` | object keyed by boss id (`king_black_dragon`) | 11 |
| Items (equippable) | `data/equipment.json` | object keyed by item key (`bronze_dagger`) | 358 |
| Items (craftable) | `data/recipes/*.json` | object keyed by output item key | 277 total |
| Pets | `data/pets.json` + `raid_bosses[].pet` | object keyed by pet id | 25 |
| Dungeons | `data/dungeons/*.json` | one file per dungeon | 29 |
| Expeditions (skilling dungeons) | `data/skilling_dungeons/*.json` | one file per expedition | 10 |
| Agility courses | `data/agility_courses.json` | object keyed by course key | 15 |
| Spells | `data/spells.json` | object keyed by spell key | 32 |
| Crops | `data/crops.json` | object keyed by crop id | 17 |
| Thieving NPCs | `data/thieving_npcs.json` | **array**, join on `key` | 10 |
| Slayer tasks | `data/slayer_tasks.json` | object keyed by enemy key | 23 |
| Guild quests | `data/guild_quests.json` | object keyed by quest id | 200 |
| Guild dailies | `data/guild_daily_quests.json` | **array**, join on `id` | 439 |
| Daily quests | `data/daily_quests.json` | **array**, join on `id` | 24 |
| Weekly quests | `data/weekly_quests.json` | **array**, join on `id` | 30 |
| Carnival prizes | `data/carnival_prizes.json` | object keyed by prize key | 6 |
| Mercenaries | `data/mercenaries.json` | **array**, join on `id` | 12 |
| Shop stock | `data/marketplace.json` | category → `items` → item key | 49 items in 5 categories |
| House furnishings | `data/house_tiles.json` (`items`) | object keyed by furnishing key | 123 |
| Town buildings | `data/buildings.json` | object keyed by building key, `tiers` array | 9 |
| Prestige nodes | `data/prestige_paths.json` | **array** of `{skill, paths}` | 23 skills |
| Seasonal events | `data/seasonal_events.json` | object keyed by event id | 2 |

Container shape is inconsistent — some files are objects keyed by id, some are arrays with
the id inside each element. The app normalises the arrays on load, e.g.
`GameDataRepository.kt:236` does `asset<List<ThievingNpcData>>(...).associateBy { it.key }`
and `GameDataRepository.kt:344` does the same for `prestige_paths.json` on `.skill`. A
loader for the companion app needs the same per-file normalisation table; there is no rule
that predicts which shape a file uses.

### Category detail

**Monsters — `enemies.json`.** Every entry has the same key union:
`name, display_name, hp, combat_stats, defensive_stats, xp_drops, drop_table, always_drops`
(plus optional `tags`). `xp_drops` is a map, but in practice only `combat` is populated and
`CombatSimulator.kt:238` reads exactly `enemy.xpDrops["combat"]`. All 73 enemies are
reachable: the union of `enemy_spawns[].enemy` across the 29 dungeon files covers all 73
with none left over, so "monsters seen" can be derived purely from dungeon runs.

**Quests — `quests.json`.** 189 entries, matching the "all 189 quests" Goal named in
`CONTEXT.md`. Shape:

```json
"mining_1": {
  "id": "mining_1", "name": "Mining I", "skill": "mining", "tier": 1,
  "requires_previous": null, "type": "gather", "target": "copper_ore",
  "amount": 500, "description": "Mine 500 Copper Ore",
  "rewards": { "coins": 1000, "xp": 2000, "items": { "iron_ore": 100 } }
}
```

`requires_previous` is a self-referencing quest id or `null`, so the chain is a forest, not a
flat list. There are 18 distinct `type` values; the largest are `craft` (50), `kill_enemy`
(24), `boss` (20), `gather` (12), `kill` (12), `dungeon` (12). **`target` is polymorphic and
its namespace is decided by `type`** — an item key for `gather`/`craft`/`collect`, an enemy
key for `kill_enemy`, a boss id for `boss`, a dungeon key for `dungeon*`, a building key for
`upgrade_building`, a thieving NPC key for `pickpocket`. Any Ledger join on `target` has to
switch on `type` first. `rewards` always has `coins` and `xp`; `items` is present on 170 of
189.

`daily_quests.json` and `weekly_quests.json` use the same `type`/`target`/`amount` idiom but
carry **no `rewards` block at all** — they have `level_required` instead. `guild_quests.json`
and `guild_daily_quests.json` add `guild`, `reputation`, and `xp_skill` (which skill the
reward XP lands in), and guild dailies band by `guild_level_min`/`guild_level_max` rather
than a single required level.

**Boss drops — `raid_bosses.json`.** Three separate loot channels per boss, all different
shapes:

```json
"common_loot": { "coins_min": 10000, "coins_max": 20000,
                 "items": { "dragon_bone": {"min":30,"max":50}, ... } },
"rare_drops":  [ {"item":"dragon_longsword","chance":0.005,"comment":"1/200"}, ... ],
"pet":         {"id":"dragon_whelp","chance":0.01,"comment":"1/100 per kill"}
```

`common_loot` is guaranteed on a win, rolled uniformly in `[min, max]`
(`CombatSimulator.kt:731-735`). `rare_drops` and `pet` are independent per-kill rolls
(`CombatSimulator.kt:736-740`). On a loss the player gets no loot and 10% XP
(`CombatSimulator.kt:743-745`). The `comment` field is human prose that restates `chance`;
do not parse it — treat `chance` as authoritative.

**Items.** There is no single item master file. `equipment.json` (358 entries) is the source
of truth for anything equippable; the recipe files are the source of truth for anything
craftable; consumables and raw materials only exist as string keys inside drop tables. See
§4.

⚠️ `data/items.json` looks like an item index (category → array of item keys) but it is
**dead data**: a repo-wide grep for `items.json` outside the file itself returns nothing —
neither the Kotlin app nor `wiki/src` loads it. Do not use it as an item registry; it is
stale and incomplete relative to `equipment.json` (`weapons` lists 36 keys against 86
weapon-slot entries in `equipment.json`).

⚠️ `data/xp_table.json` is likewise unreferenced. The app computes the table from a formula
at `simulator/XpTable.kt:26-33`:
`XP(n) = floor((1/4) · Σ_{k=1}^{n-1} floor(k + 300·2^(k/7)))`. I verified the 99 rows in
`xp_table.json` reproduce that formula exactly, so either source works, but the formula is
30 lines of code against a 1.8 KB asset — implement the formula and skip the file.

---

## 2. Drop rates

Drop rates are scattered across six shapes. They are all probabilities in `[0,1]`, never
percentages and never `1/N` strings.

| Where | Shape | Semantics |
| --- | --- | --- |
| `enemies.json` → `drop_table[]` | `{item, chance, quantity_min, quantity_max}` | independent roll **per kill**; quantity uniform in the range |
| `enemies.json` → `always_drops[]` | `{item, quantity}` | guaranteed per kill, no roll |
| `dungeons/*.json` → `rare_drops[]` | `{item, chance}` | **once per completed Session**, not per kill |
| `raid_bosses.json` → `rare_drops[]` / `pet` | `{item, chance}` / `{id, chance}` | per kill, on a win only |
| `skills/*.json` and `skilling_dungeons/*.json` → `drop_tables` | `{"<level>": [{item, chance}]}` | independent roll per entry, per minute-frame |
| `thieving_npcs.json` → `loot_table[]` | `{item, chance}` | per pickpocket attempt |
| `gems.json` → `drop_rate` | float per gem | independent roll **per ore mined**, one roll per gem type |

Three semantics worth pinning down, because they are easy to get wrong:

1. **The entries in a `drop_table` are not mutually exclusive and do not sum to 1.** Each is
   its own Bernoulli trial. `CombatSimulator.kt:231-237` and `SkillSimulator.kt:278-285`
   both loop the whole table and roll each entry independently, so a single kill or frame
   can yield several items or none.

2. **`drop_tables` keys are level thresholds, not levels.** They are string-encoded
   minimum levels (`"1"`, `"5"`, `"10"`, `"20"`, `"30"`, `"40"`...). The lookup is "highest
   key ≤ current level", implemented at `SkillSimulator.kt:430-435` (`getTierData`). The
   same tiering applies to `xp_ranges`. Note the level used is the level **before** that
   frame's XP is added (`SkillSimulator.kt:268-270`), so a Projection that levels the player up
   mid-Session must re-tier on the previous frame's level.

3. **Dungeon rare drops are per-Session, not per-kill.** `CombatSimulator.kt:331-341` rolls
   `dungeon.rareDrops` exactly once, after all 60 frames, and only if the player did not
   die. A Projection that multiplies `chance` by kills will be wildly wrong.

⚠️ `dungeons/*.json` has an `encounter_rate` field (deserialised at `DungeonData.kt:12`) that
**nothing reads** — a grep for `.encounterRate` finds no read sites; the only uses are two
hardcoded `encounterRate = 0.65` literals constructing synthetic tower dungeons
(`TowerViewModel.kt:238`, `QueuedSessionStarter.kt:1143`). Combat is continuous, not
encounter-gated. Ignore the field.

⚠️ Pet drop rates in `pets.json` are prose, not data. `"source": "Mining (6% chance per
session)"` is a description string. The real number is in code:
`QueuedSessionStarter.kt:1074-1075` returns `1.0/1000.0` per frame for any skill that has a
pet, uniformly. Over 60 frames that is `1 - 0.999^60 ≈ 5.8%`, which is where the "6%" prose
comes from. Mercantile uses the same 1/1000 (`MercantileViewModel.kt:197`). If the app
projects pet acquisition, hardcode 1/1000 per frame and treat `pets.json.source` as display
copy only.

---

## 3. Action timings and XP per action

### The Session model

A Session is 60 frames, one frame nominally one minute, pre-simulated in full at start and
stored (`data/model/SkillSession.kt:7-10`, `data/model/SessionFrame.kt:7-8`). Wall-clock
duration is **not** 60 minutes — it is a function of the player's Agility level
(`SkillSimulator.kt:415-423`):

```
fraction     = clamp(agilityLevel - 1, 0, 98) / 98
maxReduction = 20 + clamp(floorReductionMin, 0, 10)     // prestige Endurance nodes
minutes      = (60 - maxReduction * fraction) * clamp(chronosMultiplier, 0.5, 1.0)
durationMs   = round(minutes * 60000), floored at 60000
```

So 60 min at Agility 1, 50 min at 50, 40 min at 99, and lower still with prestige nodes or
the Chronos Spire building. `skills/agility.json` states the same rule in its `description`.
**The frame count is always 60 regardless** — Agility compresses wall-clock time per frame,
it does not change yield per Session. This is the single most important fact for a
Projection: items-per-Session is Agility-independent, items-per-hour is not.

### XP per action, by activity type

| Activity | XP source | Yield per frame |
| --- | --- | --- |
| Mining | `ores.json` → `xp_per_ore` | `1 × toolEfficiency` ore (`SkillSimulator.kt:72`, `:78-80`) |
| Woodcutting | `trees.json` → `xp_per_log` | same accumulator pattern; log key from `trees.json.log_name` |
| Fishing | `fish.json` → `xp_per_catch` | `1 × rodEfficiency` fish, with a 20% chance the frame rolls `skills/fishing.json` drop tables instead (`SkillSimulator.kt:208-217`) |
| Firemaking | `logs.json` → `xp_per_log` | one log per frame-unit |
| Prayer | `bones.json` → `xp_per_bone` | one bone per frame-unit |
| Runecrafting | `runes.json` → `xp_per_rune`, `essence_cost` | one rune per frame-unit |
| Agility | `agility_courses.json` → `xp_per_success` | `2 × toolEfficiency` laps/min (`SkillSimulator.kt:401`, `:342`); failures grant no XP |
| Crafting-type skills | `recipes/*.json` → `xp_per_item`, `output_quantity`, `materials` | see below |
| Generic gathering | `skills/*.json` → `xp_ranges` (`{min,max}` per level tier) | uniform draw per frame |
| Expeditions | `skilling_dungeons/*.json` → `xp_ranges` | uniform draw per frame |
| Trade routes | `trade_routes/*.json` → `xp_ranges`, `coin_ranges` | uniform draw per frame |
| Combat | `enemies.json` → `xp_drops.combat` | per kill; 25 attack ticks per frame at 2.4 s base speed (`CombatSimulator.kt:758-761`), faster weapons get `round(60 / attack_speed)` ticks (`CombatSimulator.kt:766`) |
| Raid bosses | `raid_bosses.json` → `xp_rewards` (map of skill → XP) | flat award on win, 10% on loss |

**Crafting sessions are quantity-driven, not 60-frame-driven.** The player picks a quantity
`qty`; `buildCraftFrames` (`QueuedSessionStarter.kt:1077-1113`) makes `min(qty, 60)` frames
and buckets items evenly across them. Duration is
`qty × (sessionDurationMs(agility) / 60 / efficiency)` — see the identical expression at
`QueuedSessionStarter.kt:633` (smithing), `:642`, `:651`, `:660`, `:669`, `:683`. So one
crafted item takes one "frame-unit", where a frame-unit is 60 s at Agility 1 and ~40.4 s at
Agility 99.

### ⚠️ The `time_per_*` fields are all dead

`ores.json.time_per_ore`, `trees.json.time_per_log`, `fish.json.time_per_catch`,
`logs.json.time_per_log`, `bones.json.time_per_bone`, `runes.json.time_per_rune`,
`recipes/*.time_per_item`, `fletching.time_per_batch` are all declared as serialised fields
(`data/json/GatheringData.kt:15,29,93,105`, `data/json/RecipeData.kt:15,27,56,67`,
`data/json/BoneData.kt:12`, `data/json/RuneData.kt:12`, `data/json/HerbloreData.kt:13`) and
**never read by any simulator**. Their values are meaningless placeholders anyway: gathering
files carry `1`, cooking/smithing carry `60`, herblore carries `120` — three different units
for the same nominal concept. A Projection must use the frame model above, not these fields.

Similarly, `xp_per_ore` etc. are **XP per frame, not XP per physical action**. At
`SkillSimulator.kt:72` the frame's XP is `oreData.xpPerOre × toolEfficiency`, once per
minute. So `xp_per_ore: 35` for iron means 35 XP/min and 2100 XP/Session, not 35 XP per
individual swing.

---

## 4. Item identity and joins

**The id scheme is a bare snake_case string.** There are no numeric ids anywhere. `iron_ore`,
`bronze_dagger`, `dragon_whelp` are the whole identity. Items are referenced by that string
from at least seven places: `enemies.drop_table[].item`, `enemies.always_drops[].item`,
`raid_bosses.common_loot.items` (as the map key), `raid_bosses.rare_drops[].item`,
`dungeons/*.rare_drops[].item`, `skills/*.drop_tables[][].item`,
`skilling_dungeons/*.drop_tables[][].item`, `thieving_npcs.loot_table[].item`,
`quests.rewards.items` (map key), `quests.target`, `recipes/*.materials` (map key),
`marketplace.*.items` (map key), `crops.seed_name`, `trees.log_name`,
`cooking.raw_item`/`cooked_item`, and `SessionFrame.items` in the Save Export.

I collected all 274 distinct item keys referenced from drop tables, loot tables and quest
rewards. **265 of 274 resolve to a display string; 9 do not** — they exist only as strings
inside `skills/*.json` drop tables and have no definition anywhere:

- from `skills/farming.json`: `wheat`, `sweetcorn`, `sweetcorn_seed`, `herb_seed`, `rare_herb`
- from `skills/woodcutting.json`: `elder_log`, `ancient_branch`, `enchanted_bark`, `golden_leaf`

These are harmless in practice because those particular drop tables are dead code (see the
warning below), but any validator must tolerate an unresolvable item key rather than throw.

### Display names: use the XML, not the JSON

`util/GameStrings.kt:12-14` is explicit: *"All user-visible game content names and
descriptions live in the strings_*.xml resource files… JSON data files contain only internal
snake_case keys — they are never displayed directly."* The `display_name` fields in the JSON
are developer conveniences and have **drifted**. Measured divergences between
`display_name` in JSON and the corresponding `strings*.xml` value:

| File | XML key pattern | Entries | Diverged |
| --- | --- | --- | --- |
| `fish.json` | `item_{key}_name` | 13 | **13** (JSON `"Shrimp"` vs XML `"Raw Shrimp"` — the JSON name is the *cooked* name) |
| `equipment.json` | `item_{key}_name` | 358 | 23 (mostly `"Amulet of Strength"` vs `"Amulet Of Strength"`) |
| `raid_bosses.json` | `boss_{key}_name` | 11 | 1 (`balrog`: JSON `"Gothic Ember, Ancient Flame of the Deep"` vs XML `"Gothic Ember"`) |
| `enemies.json` | `enemy_{key}_name` | 73 | 1 (escaping only) |
| `quests.json` (`name` field) | `quest_{id}_name` | 189 | 15 (hyphen vs em dash) |
| `carnival_prizes.json` | `carnival_prize_{key}_name` | 6 | 4 have **no XML string at all** |

Take the XML as authoritative and fall back to `display_name`, then to title-cased key.

**XML key namespaces**, from `util/GameStrings.kt:24-118` (the app) and
`wiki/src/game_data.py:231-408` (the wiki), which agree except where noted:

| Domain | Key pattern | Count in `values/` |
| --- | --- | --- |
| items | `item_{key}_name` / `_desc`, falling back to `crop_{key}_name` | 1172 `item_*` |
| enemies | `enemy_{key}_name`, falling back to `boss_{key}_name` | 73 |
| bosses | `boss_{key}_name` / `_desc` | 24 |
| quests (incl. guild quests) | `quest_{id}_name`, `quest_{id}_objective`, `quest_{id}_desc` | 1160 |
| skills | `skill_{key}_name` / `_desc` | 57 |
| dungeons | `dungeon_{key}_name` / `_desc` | 58 |
| expeditions | `skilling_dungeon_{key}_name` / `_desc` / `_note_{n}` | — |
| pets | `pet_{key}_name` / `_desc` | 51 |
| spells | `spell_{key}_name` | 32 |
| crops | `crop_{key}_name` / `_desc` | 20 |
| trees | `tree_{key}_name` | 7 |
| agility courses | `agility_{key}_name` | 30 |
| thieving NPCs | `thieving_npc_{key}_name` | 12 |
| trade routes | `trade_route_{id}_name` / `_desc` | 12 |
| equip slots | `equip_slot_{slot}` | — |
| guilds | `guild_name_{key}` | 20 |
| mercenaries | `merc_{key}_name` | 28 |
| house furnishings | `house_item_{key}` | 96 |
| carnival prizes | `carnival_prize_{key}_name` / `_desc` | 4 |
| seasonal | `seasonal_event_*`, `seasonal_bounty_*`, `seasonal_minigame_*`, `seasonal_market_*`, `seasonal_reward_{event}_{tokens}_desc` | 111 |

Note **guild quests share the `quest_*` namespace** — `mining_guild_1` resolves via
`quest_mining_guild_1_name`, not a guild-specific prefix, even though the strings physically
live in `strings_guild_quests.xml`. The file a string lives in carries no meaning; the app
resolves by name across the whole resource table.

### Fragile or non-obvious joins

1. **`quests.target` is polymorphic on `quests.type`** (see §1). The single most fragile
   join in the dataset.
2. **Fish are named twice.** `fish.json` is keyed by the *raw* item key (`raw_shrimp`) but
   its `display_name` is the *cooked* name (`"Shrimp"`). Separately,
   `recipes/cooking.json` is keyed by a *bare* name (`shrimp`) with `raw_item: "raw_shrimp"`
   and `cooked_item: "shrimp"` — so for shrimp the cooked item key collides with the recipe
   key, but for rat meat the recipe key is `rat_meat` while `cooked_item` is
   `cooked_rat_meat`. Join cooking recipes on `raw_item`/`cooked_item`, never on the recipe
   key.
3. **Woodcutting has three parallel key spaces.** `trees.json` is keyed by tree
   (`oak_tree`), produces `log_name: "oak_log"`, and `logs.json` is keyed by the log
   (`oak_log`) for Firemaking. Firemaking output ash is derived from a *hardcoded* `when`
   block, not data: `QueuedSessionStarter.kt:1116-1124` maps `oak_log → oak_ashes`, with
   `ashes` as the default. Same for the rune bonus per ash type at `:1126-1135`.
4. **Crops vs seeds.** `crops.json` is keyed by produce (`potato`) with
   `seed_name: "potato_seed"`; drop tables and the marketplace reference both keys as if
   they were peers.
5. **Pets are joined twice.** `raid_bosses[].pet.id` points into `pets.json`, and
   `pets.json.boosted_skill` points at a skill key; `petDropChance` only fires for skills
   that have at least one pet (`QueuedSessionStarter.kt:1075`).
6. **`slayer_tasks.json` is keyed by enemy key**, so it joins directly to `enemies.json`,
   but only 23 of the 73 enemies appear.
7. Android escaping leaks into extracted strings: XML values contain `\'` and `\n`. They
   must be unescaped before display — `game_data.py:130-153` is the reference
   implementation.

---

## 5. What `wiki/src/game_data.py` has already solved

429 lines, of which roughly 200 are the Android resource layer. It is **reference only** —
the companion app will not import it — but four things in it are worth reimplementing by
hand rather than rediscovering:

1. **Multi-locale string loading (`:156-213`).** It walks every `res/values*` directory,
   derives a locale from the directory name (`values` → `default`, `values-de` → `de`), and
   parses every file whose name starts with `strings`. `GameStrings.get_string` (`:107-113`)
   then resolves in order `[requested locale, instance locale, default]`. The repo ships 18
   translated locales; a PWA that vendors only `values/` gets English and nothing else, and
   this is the shape to copy if that ever changes.

2. **Android escape decoding (`:130-153`).** Handles `\n`, `\t`, `\'`, `\"`, `\\`, `\@`,
   `\?`, and strips the surrounding `"..."` that Android uses to preserve leading/trailing
   whitespace. Without this, item names show as `Trickster\'s Amulet`. It also uses
   `"".join(node.itertext())` (`:175`) rather than `node.text`, so strings containing inline
   markup like `<b>` are not silently truncated at the first child element.

3. **Positional format-argument substitution (`:55-67`).** Android strings use `%1$s`,
   `%2$d`; the regex `%(\d+)\$[a-zA-Z]` maps them to positional args and normalises `%%` to
   `%`. Needed for anything parameterised — e.g. prestige effect descriptions
   (`:411-419`), which additionally special-case `unlock_recipe` to interpolate an item name.

4. **Plurals (`:78-88`, `:180-213`).** Parses `<plurals>` into `{quantity: template}` and
   falls back to `other` when the selected quantity is absent, "matching Android, which only
   uses quantities like `zero` in locales whose grammar requires them" (`:84-85`). If the
   PWA never renders counted phrases from game strings, this can be skipped entirely.

Also worth copying, cheaply:

- **The prefix-fallback chain for item names (`:231-243`):** try `item_{key}_name`, then
  `crop_{key}_name`, then `spell_{key}_name`, then title-case the key. Note the app's Kotlin
  equivalent (`GameStrings.kt:24-27`) omits the `spell_` step — the wiki's chain is the more
  forgiving of the two.
- **Never hard-failing on a missing string (`:265-271`).** Every resolver logs once per
  missing key (`warn_by_id`) and returns a title-cased fallback. Given the 9 orphan item
  keys and 4 missing carnival prize strings found in §4, a strict loader would crash on real
  data.
- **`title()` (`:223-228`)** is `key.replace("_", " ").title()`, matching the Kotlin
  `toTitleCase()` fallback. Use exactly this so the two agree.

What it does **not** solve, and the companion app still has to: any of the drop-rate or
timing semantics in §2 and §3. `game_data.py` is a name resolver and a `json.loads` wrapper
(`:426-429`); all interpretation of drop tables and frame counts lives in the Kotlin
simulators, not in the wiki.

---

## 6. What a PWA should vendor

Raw and gzipped sizes, measured on the checked-out files:

| Bundle | Files | Raw | Gzip |
| --- | --- | --- | --- |
| Core Ledger — `enemies`, `quests`, `raid_bosses`, `equipment`, `pets` | 5 | 298.7 KB | 30.6 KB |
| Projection inputs — `ores`, `trees`, `fish`, `logs`, `bones`, `runes`, `gems`, `agility_courses`, `crops`, `thieving_npcs`, `slayer_tasks`, `spells`, `marketplace` | 13 | 44.3 KB | 7.8 KB |
| `skills/` | 8 | 17.7 KB | 3.7 KB |
| `recipes/` | 6 | 68.5 KB | 6.0 KB |
| `dungeons/` | 29 | 14.4 KB | 8.1 KB |
| `skilling_dungeons/` | 10 | 24.2 KB | 8.6 KB |
| `trade_routes/` | 6 | 2.7 KB | 1.5 KB |
| Optional — `guild_quests`, `weekly_quests`, `daily_quests`, `seasonal_events`, `carnival_prizes`, `mercenaries`, `buildings` | 7 | 130.0 KB | 15.8 KB |
| **Total of the above** | **84** | **600.5 KB** | **82.1 KB** |
| As one minified bundle | 1 | 444.7 KB | **65.7 KB** |
| Extracted display-name map (names only, 1801 entries) | 1 | 79.2 KB | 15.8 KB |
| Same, names + descriptions | 1 | 158.6 KB | 35.7 KB |

**Recommendation: one minified JSON bundle of the 84 files above plus a names-only string
map — about 524 KB raw, ~82 KB over the wire gzipped.** That is small enough to precache in
a service worker without thinking about it. Concatenating and minifying is worth doing: the
per-file gzip total is 82.1 KB against 65.7 KB for a single stream, because the 29 dungeon
files and 10 expedition files are tiny and each pays its own dictionary cost.

Two files carrying real weight should be handled deliberately rather than skipped outright:

- **`equipment.json` (130 KB, 358 entries)** — vendor it. It is the item Ledger; there is no
  substitute. It compresses to ~14 KB because the entries are near-identical in shape. If
  size ever matters, its `description` fields are dead weight (display copy comes from
  `item_{key}_desc` in the XML anyway) and stripping them recovers a meaningful fraction.
- **`guild_daily_quests.json` (204 KB, 439 entries)** — **skip in v1.** These are *rotating*
  daily assignments banded by `guild_level_min`/`guild_level_max`, not a finishable set, so
  they do not belong in a Ledger under the `CONTEXT.md` definition of Completion. It is the
  single largest file and the least Goal-shaped. Load it lazily if guild dailies ever get a
  Goal.

Skip outright:

| File | Size | Why |
| --- | --- | --- |
| `guild_daily_quests.json` | 204 KB | rotating, not a finishable set (above) |
| `prestige_paths.json` | 60 KB | affects rates, not completion; only needed once Projections model prestige nodes |
| `house_tiles.json` | 53 KB | mostly sprite atlas coordinates (`x`,`y`,`w`,`h`); the 123 furnishings are a completionist category, but the geometry is 90% of the bytes |
| `official_themes.json` | 6 KB | Android UI colour schemes, no game content |
| `items.json` | 5 KB | dead data, unreferenced by app or wiki (§1) |
| `xp_table.json` | 1.8 KB | reproducible from a 10-line formula (§1) |

That skip list is 321 KB raw — over a third of the data directory — for zero Ledger loss in
v1.

The Android string XMLs should **not** be vendored as XML. `values/` alone is 380 KB across
9 files, of which `strings.xml` (169 KB) is almost entirely app UI chrome. Extract the
game-content keys at build time into a flat `{key: name}` JSON — 1801 name entries, 79 KB
raw / 15.8 KB gzipped. Add descriptions only for the surfaces that show them (that doubles
it to 35.7 KB gzipped).
