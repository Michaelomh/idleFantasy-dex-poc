#!/usr/bin/env python3
"""PROTOTYPE — writes throwaway sample Save Exports into ./samples.

Includes the extensionless filename the game's BackupScheduler actually produces,
which is the whole point: copy that one onto an Android device to test whether the
share sheet offers the PWA at all.
"""
import json, time, pathlib

OUT = pathlib.Path(__file__).parent / "samples"
OUT.mkdir(exist_ok=True)
NOW = int(time.time() * 1000)
HOUR = 3600 * 1000


def save(character="Kyrasoar", hours_ago=1, kills=41, seen=120, quests=96):
    return {
        "skillLevels": json.dumps({"fishing": 71, "mining": 55, "woodcutting": 60}),
        "skillXp": json.dumps({"fishing": 814000}),
        "inventory": json.dumps({"raw_shark": 812}),
        "equipped": json.dumps({"weapon": "rune_sword"}),
        "flags": json.dumps({
            "character_name": character,
            "last_seen_version_code": 149002,
            "enemy_kills": {f"enemy_{i}": i + 1 for i in range(kills)},
            "seen_item_keys": [f"item_{i}" for i in range(seen)],
        }),
        "pets": json.dumps(["pet_rock"]),
        "coins": 1204553,
        "questProgress": [
            {"questId": f"q{i}", "progress": 1, "completed": i < quests, "completedAt": 0}
            for i in range(189)
        ],
        "farmingPatches": [],
        "sessions": [{"skill": "fishing", "frames": 60}],
        "exported_at": NOW - hours_ago * HOUR,
        "sig": "deadbeef",
    }


files = {
    # The trap: no extension, exactly as BackupScheduler.autoBackupFileName writes it.
    "fantasyidler_auto_1_Kyrasoar": save(hours_ago=1),
    # The manual export path, which does append .json.
    "fantasyidler_save_1_Kyrasoar.json": save(hours_ago=1),
    "stale_fantasyidler_auto_1_Kyrasoar": save(hours_ago=72),
    "other_character_fantasyidler_auto_2_Bramblefoot": save(character="Bramblefoot", hours_ago=2),
    "not_a_save.json": {"version": 3, "todos": []},
}

for name, doc in files.items():
    (OUT / name).write_text(json.dumps(doc))
    print("wrote", OUT / name)
