# NEXT — arcgis-preview (the app)

*Written 2026-07-06 by Fable, after re-auditing the code against `../PLAN.md`. This is the
prioritized work queue for the app. Each task says which model to hand it to and why.*

**Model routing legend:**
- **Fable** — judgment-heavy: architecture, API/state design, product tradeoffs, anything where
  the spec has to be *invented* before it can be executed.
- **Opus** — execution-heavy: the spec exists (in PLAN.md, in this file, or in a Fable-written
  design note) and the work is careful, mechanical, and verifiable. Give Opus `../FOR-OPUS.md`
  along with the task.

---

## Where we actually are (audit, 2026-07-06)

Progress since PLAN.md was written:
- ✅ Git exists (gitea private + github origin, `maplibre` branch); typecheck **passes**; docs/
  bundle no longer committed on source branch; deploy script works (worktree-based, local-only).
- ✅ Components partially extracted: `src/components/sidebar/{tabs,components}`, `ui/`, `controls/`.
- ✅ Legend, symbol renderer, style cleanup shipped (June commits).

Regressions / still open:
- ⚠️ **Inline styles grew: 270+ → 476 occurrences.** The extraction moved code but the styling
  debt is compounding. Phase 3 discipline hasn't started.
- ⚠️ `SelectTab.tsx` is now the biggest file (**2,639 lines**), ahead of `MapView.tsx` (2,220)
  and `App.tsx` (1,861). The monolith problem migrated; it didn't shrink.
- ⚠️ Still present: both WHERE editors, `MoreInfoOverlay`, `labs-postgis-preview/`,
  `libatk1.0-0t64_*.deb` in the repo root, five stale TODO docs, 16 emoji/glyph icons,
  no LICENSE, one trivial test, no CI, no Playwright smoke tests.

---

## The queue

### 0. Hygiene sweep (30 min) — **Opus**
Purely mechanical; zero judgment. In one commit:
- Delete `labs-postgis-preview/`, `libatk1.0-0t64_2.60.0-1_amd64v3.deb`, `tests/dist/`.
- Move `TODO.md`, `TODO-done.md`, `UI-TODO.md`, `TODO-layer-finder.md`, `TODO-style-switcher.md`
  to `docs-archive/` (keep `TODO-vision.md` at root — it's the north star).
- Add MIT `LICENSE` (Jim as copyright holder; note NPMap provenance in README credits).
- Add `.gitignore` entries for any of the above that regenerate.

### 1. Playwright smoke tests BEFORE any refactor (1 day) — **Fable designs, Opus can extend**
PLAN.md Phase 2 says this and it's still the highest-leverage unstarted item: 3–5 tests against a
**mocked** ArcGIS service fixture (paste URL → map renders → table rows → filter applies → export
downloads). These are the safety net for everything below. Fable should write the first two
(fixture design + the render-verification trick is fiddly on this host — see the browser
verification recipe in memory/`docs`); Opus can then clone the pattern for the remaining flows.
Note: the existing `npm test` (tsc-compile-then-node) should be replaced by vitest here too.

### 2. `useUrlState()` extraction (2–3 days) — **Fable**
The single most consequential refactor: all `?url/where/tab/basemap/style/center/z/id` read/write
in one hook. It de-risks share-link fidelity (Phase 4's flagship) and is the seam along which
`App.tsx` splits. This is design work — URL state has ordering, back-compat aliases, and
"draft vs committed" semantics that are easy to get subtly wrong. Not a mechanical move.

### 3. Split the three monoliths (1 week) — **Fable plans the seams, Opus executes**
`SelectTab.tsx` (2,639), `MapView.tsx` (2,220), `App.tsx` (1,861). For each: Fable writes a short
seam plan (what hooks/components come out, what props cross the boundary), then Opus does the
extraction with the smoke tests green after every step. Target from PLAN.md stands: no file
over ~400 lines. Do SelectTab first — it's now the worst and it's also the flagship feature
(Layer Finder), so polish there pays most.

### 4. Subtraction pass (1–2 days) — **Opus**, one item needs **Jim**
All specified in PLAN.md Phase 1; now that tests exist (item 1), these are safe deletes:
- Fold `WhereEditor.tsx` into `WhereEditorCM.tsx` (keep CodeMirror).
- Merge `MoreInfoOverlay` into the Details tab.
- Audit/remove `ExtentMiniMap`, `TimeBadge`, `InspectTab` if superseded.
- Basemaps → 4 + custom (keep URL back-compat aliases).
- KML/KMZ: **Jim decides** demote-vs-drop (PLAN.md open decision #2) before Opus touches it.

### 5. Design tokens + primitives (1–2 weeks) — **Fable defines, Opus migrates**
The 476 inline styles and 16 emoji icons. Fable: extend `styles.css` tokens (spacing/radius/type/
status colors, light+dark) and build the ~8 primitives (`Button`, `Chip`, `Input`, `Select`,
`Panel`, `StatusBanner`, `EmptyState`, `KeyValue`) + pick lucide-react icons. Opus: migrate every
tab to them, file by file, deleting inline styles as it goes — ideal Opus work *once the
primitives exist*, disastrous if Opus invents primitives per-file. Acceptance: grep for
`style={{` returns only dynamic values.

### 6. One status system (2–3 days) — **Fable**
Priority-ordered single status slot + inline chips + toasts-for-confirmations-only, per PLAN.md
Phase 1. This is product design (what interrupts whom, when) masquerading as refactoring.

### 7. Trust features (Phase 4) — **Fable**, export batching partly **Opus**
- Share-link fidelity (builds directly on item 2's `useUrlState`).
- Honest export: Fable designs the "everything matching filter (N) vs loaded now (M)" UX and the
  cancel/progress contract; Opus can implement the batched `returnIdsOnly` fetch loop against
  that contract.
- 401/403 → sign-in path + token input.
- Field profiling — the one new feature; Fable end-to-end (it needs `outStatistics` capability
  detection with graceful sample-fallback, and the UI is new surface area).

### 8. CI — blocked, then **Opus**
Blocked on publishing `@opendataland/source-arcgis` to npm or vendoring it in CI (Actions can't
see the `file:../source-arcgis-rest` dependency — see `source-arcgis-rest/NEXT.md` item 1).
Once unblocked: typecheck + build + vitest + Playwright on push. Mechanical.

---

## Standing rules (apply to every task above)
- Smoke tests green before and after every extraction step; typecheck is the gate.
- No new `style={{}}` with static values — even before item 5 lands, stop digging.
- Subtract before adding: if a task can delete code, that's the version to ship.
- Commit small; the repo has a private gitea remote — push there freely, github when Jim says.
