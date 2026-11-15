---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# PAIDI CRM app shell and all working screens

Scope: the whole signed-in app (Home, Pipeline board and table, Company and Contact detail with timeline, Tasks, Templates, Review queue, Dashboards, Settings, CSV import) and the login screen. Mode: Operate.

Audience and job: Advik, Neel and Raphy. Laptop for prospecting, pipeline and dashboards; phone to log a call right after hanging up. Most frequent action: add a prospect with its research hook. Sample data only until real data is imported.

User steer on the chosen direction (their words): "make the ui softer and more warm, keep the colors tho the blues and beige looks good js make it softer and homier".

## Direction contract

THESIS: The pipeline is charted like a river: stage counts are soundings and drop-off is water getting deeper. Refuses the grey screen with white cards and one blue accent.

OWN-WORLD: Chart buff ground (#F4EBD0) with lighter buff cards, deep-water navy rail and ink (#12283B), an eight-step depth-blue ramp from #CFE3EE to #1F4E79 owned by the eight stages everywhere they appear, chart magenta (#B4186E) for the primary action, the weakest step and anything overdue, intertidal green (#4F7F63) for done. Softened per the steer: 10 to 14px radii, no hard navy outlines, warm hairlines, low soft shadows, a rounder humanist sans (Figtree) with tabular figures, italic stage names in the depth strip. Fit is dot size on a fixed five-step ramp; the 3-touch cadence is three fixed slots.

STORY: The visitor sees where prospects sit and where they drop out, opens a prospect, and logs the next touch or adds a new prospect in a few fields.

FIRST VIEWPORT: Navy side rail 232px (brand, nine nav items, signed-in user). Top bar: page title, Board/Table tabs, filter selects, search, magenta "Add prospect". Under it the depth profile strip across the content width: eight segments deepening in blue, each a large sounding figure with the stage name, conversion pills between segments, the weakest step in magenta. Below, the kanban: eight lanes, each headed by a band in its stage blue, cards with company, contact, industry and size, fit dot, touch slots, last touch, owner.

FORM: River navigation chart, position 7 of 7 on the grounded list. seed:bbe5320c5ba593bc. Signature interaction: dragging a card across lanes updates the depth strip counts and conversions in place; clicking a strip segment filters the board and table to that stage. Motion: one settle on the strip figures when counts change; drag uses a lifted card; nothing else animates beyond 150ms state transitions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- No logo or brand assets exist; the brand is set in type.

## Recorded deviations

- Filters and search sit in their own row above the depth strip, not in the top bar: five selects plus search do not fit beside the title at laptop width, and they belong above the strip whose figures they change. On phones the selects fold behind one Filters control.
- The eight lanes align under the strip segments from 1400px wide; narrower screens scroll the board sideways with 168px lanes so cards stay legible.
- Add prospect opens with five fields (company, website, hook, contact name, contact email); everything else is behind More details.
