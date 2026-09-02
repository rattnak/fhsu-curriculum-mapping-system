# CourseTune Layout Review for the FHSU Curriculum Mapping System

**Prepared for:** internal use, self-hosted CourseTune-alternative MVP
**Source reviewed:** CourseTune as deployed at Fort Hays State University (live production instance), accessed directly in-browser
**Scope note:** This review documents only what was directly observed in the FHSU instance. Any item I could not confirm by clicking through the interface is explicitly labeled **unverified** rather than assumed. No real FHSU student, employee, or personally identifiable data (names, emails) is reproduced below, even though such data was visible in the Users and Course Team panels during the review.

---

## 1. Screen inventory

| Screen | Purpose | Likely user | Frequency (inferred) |
|---|---|---|---|
| Institution layer | Single root card for the whole university; entry point into the hierarchy | Admin, curriculum office | Rare — passed through, not lingered on |
| Division layer | Grid of department/division cards, each with an icon and a "N Programs" count | Dept chairs, curriculum committee, admin | Occasional — orientation point when switching departments |
| Program layer | Circle(s) for each degree/major inside a division, each with an "N Courses" count | Program directors, curriculum committee | Occasional |
| Course layer | Program's courses arranged in a ring around the program node; a "LAYERS" toggle (CO vs Module) changes what's shown as satellite text | Faculty, curriculum mapping editors | Frequent |
| Module layer (within a course) | Course's modules arranged in a ring around the course node | Faculty/instructional designers | Frequent — this is the main working view |
| C-layer / Bundle layer (buttons present: "Navigate to c-layer of the current course" / "Navigate to bundle layer of the current course") | **Unverified** — not explored in this session; likely a concepts layer and a cross-listed/section-bundling layer respectively, based on the presence of a "Concepts" entry in the Mappings list | Unknown | Unknown |
| Global Search widget | Multi-scope (this course / this program / this division / whole institution), multi-type (Divisions, Programs, Courses, COs, Bundles, Learning Obj., Details, Outcomes, Activities, Suggestions, Replies) keyword search | Everyone | Frequent |
| Mappings / Outcome tree panel (right rail) | Lists outcome sets attached at the current level; expandable to nested sub-outcomes with per-leaf mapped/unmapped status | Curriculum mapping editors | Very frequent — core mapping surface |
| Activities & Properties panel (right rail) | Lists activity-type categories (Discussions, Content Explorations, Interactive Lectures, Learning Games, Papers, Presentations, Readings, Video), each expandable into per-module activity instances; plus Modality/Engagement/Grading property groups | Faculty, instructional designers | Frequent |
| Description panel (Course / Module / Outcome / Sub-outcome / Activity) | Consistent Title / Description / ID fields shown at the bottom of the right rail for whatever is currently selected | Everyone | Constant, passive |
| Course Tasks panel | "Course Tasks" and "Completed Tasks" checklist for the current course | Editors/managers | Occasional |
| Reports and Data panel | List of ~13 named report templates plus a custom-report builder and a "Help me choose…" wizard | Program chairs, curriculum committees, accreditation preparers | Periodic (course review, accreditation cycles) |
| Course Team / Access panel | Per-course roster with role assignment (manager/editor/commenter/viewer/none) and a "Grant Access" / "Change Role" control | Managers, admins | Occasional |
| Admin — Customizations (Level Names, Outcome Scales, Other) | Institution-wide configuration of hierarchy labels, mastery scales, and report/permission defaults | Admin only | Rare |
| Admin — Users | Institution-wide user roster (Name, Highest Role, User Type, Email, Last Activity) with add/export/batch-assign/deactivate tools | Admin only | Rare |

---

## 2. The circle/ring visualization

What I could confirm directly: nodes at every layer render as solid-color circles (a teal ring around a dark navy fill for the "current" center node; plain outlined circles for satellite nodes) with a scalloped, cloud-like halo shape behind the top-level/center node. **I did not find a ring divided into colored arc segments encoding activities (green) versus assessments (gold) anywhere in the screens I reached.** This may exist in a mode or zoom state I didn't trigger, but as observed, module and course nodes are solid single-color circles, not segmented wheels. Treat the "green activities / gold assessments" premise as **unverified against this deployment** — worth re-checking directly in your FHSU account before building it into the target system's spec.

