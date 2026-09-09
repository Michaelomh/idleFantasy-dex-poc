# PROTOTYPE — Save Source ingestion

Throwaway. Answers one question for
[Save Source: persistence, share-target refresh, and staleness](https://github.com/Michaelomh/idleFantasy-dex/issues/4):
**does the ingestion flow actually feel good?**

Nothing here is production code. No build step, no framework, no tests, no abstractions —
three script files and a manifest. Delete the whole directory once the decision is folded in.

## Run it

```
python3 make-samples.py     # writes ./samples, including the extensionless auto-backup
python3 serve.py            # http://localhost:8099
```

`localhost` is a secure context, so service workers, Share Target and `showDirectoryPicker`
all work without TLS.

**On Android**, plug the phone in, enable USB debugging, then in desktop Chrome open
`chrome://inspect` → **Port forwarding** → `8099` → `localhost:8099`. The phone now reaches
`http://localhost:8099` as a secure context. Open it, install to home screen, and the share
target registers. Brave uses `brave://inspect` and the same flow.

Copy `samples/fantasyidler_auto_1_Kyrasoar` (no extension, on purpose) to the phone's
Downloads folder to test the real trap.

## What to check

The state panel re-renders after every action, so drive it and watch the top block.

**Persistence — the load-bearing part.** Ingest a save, then close the tab and reopen it.
Player State should already be there, no upload, no network. This should work in every
browser including Firefox and Safari.

**Android refresh.** Share the extensionless sample from a file manager into the installed
app. The event log prints the MIME type the share sheet actually handed over — that line
is the evidence #4 asks for. If the app does not appear in the share sheet at all, that is
the answer, and it is a filename problem, not an API problem.

**Desktop refresh.** *Link backup folder* against a folder containing samples, then reload.
On the cold visit the app has a handle but not permission, so it shows a **Reconnect**
banner rather than a prompt (browsers require a gesture). Judge that click: is one click per
visit acceptable, or does it undo the point?

**Staleness.** Simulate a 3-day-old save. Currently the app *labels* and never blocks —
`fresh` under 12h, `aging` under 48h, `stale` beyond. Decide whether a Projection computed
off a stale save needs anything stronger than a coloured word.

**Rejections.** Simulate the photo and the other app's JSON. Validation is content-based:
parse, then require the `PlayerExport` core keys. MIME is recorded and never gated on, and
the `fantasyidler_` prefix is a hint, never a requirement.

**Two collisions the flow has to answer, both surfaced as a banner rather than decided:**

- an **older** export than the cached one, which happens whenever a stale file gets shared
- a **different character**, i.e. another save slot

Both currently prompt Replace / Keep current. That is a guess, not a decision — react to it.

## Known rough edges, deliberately left

- The desktop cold visit needs one click to re-permission the folder. Unavoidable per spec.
- Directory scan reads every file in the folder to validate it. Fine for a backup folder,
  wrong for a Downloads folder with thousands of files.
- Only one character is cached. Multi-slot is not modelled.
- The service worker does no asset caching, so the app is not offline-capable yet. Out of
  scope here: the question was ingestion.
