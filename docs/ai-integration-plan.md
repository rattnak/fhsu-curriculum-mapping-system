# Simplicity + AI Integration Plan
*Derived from `2026-08-31-coursetune-layout-review.md` (live FHSU CourseTune review). Goal: keep the solo-MVP simple while adding the AI capabilities that matter — module-organization recommendations and curated accreditation resources.*

---

## 1. What the review changes about our build (adopt / reject)

| Finding | Decision | Cost |
|---|---|---|
| **Program layer exists between Division and Course** (e.g., "MSE in Chemistry Program") | **Adopt.** Add `program` to the `NodeType` enum, insert program nodes between department and courses. Pure data change — the graph, tree query, search, and compliance all handle new node types already. | ~0.5 day |
| Mastery scales are configurable per outcome set (Nursing uses **IDM**, not IRM) | **Reject the admin UI; hedge the schema.** Keep one fixed 3-level scale for the pilot, but treat the level *labels* as one Python constant so a department pilot can rename I/R/M → I/D/M without a migration. Never hardcode "Introduced" in UI strings — read from the constant. | ~1 hour |
| Outcomes nest (`1` → `1.1` → `1.1e`) with per-leaf mapped/unmapped status | **Partially adopt.** Our `parent_outcome_id` already supports nesting; surface a mapped/unmapped indicator per outcome in the sidebar. Skip 3-deep numbering enforcement. | small |
| **Select outcome → highlight every mapped node on canvas** ("the single most information-dense interaction") | **Adopt.** When an outcome is clicked in the sidebar, highlight mapped course/module cards in the graph. We have all the data in `/node/{id}` responses. | ~0.5 day |
| Course Mapping Grid Report = the accreditation artifact ("% of course aligned to an outcome set", RTF/PDF/HTML) | **Adopt the framing, not the formats.** Add a "% aligned" summary line to our coverage matrix; print/PDF via the existing print pipeline covers export for the pilot. | small |
| 5-tier roles + inheritance, outcome-permissions allowlist, task checklists, level-name customization | **Reject for MVP** (review itself says so). Revisit "commenter" role only when faculty review cycles start. | 0 |
| Zoom affordance = visible "+" icon, not double-click; child-count badges; consistent Title/Description/ID panel | Already have equivalents (chevron + count badges + sidebar). Keep. | 0 |

**Simplicity rule going forward:** anything CourseTune makes admin-configurable, we make a code constant. Configurability is their moat and our time sink.

---

## 2. AI agent integration — three layers, cheapest first

The API is already agent-shaped (`/search`, `/node/{id}`, `/compliance/{id}`, OpenAPI at `/docs`). Build on that; do **not** build a chat UI.

### Layer 1 — Deterministic advisor (no LLM, free, testable)
`GET /advise/{course_node_id}` — rule-based module-organization lint, same shape as `/compliance`:

- **Bloom's level check**: classify each outcome's opening verb against the revised Bloom's taxonomy (Anderson & Krathwohl 2001) verb lists — remember/understand/apply/analyze/evaluate/create. Flags:
  - outcome verb level vs. mastery level mismatch (a "Mastered" outcome whose verb is *identify* = remember-level)
  - a course whose outcomes never rise above understand
  - non-measurable verbs (*know, understand, learn, appreciate*) in outcome text
- **Scaffolding check**: mastery levels should be non-decreasing across module order (Module 1 "Mastered" → Module 4 "Introduced" gets flagged)
- **Module shape check**: 3–8 modules per course; every module ≥1 learning activity + ≥1 assessment; assessment method named
- **Alignment check**: each assessment maps to ≥1 outcome; each outcome is assessed somewhere (not only "taught")

Verb lists are ~120 words of static data. This runs in the sidebar (an "Advise" button next to "Run compliance check") *and* is callable by any AI agent as a tool.

### Layer 2 — MCP server (makes Claude the chat UI)
A ~100-line FastMCP wrapper exposing five tools: `search_curriculum`, `get_node`, `check_compliance`, `advise_course`, `search_resources`. Then Claude Code / Claude.ai (via connector) becomes the conversational agent — "find the Pharmacology module, check its taxonomy compliance, and recommend a better module organization" works with zero frontend work. This is the whole "integrate with AI agent" story for the MVP.

### Layer 3 (optional, behind an env var) — LLM narrative
`POST /advise/{id}/narrative`: send the course's structured context + Layer-1 findings to the Claude API for a prose recommendation ("split Module 2; its 6 outcomes span three Bloom levels…"). Only worth it after Layers 1–2 prove out; costs API budget and needs output review before faculty see it.

---

## 3. Resource library ("share resources")

A small curated table — **not** live web search. Accreditation work wants stable, citable references.

`Resource: resource_id, title, url, source, tags (csv), blurb`

Seed set (all public, authoritative):

| Resource | Tags |
|---|---|
| Revised Bloom's Taxonomy (Anderson & Krathwohl) — Vanderbilt CFT guide | bloom, outcomes |
| Bloom's action-verb lists by level (measurable verbs) | bloom, outcomes, writing |
| HLC Criteria for Accreditation (esp. 3.A, 3.B, 4.B) — hlcommission.org | hlc, accreditation |
| HLC Assumed Practices | hlc, accreditation |
| NILOA — outcomes assessment resources | assessment |
| Quality Matters Higher-Ed Rubric (module/alignment standards 2, 3) | qm, module-design |
| FHSU TILT instructional design resources | fhsu, module-design |
| FHSU assessment / accreditation office pages | fhsu, hlc |

Surfaced three ways:
1. `GET /resources?q=&tag=` — searchable endpoint (and MCP tool)
2. **Contextual sidebar links**: a failed compliance/advise check names its tag → sidebar shows the matching 1–2 resources under the finding ("Non-measurable verb → *Bloom's action-verb lists*")
3. Agent answers "what does FHSU reference for accreditation?" from this table with real URLs instead of hallucinating

*(FHSU-specific URLs get confirmed by you before seeding — the two FHSU rows above are placeholders until then.)*

---

## 4. Build order (~1 week at 3–4h/day)

1. **Program layer** — enum + seed migration + `TYPE_META`/`TYPE_ORDER` entries (0.5d)
2. **Mastery-label constant** — de-hardcode I/R/M strings (1h)
3. **Resource table + `/resources` + seed + sidebar links** (0.5d)
4. **`/advise` rule engine** (Bloom verbs, scaffolding, module shape, alignment) + sidebar button (1–1.5d)
5. **MCP server** wrapping the five tools (0.5d)
6. **Outcome → highlight-mapped-nodes** interaction (0.5d)
7. *(later, optional)* LLM narrative endpoint

Items 1–6 are independent of each other except 4→5; any can be dropped without blocking the rest.

## 5. Explicitly not building
Chat UI in the frontend (MCP + Claude is the chat), live web search for resources, configurable mastery-scale admin, 5-tier roles/inheritance, multi-level outcome numbering enforcement, RTF export, c-layer/bundle concepts (unverified even in CourseTune).