Confirmed interactions:
- Single click on a node selects it and populates a "Description of [Course/Module]" panel on the right (Title, Description, ID).
- Hovering/selecting a node reveals a small circular "+" (zoom-in) icon over it; clicking that icon — not double-clicking the node itself — drills down one hierarchy level. Double-click was unreliable in testing.
- Mouse-wheel scroll pans/zooms the canvas.
- Selecting a leaf outcome in the right-rail Mappings tree immediately draws a highlighted border around every node (at whatever layer/scope is active) that is mapped to it, and opens a small floating card showing a "MAP…" toggle plus I / D / M badges (the active mastery scale's levels).

Real information vs. decoration: the highlighted border used to show outcome-mapping status is the one clearly information-bearing visual element I could confirm. The scalloped halo behind the center node appears to be pure decorative framing. Node fill color otherwise tracks hierarchy depth/selection state rather than any data attribute.

What FHSU users click most: **unverified** — no usage analytics were surfaced in the panels I reached.

---

## 3. Hierarchy & taxonomy semantics

Confirmed five-level structure, all labels admin-configurable under Admin → Customizations → Level Names:

| Level | Default label (abbrev.) | What it maps to at FHSU |
|---|---|---|
| 1 | Institution | The university itself — a single root node ("Fort Hays State University"), not a generic label |
| 2 | Division (DIV) | Academic department (e.g., "Nursing Dept.", "Chemistry Dept.", "Department of Social Work") |
| 3 | Program (P) | A specific degree/major (e.g., "MSE in Chemistry Program") |
| 4 | Course (C) | An individual course (e.g., CHEM 662, NURS 945) |
| 5 | Module | A unit/module within a course |

**This confirms Program is a distinct layer sitting between Division (department) and Course** — not folded into the department node. This is a structural layer your current node model (institution → college → department → course → module) is missing.

Each level's singular name, plural name, and abbreviation are free-text fields set by the institution admin — FHSU is not using CourseTune's out-of-the-box defaults verbatim (e.g., "Division" instead of a generic "College/Department" label).

Outcome sets are attached at multiple levels and are independently switchable per node: a Program-level node showed "MSE Chemistry PLOs" / "MSE Chemistry CLO list" / "MSE Chemistry PLOs_Generic"; a Division-level outcome set ("Domain 1 Advanced-Level Knowledge for Nursing Practice") was explicitly labeled **"Division Outcome Set"** in its description panel. Outcome items nest at least three levels deep (e.g., top item "1.1" → sub-item "1.1e"), and each leaf independently carries a mapped/unmapped status shown as a checkmark versus greyed-out text.

Naming/numbering conventions observed (inferable rules for automated compliance checks):
1. Outcome sets are paired by audience level per numbered domain: "Domain 1 Advanced-Level Knowledge for Nursing Practice" alongside "Domain 1 Entry-Level Knowledge…", repeating for Domains 1 through at least 10.
2. Sub-outcome IDs are decimal-then-letter: `1.1`, `1.2`, `1.3` at one tier, then `1.1e`, `1.1f`, `1.1g` at the next — i.e., `<top-outcome-number>.<sub-number><letter>`.
3. Course tags follow a hashtag convention combining program + term + cohort, e.g. `#BSN-DNP`, `#MSN-DNP`, `#Fall`, `#BSNFA2`, `#Year2`, `#MSNFA2` — multiple tags per course, several courses sharing the same tag set (evidence of shared cross-listed content across program tracks).

Mastery scale is **not fixed to Introduced/Reinforced/Mastered.** Admin → Customizations → Outcome Scales lists at least a dozen preconfigured 2–5-level scales (IDM: Introduce/Develop/Mastery; XM: Explicit/Implicit; IERA: Introduced/Emphasized/Reinforced/Advanced; BIA: Beginning/Intermediate/Advanced; IRMA; EDT; IRA; IRD; IRPA; KAS; IBF; KSA; more below the visible fold) plus a "Add Custom Scale" option, and different outcome sets on the same course can use different scales. The NURS 945 course observed here used the **IDM** scale (Introduce / Develop / Mastery), not literally "Introduced/Reinforced/Mastered."

---

## 4. Mapping workflow

Steps I was able to exercise directly, editor perspective, mapping a course outcome to a division/program-level outcome:

1. Open the course; make sure the "Module" (or "CLO") layer is active via the LAYERS toggle in the left rail.
2. In the right-rail Mappings panel, pick an outcome set (e.g., "Domain 1 Advanced-Level Knowledge for Nursing Practice") — click its chevron to expand the outcome tree.
3. Expand a top-level outcome (e.g., "1.1") to reveal its sub-outcomes ("1.1e", "1.1f", "1.1g"); already-mapped items render bold with a checkmark, unmapped items render greyed out.
4. Click a specific sub-outcome. The canvas immediately redraws with a highlighted border around every node already mapped to it, and a small floating card appears showing a mastery-level toggle (I / D / M) plus a "Description of Suboutcome" panel (Title, Description, ID) at the bottom of the right rail.
5. To attach or review an activity/assessment (rather than just an outcome), switch the right rail to the Activities panel. Activities are grouped by type (Discussions, Content Explorations, Interactive Lectures, Learning Games, Papers, Presentations, Readings, Video); each type expands into discrete, already-named-per-module instances (e.g., "Module 1 Discussion"). Selecting one shows Activity Type, an Assessment Yes/No flag, a "Spans N learning objectives" count, Name, and a free-text Description (in the one instance inspected, this held real discussion-question text).

Click count for a full "select outcome → attach activity → set mastery level" cycle: **could not be completed and verified within this session.** Clicking a module node while an outcome was selected opened only that module's own generic Description panel rather than a combined mapping-editor cell for that outcome × module pair, so I could not confirm the exact control used to set the I/D/M level against a specific module/activity, nor the save/confirm step. Based on what was reached, the path is at minimum 6–7 clicks (open Mappings → expand set → expand outcome → select sub-outcome → switch to Activities → select/create activity → set level), plausibly more.

Bulk mapping tools: I found a **Course Mapping Grid Report** (see Section 5) that can be organized by Course Learning Outcome or by Module, with an "Include Suboutcomes" toggle — this reads as a bulk mapping-status *export*, not an in-app bulk-*edit* surface. I found no matrix-style bulk-edit grid, drag-to-map control, copy-mappings-from-another-course tool, or CSV import in the screens reached. **This should be treated as unverified rather than confirmed absent** — those tools may exist behind Integrations or another admin panel not explored in this session.

---

## 5. Reports

Full list of named report templates found under the course-level "Reports and Data" panel:

- Connections in Mapping Cascades
- Course Activity Report
- Course Alignment Report
- Course Learning Design Report
- Course LO Report
- Course Mapping Grid Report
- Course Outcomes Report
- Course Summary Report
- Course Tuning Report
- Mapping Cascades Report
- Module to CLO Report
- Plan for Module
- Syllabus Report

Plus a "Custom Report" builder, a "Help me choose…" wizard, and separate "Generate API request string" and "Export" utilities.

Only the **Course Mapping Grid Report** was opened in detail. Its own description text states: *"This report is commonly used by program chairs and curriculum committees to communicate what percent of a course aligns with a particular outcome set. It is commonly used for course reviews and accreditation audits."* This is the report most directly aligned with HLC accreditation use. Its configuration options: choose one outcome set; "Include Suboutcomes" checkbox; "Organize report by" — Course Learning Outcome or Module; "Report options" — Include LO IDs, Include LO Scales; "Report mode" — Detailed or Compact. **Export formats offered: RTF, PDF, HTML.**

I did not generate/download an actual report file in this session, so the exact rendered columns/visuals of the output are **unverified** — the configuration panel and its description text are the evidence gathered.

---

## 6. Roles & permissions

Two distinct scopes were observed:

**Institution-wide (Admin → Users):** a "Highest Role" column with at least "manager", "editor", and "commenter" values observed across the sampled roster (I did not confirm whether "viewer" or "none" also appear as a Highest Role at this scope specifically — unverified). A "User Type" column showed "normal" for every sampled row, implying at least one other user type exists that wasn't observed in the sample. Users can be added singly ("Add User") or in bulk ("Add Multiple Users"), exported ("Export Users"), reassigned in bulk ("Batch Assign"), and deactivated.

**Course-level ("Course Team" panel):** five discrete roles — **manager, editor, commenter, viewer, none** (used to revoke access) — assigned per person via "Grant Access" / "Change Role." A small branching-style icon next to each row likely distinguishes directly-assigned versus inherited access, though its exact meaning was not confirmed by hovering/reading a tooltip. Critically, the interface explicitly refused to let me downgrade a person whose access was "inheriting equal or higher access rights from a higher structural level in Coursetune" — confirming role inheritance flows down Institution → Division → Program → Course.

**A separate, narrower permission** exists at the institution level: "Outcome Permissions" allows up to three named users to be granted rights to edit Organization-Level Outcomes specifically, independent of the five course-team roles above.

The **"Admin"** badge shown next to the logged-in user's name in the top bar is a distinct, apparently org-scope designation, separate from the five course-team roles — it granted access to Customizations, Users, and other institution-wide settings panels. Its exact rights boundary beyond what was directly exercised in this session is not fully confirmed.

Net: CourseTune's role model is **admin (org) + manager/editor/commenter/viewer/none (course, inheritable)** — a five-tier course-scoped model plus a separate org-level outcome-editor allowlist, considerably more granular than a flat admin/editor/viewer trio.

---

## 7. Gap list

| CourseTune capability | Our system has it? | Worth adopting for one-department MVP? | Reason |
|---|---|---|---|
| Separate Program layer between Department and Course | No | **Yes** | FHSU's admins already think in terms of "which degree does this course belong to," distinct from department; without this layer we can't group multiple courses under one degree the way the source system — and likely our own stakeholders — expect. |
| Configurable, swappable mastery scale per outcome set (10+ presets + custom builder) | No (fixed 3-level enum) | **No** | High admin-UI cost for a solo developer; a fixed Introduced/Reinforced/Mastered enum is defensible for a single-department pilot and can be generalized later if needed. |
| Decimal + letter hierarchical outcome numbering (`1` → `1.1` → `1.1e`) with per-leaf mapped/unmapped status | Partial (flat outcome list) | **Yes, partially** | Even a two-level (outcome → sub-outcome) structure with a visible mapped/unmapped indicator would materially improve coverage-matrix accuracy without full multi-level nesting. |
| Per-module, typed activity library, auto-seeded per module (e.g., "Module 1 Discussion"), with an assessment Yes/No flag and an outcome-count field | Partial (learning_activity/assessment type only) | **Yes** | The "spans N learning objectives" counter and free-text description are inexpensive fields that directly strengthen the coverage/rigidity reports we already plan to build. |
| Five-tier course-scoped role model with inheritance from parent levels | No (3-tier flat: admin/editor/viewer) | **Partial** | A "commenter" role (read + comment, no edit) is low-cost and useful for faculty review cycles; full multi-level inheritance logic is not worth building for a one-department MVP. |
| Purpose-built accreditation report (Course Mapping Grid Report), exportable RTF/PDF/HTML, with organize-by and detailed/compact toggles | Partial (we plan coverage matrix, rigidity audit, orphan/dead-end reports) | **Yes** | HLC audits specifically want "percent of course aligned to an outcome set" output; framing our existing coverage matrix this way and adding an export format is mostly a labeling/export task, not new engineering. |
| Global multi-scope, multi-type search (scope: this course/program/division/institution; type filters across Divisions, Programs, Courses, COs, Bundles, Learning Obj., Outcomes, Activities, etc.) | No | **Partial** | A single search box with a "this course" vs. "everywhere" scope toggle covers most of the value at one-department scale; the full type-filter matrix is more than an MVP needs. |
| Org-level "Outcome Permissions" allowlist (max 3 editors for institution-level outcomes) | No | **No** | Multi-college governance feature; not relevant at single-department MVP scale. |
| Course Tasks / Completed Tasks checklist widget | No | **No** | Workflow polish, not core to mapping or reporting; defer past MVP. |
| Bulk mapping tools (matrix edit, CSV import, copy-mappings-from-course) | Unknown for CourseTune itself — not confirmed present or absent in this review | **Yes, if buildable** | Bulk mapping is consistently the biggest time-sink editors report in curriculum-mapping tools generally; worth prioritizing on our side even though I could not confirm CourseTune's own implementation. |

---

## 8. Layout lessons

1. Show a live child-count badge on every parent node ("15 Courses", "2 Programs") so users know what's inside before drilling in — implement as a small pill under the node label.
2. Make the zoom-in affordance a single small circular "+" icon that appears directly over a node on hover/selection, rather than relying on double-click — double-click was unreliable in testing, and a visible target removes ambiguity about how to drill down.
3. Keep a persistent level rail (Institution/Division/Program/Course) pinned to the left edge at all times, with the current level always highlighted, so users can tell their zoom depth without reading header text.
4. Add a separate "Layers" toggle beside the level rail (e.g., outcomes view vs. modules view) so the same physical position on the canvas can show either dimension without a full navigation change — this cleanly separates "where am I in the hierarchy" from "what am I looking at."
5. Render outcome/activity satellite labels as short truncated fragments around the parent node, with a details panel for the full text on selection — keeps the graph legible at a glance even with 10+ satellites.
6. When an outcome (or activity) is selected in a side-panel tree, immediately highlight every matching node on the canvas with a distinct border, with no extra click required — this was the single most useful "show coverage at a glance" interaction found, and is cheap to implement given our existing Mapping model.
7. Give every entity type (course, module, outcome, sub-outcome, activity) a collapsible "Description of X" panel with the same three-field pattern (Title, Description, ID) pinned to the bottom of the right rail — this consistency meant the UI never had to be relearned moving between entity types.
8. Auto-seed one placeholder activity per module per common type (e.g., "Module 1 Discussion") so the activity list is never empty and editors edit in place rather than create from scratch — lowers the activation energy for first-pass mapping.
9. Render an empty description field as the literal text "(empty)" rather than hiding the field — keeps it visibly present and editable instead of looking unsupported.
10. Use one global search with an explicit scope selector (this course / this program / this division / everywhere) instead of separate per-screen search boxes — reduces the number of navigation steps needed just to locate one course or outcome by keyword.

### Top 3 changes for our current graph + sidebar layout

1. **Add a Program layer between Department and Course** in our node hierarchy — the most structurally significant gap found, and it affects both the data model and the UI.
2. **Add live child-count badges to every parent card/node** — the cheapest, highest-legibility win observed in this review.
3. **Make "select an outcome → highlight every mapped node" the core coverage-at-a-glance interaction**, layered on top of (not replacing) our planned coverage-matrix report — it is the single most information-dense, lowest-friction pattern FHSU's tool relies on.

---

### Items flagged unverified in this review (worth a follow-up pass)

- Green/gold ring-segment coloring for activities vs. assessments — not observed anywhere in the screens reached.
- Contents of the "c-layer" and "bundle layer" for a course.
- The exact control/click sequence to set a mastery level against a specific module or activity (as opposed to just selecting an outcome).
- Rendered output (columns/visuals) of any report — only the configuration panel for the Course Mapping Grid Report was reviewed; no report was generated.
- Full enumeration of "Highest Role" and "User Type" values at the institution-wide Users scope.
- Presence or absence of a true bulk-edit mapping grid, CSV import, or copy-mappings-from-course tool.
- Which screens/interactions FHSU users actually use most (no usage analytics were surfaced in this session).
