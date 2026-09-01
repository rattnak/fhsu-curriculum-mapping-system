# Prompt: CourseTune Layout Review for the FHSU Curriculum Mapping System

Copy everything below the line into Claude Cowork (attach CourseTune screenshots
or grant it screen/browser access to FHSU's CourseTune instance first).

---

You are reviewing **CourseTune as deployed at Fort Hays State University (FHSU)**
so we can transfer its proven layout/workflow ideas into our self-hosted
replacement. Our system already exists — do not design from scratch. It has:

- A pan/zoom node-graph (institution → college → department → course → module),
  cards expanding left-to-right on click, per-college/department filter bars,
  and a right details sidebar
- A data model of: Node (hierarchy), Course, Outcome (institutional/program/
  course levels with parent links + HLC criterion tags), Activity
  (learning_activity | assessment), Mapping (course ↔ outcome ↔ activity with
  mastery_level Introduced/Reinforced/Mastered), scoped Users (admin/editor/viewer)
- Reports: coverage matrix (heatmap), rigidity audit, orphan/dead-end

**Walk through the FHSU CourseTune screens and produce a structured review:**

1. **Screen inventory** — every distinct view (curriculum wheel/map, course view,
   program view, taxonomy manager, reports, admin). For each: a one-line purpose,
   who uses it, and how often.
2. **The circle/ring visualization** — what exactly do the rings, ring segments,
   and colors (green learning activities, gold assessments) encode? What
   interactions exist (click, hover, toggle layers, zoom)? Which of these carry
   real information vs. decoration? What do FHSU users click most?
3. **Hierarchy & taxonomy semantics** — how does CourseTune structure FHSU's
   levels (institution, college, department, program, course, unit/module)?
   Where do *programs* (degrees/majors) sit relative to departments — is that a
   layer our node model is missing? How are outcome sets attached at each level,
   and what naming/numbering conventions does FHSU follow (the "university
   taxonomy format")? List the exact format rules you can infer so we can encode
   them as automated compliance checks.
4. **Mapping workflow** — the step-by-step flow an editor uses to map a course
   outcome to a program outcome and attach activities/assessments with a mastery
   level. Count the clicks. Note anything that makes bulk mapping fast (matrix
   edit views, drag, copy-from-course, CSV import).
5. **Reports** — which reports exist, what columns/visuals they use, which ones
   FHSU actually exports for HLC accreditation, and in what format.
6. **Roles & permissions** — what roles exist, at what scope they're granted,
   and what each can see/edit. Anything beyond our admin/editor/viewer trio?
7. **Gap list** — a prioritized table: CourseTune capability → does our system
   have it (yes/partial/no) → is it worth adopting for a one-department MVP
   (yes/no + one-line reason). Be opinionated; we are a solo-dev MVP, not a
   feature-parity clone.
8. **Layout lessons** — 5–10 concrete, transferable UI decisions (spacing,
   navigation, drill-down patterns, labeling, empty states) worth copying, each
   phrased as an implementable instruction (e.g., "show outcome counts as badges
   on the ring segment, revealed on hover").

**Output format:** a single markdown document with those 8 numbered sections,
tables where specified, no marketing language, no praise of CourseTune — only
observations and transferable decisions. Where a screenshot is ambiguous, say
"unverified" rather than guessing. End with the top 3 changes you would make to
our current graph+sidebar layout based on what FHSU users get from CourseTune.
