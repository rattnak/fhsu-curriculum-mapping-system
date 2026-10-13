# Development Plan: Closing the Assessment Reporting Gaps

**Prepared for:** internal use, self-hosted CourseTune-alternative MVP
**Source:** three real FHSU program assessment annual reports reviewed directly (HHP BS, HHP MS, Robbins College Informatics BS/BA), plus the earlier CourseTune layout review.
**Status:** action-item tracker (item 0 below) is already built. Everything else here is proposed, not started.

## Context

The real assessment reports show that FHSU departments already run a much richer assessment cycle than our current schema can represent. Programs have goals, PLOs, success thresholds, per section results, multi year trend tables, and a formal closing the loop process with tracked action items. This plan breaks that gap into buildable pieces, ordered by how much they unblock other work.

## 0. Action item tracker (done)

Added `ActionItem` model tied to a program level `Outcome`, with short title, description, person responsible, target date, resources needed, and a status (open, in progress, done). CRUD endpoints at `/action-items`. Surfaced in the Sidebar under a program node as "Program outcomes and action items," with an add form for editors and a click to cycle status. Seeded with two real examples adapted from the HHP BS report.

## 1. Assessment result data (highest priority)

This is the core structural gap. Every report is mostly a table of results: how many students were assessed, how many met the threshold, broken down by course section, instructor, semester, and modality.

**Schema:**
- New `AssessmentResult` table: `outcome_id` (the PLO), `course_id`, `section` (free text, e.g. "A", "VA"), `instructor` (free text for now), `term` (free text, e.g. "Fall 2024"), `modality` ("on_campus" | "on_line"), `students_assessed`, `students_meeting_threshold`, `mastery_breakdown` (JSON or four int columns: novice/apprentice/proficient/master counts, matching what the reports actually use), `met_threshold` (bool, nullable for not yet reported).
- Keep it decoupled from `Mapping`. `Mapping` describes the curriculum design (which course teaches which outcome at what mastery level); `AssessmentResult` describes what actually happened in a given term. They reference the same `outcome_id` but serve different questions.

**API:**
- `POST /assessment-results`, `GET /outcomes/{id}/assessment-results`, `PATCH`/`DELETE` by id. Same edit-access pattern as action items (walk up to the owning program node, check `can_edit`).
- Extend `node_detail`'s `program_outcomes` block to include each PLO's assessment results alongside its action items.

**UI:**
- Under each PLO in the Sidebar, a compact results table (term, section, assessed, met, percent) with a simple bar or percentage badge. Add/edit form gated by `can_edit`, same pattern as the action item form.
- This directly feeds the "coverage matrix" and "rigidity audit" reports with real numbers instead of only curriculum-mapping intent.

## 2. Year over year trend tracking

Depends on (1) existing, since a trend is just a `GROUP BY term` over `AssessmentResult` rows for one outcome.

**Backend:**
- A `reports.py` function `plo_trend(session, outcome_id)` that returns one row per term: total assessed, total meeting threshold, percent, split by modality where present.
- No new schema needed beyond `AssessmentResult.term`.

**UI:**
- A small trend table or sparkline in the PLO detail view, mirroring the "Prior 2/3/4 Years of Results" tables in the real reports.

## 3. Success threshold on outcomes

**Schema:**
- Add `success_threshold_text: Optional[str]` to `Outcome` (free text, e.g. "70% of students will score at the 70% (proficient) level..."). The real thresholds are too varied and rubric specific to model as a single number and percentage pair; free text matches how every department actually writes them.
- Optionally add `success_threshold_pct: Optional[int]` for the common case (the percentage that appears in nearly every threshold sentence), so `met_threshold` on `AssessmentResult` can eventually be computed rather than hand entered. Not required for v1; hand entered `met_threshold` is fine to start.

**UI:**
- Show the threshold text under each PLO's assessment results section, matching how the real reports pair "Targets, Standards, or Benchmarks" directly above the results table.

## 4. Per department mastery scales as real, swappable scales

Currently `MasteryLevel` is a fixed 3 value enum (Introduced, Reinforced, Mastered) with only display labels swappable via `MASTERY_LABELS`. Real scales seen so far: Introducing/Broadening/Fulfilling (HHP, 3 levels), Novice/Apprentice/Proficient/Master (Informatics, 4 levels), Introduce/Develop/Mastery (Nursing, 3 levels).

**Schema:**
- Introduce a `MasteryScale` table: `scale_id`, `owning_node_id` (department or program), `level_labels` (ordered list, e.g. JSON array `["Novice", "Apprentice", "Proficient", "Master"]`).
- `Mapping.mastery_level` changes from a fixed enum to an integer level index (1 based) plus a reference to the scale in effect, so a 4 level department isn't forced into a 3 level box.
- This is the most invasive change in this plan since `MasteryLevel` is used across seed data, reports, and the frontend's mastery badge styling. Do this only after (1) through (3) are stable, since it touches the same files repeatedly.

**UI:**
- Sidebar's mastery badges and the `MASTERY_LABELS` lookup become scale aware instead of enum aware.

## 5. Modality aware reporting

**Backend:**
- `reports.py`'s `coverage_matrix` and `rigidity_audit` already have `Node.modality_tag` available on nodes; extend both functions to optionally split their output by modality when `AssessmentResult.modality` values exist for the scope.
- Simplest version: `AssessmentResult` already carries `modality` from item (1), so this is mostly a `reports.py` grouping change, not a new schema.

**UI:**
- Reports.jsx gets an on campus / on line toggle or side by side columns, matching how every real report is laid out.

## 6. Goal to PLO two tier hierarchy

**Schema:**
- Add `OutcomeLevel.goal` (a new enum value sitting above `program`). A goal owns multiple PLOs via `parent_outcome_id`, same self referential pattern `Outcome` already uses for CLO to PLO links.
- Seed data: for programs with real, richer PLO sets (start with Informatics, since we have its real goal and PLO text from the report), add 4 goal nodes each linking to its PLOs.

**UI:**
- PLO list in the Sidebar groups by parent goal when one exists; falls back to the current flat list when it doesn't (most seeded programs still have flat PLOs).

This is lower priority than (1) through (3) because it changes the shape of outcome data without unlocking new reporting, whereas (1) through (3) directly enable real report content.

## 7. Multiple assessment tools per PLO

Once (1) exists, this falls out naturally: a PLO can already have many `AssessmentResult` rows from different courses and terms. The one addition worth calling out is a `tool_name` field on `AssessmentResult` (e.g. "Critical Review #3," "Final Comprehensive Exam") so results from two different measures for the same PLO in the same term stay distinguishable, matching the real reports' "Direct #1 / Direct #2" pattern.

## 8. Explicit "not addressed" curriculum map cells

**Backend:**
- Extend `coverage_matrix` to return every course times PLO cell within scope, not just mapped ones, with an explicit level of 0 (not addressed) where no `Mapping` exists. This is a `reports.py` change only, no schema change, since "not addressed" is just the absence of a `Mapping` row.

**UI:**
- Reports.jsx renders the full grid instead of a sparse list, matching the real curriculum map layout (course rows, PLO columns, 0 to 3 in each cell).

## Suggested build order

1. Assessment result data (unlocks everything downstream)
2. Success threshold on outcomes (small, pairs naturally with 1)
3. Year over year trend tracking (pure aggregation over 1)
4. Explicit "not addressed" cells in the coverage matrix (small, standalone)
5. Modality aware reporting (grouping change over 1)
6. Multiple assessment tools per PLO (small addition to 1)
7. Goal to PLO two tier hierarchy (standalone, no dependency on the others)
8. Per department mastery scales (largest, most invasive, do last)

Items 1 through 3 are the ones that make the biggest visible difference: they turn the app from "here is the intended curriculum design" into "here is what actually happened and whether it is improving," which is the entire point of the real reports.
