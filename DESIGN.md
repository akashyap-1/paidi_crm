---
name: PAIDI CRM
description: An outreach pipeline charted like a river, where stage counts are soundings and drop-off is water getting deeper.
colors:
  magenta: "#b4186e"
  magenta-dark: "#951259"
  magenta-tint: "#f4dbe7"
  depth-1: "#cfe3ee"
  depth-2: "#afcfe1"
  depth-3: "#8fbad3"
  depth-4: "#74a5c6"
  depth-5: "#6399c0"
  depth-6: "#38729b"
  depth-7: "#2c6089"
  depth-8: "#1f4e79"
  on-depth: "#fffaeb"
  green: "#4f7f63"
  green-tint: "#dcead9"
  amber: "#8a5a0b"
  amber-tint: "#f3e2b4"
  buff: "#f4ebd0"
  card: "#fcf8ec"
  field: "#fffdf6"
  lane: "#ede3c6"
  sand: "#e7dcbb"
  line: "#ded3b3"
  line-strong: "#cbbf9b"
  navy: "#12283b"
  navy-soft: "#24405a"
  mute: "#4d5f6d"
  rail-text: "#c9d6df"
typography:
  display:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  label:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  meta:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  stage-name:
    fontFamily: "Figtree Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  slot: "3px"
  control: "10px"
  board-card: "11px"
  inset: "12px"
  card: "14px"
  strip: "16px"
  sheet: "20px"
  pill: "999px"
spacing:
  hair: "4px"
  tight: "6px"
  gap: "8px"
  pad: "12px"
  gutter: "16px"
  section: "20px"
  page: "28px"
components:
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-hover:
    backgroundColor: "{colors.field}"
  button-primary:
    backgroundColor: "{colors.magenta}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.magenta-dark}"
  button-navy:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.buff}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "36px"
  button-navy-hover:
    backgroundColor: "{colors.navy-soft}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
  button-ghost-hover:
    backgroundColor: "{colors.sand}"
  button-sm:
    padding: "0 10px"
    height: "30px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "38px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.navy}"
    rounded: "{rounded.card}"
  board-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.navy}"
    rounded: "{rounded.board-card}"
    padding: "8px 10px"
  lane:
    backgroundColor: "{colors.lane}"
    rounded: "{rounded.card}"
  chip:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.navy}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "22px"
  chip-alert:
    backgroundColor: "{colors.magenta-tint}"
    textColor: "{colors.magenta-dark}"
  chip-good:
    backgroundColor: "{colors.green-tint}"
    textColor: "#2f5a41"
  chip-warn:
    backgroundColor: "{colors.amber-tint}"
    textColor: "#5c3c05"
  tabs:
    backgroundColor: "{colors.lane}"
    rounded: "{rounded.inset}"
    padding: "4px"
  tab-selected:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.buff}"
    rounded: "9px"
    height: "32px"
  rail:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.rail-text}"
    width: "232px"
  rail-item-active:
    backgroundColor: "{colors.buff}"
    textColor: "{colors.navy}"
    rounded: "{rounded.control}"
    height: "36px"
  table-header:
    backgroundColor: "{colors.lane}"
    textColor: "{colors.mute}"
    height: "36px"
  depth-segment:
    backgroundColor: "{colors.depth-1}"
    textColor: "{colors.navy}"
    typography: "{typography.display}"
    height: "108px"
  conversion-pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.navy}"
    rounded: "{rounded.pill}"
    padding: "6px 10px"
  conversion-pill-weakest:
    backgroundColor: "{colors.magenta}"
    textColor: "#ffffff"
  sheet:
    backgroundColor: "{colors.buff}"
    rounded: "{rounded.sheet}"
    width: "480px"
  toast:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.buff}"
    rounded: "{rounded.inset}"
    padding: "10px 16px"
---

# Design System: PAIDI CRM

## Overview

**Creative North Star: "The River Chart"**

The pipeline is drawn the way a navigation chart draws a river. The ground is chart buff, the frame is deep-water navy, and the eight pipeline stages run from pale shallows to deep channel in a single blue ramp. A stage count is a sounding, set large; the share that went on to the next stage sits on the boundary between two depths; the place where the most prospects are lost is marked in chart magenta, the one colour that does not belong to the water.

The chart was softened on the user's steer ("softer and more warm, keep the blues and beige, homier"), and the build carries that everywhere: corners of 10 to 20px, warm hairlines a few steps darker than the paper instead of navy outlines, low navy-tinted shadows, and one rounded humanist sans. It is an operating tool for three people, so density is high (14px body, 36px controls, 40px table rows) but nothing is grey, white or cold. There is no pure white surface and no neutral grey anywhere in the build.

The system refuses the grey screen with white cards and one blue accent. Blue here is not an accent; it is the data.

**Key Characteristics:**
- Warm paper in four close steps (buff, card, lane, sand) with a single navy for ink, rail and the selected state.
- An eight-step depth-blue ramp that always means pipeline stage, in order.
- Magenta reserved for the primary action and for trouble: the weakest step, overdue follow-ups, errors, items waiting on review.
- One family, Figtree, with tabular figures on by default; hierarchy comes from weight and size.
- Domain facts drawn as fixed marks: fit is dot size, the 3-touch cadence is three slots.
- Motion is nearly absent: 150ms state changes, one settle on the soundings, a lifted card while dragging.

## Colors

Chart paper, deep water and one alarm ink: warm buffs for every surface, a blue ramp for the stages, magenta for what needs a hand.

### Primary
- **Chart Magenta** (`magenta`): the primary action on a screen (Add prospect, Log a touch, Send sign-in link, the round Log button in the phone bar), the weakest-step pill on the depth strip, the review-queue count badge, the text caret, and the invalid-field border. White text sits on it.
- **Deep Magenta** (`magenta-dark`): hover for the primary button, and the text colour on magenta tint (overdue chips, error notes, overdue dates in the table, the error toast ground).
- **Magenta Wash** (`magenta-tint`): ground for "Follow-up due" chips, error notes, inline delete confirmations, and the weakest-step banner on the funnel dashboard.

### Secondary
- **Shallows to Channel** (`depth-1` to `depth-8`): one step per funnel stage, in order: Researched, Contacted, Followed up, Responded, Call held, Proposal sent, Pilot, Client. Used as the segment fill on the depth strip, the 7px band at the head of each lane, stage chips, the stage select in the table, and the funnel bars on the dashboard. Steps 1 to 5 carry navy text; steps 6 to 8 carry warm cream (`on-depth`).
- The same blues are also the system's cool working family outside the ramp: step 7 is the focus ring, the focused input border, and the border of an active filter; step 1 is the ground of an active filter or date preset; step 2 is the avatar ground and the text selection; step 8 is the link colour and the filled fit dot.

### Tertiary
- **Intertidal Green** (`green`, `green-tint`): done and replied. Filled touch slots turn green once the prospect has replied; the good chip uses the tint.
- **Chart Ochre** (`amber`, `amber-tint`): waiting and caution. The Nurture side state, the warn chip, and the "Demo data" marker.

### Neutral
- **Chart Buff** (`buff`): the page ground and the sheet ground; also the text colour on navy.
- **Card Buff** (`card`): cards, default buttons, board cards, the phone tab bar, conversion pills.
- **Field Paper** (`field`): input ground, a shade lighter than card so a field reads as writable. Button and table-row hover land within a hair of it.
- **Lane Buff** (`lane`): the recessed step. Board lanes, table header, the tabs track, the icon disc on timeline entries, call-intel blocks.
- **Sand** (`sand`): the plain chip, ghost-button hover, hover on an unselected tab.
- **Warm Hairline** (`line`): every resting border and divider. Hover and dashed empty-state borders step up to `line-strong`.
- **Deep-Water Navy** (`navy`): ink, the side rail, the phone top bar, the selected tab, the navy button, the default toast, filled touch slots, and the 35% scrim behind sheets. `navy-soft` is its hover and the rail's inner dividers.
- **Slate Mute** (`mute`): secondary text, table headers, counts, timestamps. The Lost side state is mute text on a darker buff.
- **Rail Text** (`rail-text`): resting nav labels on navy.

### Named Rules
**The Stage Owns Its Step Rule.** A stage always wears its own depth step, everywhere it appears: strip, lane band, chip, table select, funnel bar. The ramp is never reordered, never shortened, and never spent as a set of categorical colours for anything that is not a stage.

**The Magenta Means Act Rule.** Magenta marks the one thing to do or the thing that is wrong. It is never a decoration, a brand wash, or a hover tint on something neutral.

**The Warm Ground Rule.** No pure white and no neutral grey. The lightest surface is field paper; every neutral leans toward buff or toward navy.

## Typography

**Display Font:** Figtree Variable (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Figtree Variable, the same family

**Character:** One rounded humanist sans does everything. It is friendly at 14px and firm at 44px bold, which is what lets a dense tool feel homely. Tabular figures are switched on at the root, so every count, date and percentage aligns.

### Hierarchy
- **Display** (700, 44px desktop and 32px on phones, line-height 1, -0.02em): the sounding figures on the depth strip, and the one statement on the sign-in panel (line-height 1.05).
- **Headline** (700, 26px, line-height 1.15, -0.015em): the page title, one per screen.
- **Title** (700, 16px, -0.005em): section and card headings, empty-state titles; 18px in sheet headers. Lane headings and the depth-profile heading drop to 13 to 13.5px bold.
- **Body** (400, 14px, line-height 1.45): everything else. Tables run at 13.5px; board cards at 12.5 to 13.5px. Explanatory text is capped near 46ch.
- **Label** (600, 13px): field labels, small buttons, tabs (13.5px), chips (12px, 600).
- **Meta** (400, 12.5px, mute): hints, timestamps, counts, table headers (12.5px, 700).
- **Stage name** (500 italic, 13.5px desktop and 12.5px on phones): the stage names under the soundings on the depth strip. This is the only italic in the build.

### Named Rules
**The One Family Rule.** Figtree only. Hierarchy comes from weight (400, 500, 600, 700) and size; there is no second face, no monospace, and no uppercase label style. Text is sentence case throughout.

**The Sounding Rule.** The largest type on a working screen is a number that answers "how many are here". Prose never gets display size inside the signed-in app.

**The Italic Is The River Rule.** Italic is reserved for stage names on the depth strip, the way a chart letters water features.

## Layout

A fixed navy side rail (232px, sticky, full height) with the content column beside it, capped at 1480px and centred, with 28px side padding and 24px top padding from the `lg` breakpoint (1024px). Each screen opens with one header row: page title, optional tabs, and the primary action pushed to the right. Controls that change the data sit in their own wrapping row directly under the header and above the thing they change.

Spacing runs on a 4px base. In practice: 4 to 6px inside compact marks and between cards in a lane, 8px between controls and between lanes, 12px for cell and control padding, 16px for phone gutters and list rows, 20px between page sections and inside sheets, 28px for the desktop page gutter.

The pipeline board is the reference composition. From 1400px the eight funnel lanes form an eight-column grid directly under the eight strip segments, and Nurture and Lost take a second row, half width each. Below 1400px the lanes scroll sideways at a minimum of 168px each; on phones a lane is 78vw with scroll snapping.

Below `lg` the rail is replaced by a 56px navy top bar (wordmark and the primary action) and a six-slot bottom bar on card buff: Home, Pipeline, a raised magenta Log button, Tasks, Review, More. Content gets 16px gutters and 112px bottom padding to clear the bar. The depth strip folds from one row of eight to a 4 by 2 grid with conversions under each stage name. Filter selects fold behind one Filters control below `sm` (640px). Sheets are right-side panels (480px, or 640px wide) from `sm` and bottom sheets up to 92dvh below it.

Tables scroll sideways inside their card below a 980px minimum width, with a sticky header.

## Elevation & Depth

A hybrid, mostly tonal. Depth is first carried by the paper steps: lanes and table headers are recessed (lane buff), cards sit on the ground one step lighter, fields one step lighter again. Shadows are low, soft, and tinted with navy, never black; their job is to say "this is an object you can pick up" or "this floats above the page".

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 2px rgb(18 40 59 / 0.05), 0 6px 16px -8px rgb(18 40 59 / 0.16)`): resting cards, the selected tab, conversion pills, the folded depth strip on phones, and a board card on hover.
- **Lift** (`box-shadow: 0 2px 4px rgb(18 40 59 / 0.08), 0 18px 32px -12px rgb(18 40 59 / 0.32)`): things off the page plane: the card being dragged (also rotated 1.5 degrees), sheets, toasts.
- **Field focus** (`box-shadow: 0 0 0 3px rgb(63 124 166 / 0.22)` with a `depth-7` border): the focused input.
- **Selected segment** (`box-shadow: inset 0 0 0 3px var(--color-navy)`): the strip segment currently filtering the board; the other segments drop to 60% opacity.
- **Drop target** (`box-shadow: inset 0 0 0 2px var(--color-depth-7)`): the lane a dragged card is over.

### Named Rules
**The Flat Board Rule.** Board cards are flat with a hairline at rest. Soft shadow arrives on hover; lift arrives only while a card is in the hand.

**The Inset Ring Rule.** Selection and drop state are drawn as inset rings, so nothing changes size and neighbours do not shift.

## Shapes

Rounded and soft, with radius growing with the size of the object: 3px for touch slots and chart bar ends, 10px for controls (buttons, inputs, rail items, inline notes), 11px for board cards, 12px for the tabs track, toasts and inset notes, 14px for cards, lanes and empty states, 16px for the depth strip, 20px for the leading corners of a sheet. Chips, pills, avatars, badges and the fit dot are fully round.

Borders are 1px warm hairlines. Dashed borders mean "nothing here yet": empty states, the unassigned avatar, the unscored fit dot. Stage is shown by a 7px band of the stage colour across the full top of a lane, clipped by the lane's own rounding. Segments of the depth strip butt against each other with no gaps on desktop, so the strip reads as one body of water; only its outer corners are rounded.

Icons are 15 to 19px outline icons at 2px stroke, always paired with a text label in navigation.

## Components

### Buttons
Calm and tactile: paper buttons with a hairline, and one magenta button that is clearly the thing to press.
- **Shape:** 10px radius, 36px tall, 14px side padding, 14px semibold, 6px gap to a leading icon. Small is 30px tall with 10px padding at 13px. Icon-only is square.
- **Default:** card buff ground, warm hairline, navy text. Hover lightens the ground and deepens the hairline.
- **Primary:** chart magenta with white text; hover goes to deep magenta. One per screen header.
- **Navy:** navy ground with buff text, for the confirming action inside a sheet or confirmation (Mark as Lost, Delete, Sign out).
- **Ghost:** no ground or border; sand on hover. Used for Close, Clear filters, and card-level Edit and Add.
- **On the rail:** a navy-soft button that turns `depth-7` on hover (Log a touch).
- **States:** press shifts the button down 1px; disabled is 55% opacity; transitions are 150ms on the system ease-out. An active toggle (date preset, Filters with filters applied) takes a `depth-7` border on a `depth-1` ground.

### Chips
- **Style:** fully round, 22px tall, 9px side padding, 12px semibold, no border. A compact 19px form at 11px is used inside board cards and timeline rows.
- **Variants:** plain (sand, navy text) for neutral facts such as "Automatic", "From Gmail", "Do not contact"; alert (magenta wash, deep magenta text) for "Follow-up due"; good (green tint); warn (ochre tint) for "Demo data".
- **Stage chip:** the same shape on the stage's own depth step. In the table it is a native select styled as the chip, so the stage can be changed in place.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** card buff on the buff ground.
- **Shadow Strategy:** soft at rest (see Elevation & Depth).
- **Border:** 1px warm hairline.
- **Internal Padding:** 16px, with list rows inside a card separated by a hairline rather than nested cards.
- **Empty state:** no fill, a dashed stronger hairline, 14px radius, a title, one sentence capped at 46ch, and at most one action.
- **Error note:** magenta wash with a 30% magenta border and deep magenta text, 12px radius.

### Inputs / Fields
- **Style:** 38px tall (36px in filter rows), 10px radius, field paper ground, warm hairline, 12px side padding. Textareas start at 84px. Labels are 13px semibold above the field; hints are 12.5px mute below.
- **Focus:** the border turns `depth-7` with a 3px translucent blue ring. The caret is magenta. Everything else focusable gets a 2px `depth-7` outline offset 2px.
- **Error:** magenta border, with the message in deep magenta where the hint was.
- **Active filter:** a select holding a value takes the `depth-7` border and `depth-1` ground, so applied filters are visible at a glance.

### Navigation
- **Rail (from 1024px):** navy, 232px. The wordmark is set in type (20px bold, 0.04em tracking, buff). Nine items, 36px tall, 10px radius, 14px medium in rail text with a 17px icon. Hover is navy-soft with buff text; the active item inverts to a buff ground with bold navy text. A count badge is a small magenta pill at the right edge. The signed-in user sits at the foot above a navy-soft divider.
- **Phone:** navy top bar with the wordmark and a small primary button; a card-buff bottom bar with a top hairline, 11px semibold labels under 19px icons, navy when active and mute at rest, and a raised round magenta Log button in the middle slot.
- **Tabs:** a lane-buff track (12px radius, 4px inset) holding 32px segments (9px radius, 13.5px semibold). The selected segment is navy with buff text and a soft shadow; others are navy text with a sand hover.
- **Links:** `depth-8` semibold, underlined in `depth-3` with a 3px offset; the underline takes the text colour on hover.

### Sheets and Toasts
- **Sheet:** the system's only overlay. Buff ground, lift shadow, a 35% navy scrim, a header with an 18px title and a ghost close button, a scrolling body, and a right-aligned footer with the default button before the confirming one. It enters in 260ms: sliding 24px from the right on desktop, 16px up from the bottom on phones. Escape and the scrim close it; focus returns to where it came from.
- **Toast:** a navy bar (12px radius) with buff text and the lift shadow, centred at the bottom. Errors use deep magenta. A toast may carry one underlined action, which is how every stage move offers Undo.

### Table
A dense register inside a card: 13.5px text, 40px rows, a sticky 36px header on lane buff in 12.5px bold mute, row dividers lighter than the hairline, a paper-light row hover, and right-aligned numeric columns. Sortable headers are buttons with a 12px arrow on the active column.

### Depth Strip (signature)
Eight segments in the eight depth steps, each 108px tall on desktop with the sounding figure and the italic stage name centred. Between each pair of segments a round pill straddles the boundary, carrying the share that went on to the next stage at 16px bold. The weakest step's pill is magenta with a small "Weakest step" tag above it. Each segment is a toggle that filters the board and table to that stage: the selected one gets the inset navy ring and the rest dim. When a count changes the figure settles in over 420ms (6px rise, fading up); it does not play on first load. On phones the strip becomes a 4 by 2 rounded block with the conversion under each name.

### Board Lane and Prospect Card
- **Lane:** lane buff, 14px radius, a 7px stage band across the top, then a 13px bold stage name with a mute count. An empty lane says where to drop.
- **Card:** card buff, 11px radius, hairline, 8px by 10px padding. Company name in 13.5px bold, contact with the owner's avatar, then industry and headcount in mute. A hairline foot carries the fit dot, the touch slots, and the time since last touch. Overdue cards lead with the alert chip and sort to the top of the lane.

### Domain Marks
- **Fit dot:** a `depth-8` dot whose diameter steps from 6 to 14px for fit 1 to 5, centred in a fixed 14px box so rows stay aligned. Unscored is a dashed mute ring.
- **Touch slots:** three 9px squares with 3px corners. Empty is a slate outline, used is filled navy, and all used slots turn green once the prospect has replied.
- **Avatar:** a round `depth-2` disc with the member's initial in bold navy; unassigned is a dashed mute ring with a question mark.
- **Timeline row:** a 28px lane-buff disc with an icon for a logged touch; stage moves are lighter rows with a bare mute icon, so human contact outweighs bookkeeping.

## Do's and Don'ts

### Do:
- **Do** give each stage its own depth step wherever it appears, in funnel order, with navy text on steps 1 to 5 and warm cream on steps 6 to 8.
- **Do** keep every surface in the buff family: buff ground, card buff objects, lane buff recesses, field paper inputs.
- **Do** use magenta for the primary action and for trouble (weakest step, overdue, error, awaiting review), and nothing else.
- **Do** draw borders as 1px warm hairlines and show selection or drop state with an inset ring.
- **Do** set counts as the largest type on a working screen, in bold Figtree with tabular figures.
- **Do** keep radii in the family already shipped: 10px controls, 14px cards and lanes, 16px strip, 20px sheet corners, fully round chips.
- **Do** put the controls that change a figure directly above that figure, and fold them behind one control on phones.
- **Do** use a side sheet on desktop and a bottom sheet on phones for every create, edit and confirm flow.
- **Do** offer Undo in the toast for any change that can be reversed.
- **Do** draw fit as dot size and cadence as three slots; add the number beside the mark only where there is room.
- **Do** honour reduced motion; all transitions and the two keyframes collapse when it is set.

### Don't:
- **Don't** build the grey screen with white cards and one blue accent. Blue is the stage data here, not an accent.
- **Don't** use pure white or neutral grey for any surface, border or text.
- **Don't** put hard navy outlines around containers; the user asked for softer and warmer. Navy lines are reserved for the selected strip segment and filled touch slots.
- **Don't** reorder the depth ramp, skip steps, or reuse it as a categorical palette for non-stage data.
- **Don't** use magenta decoratively or for a neutral hover.
- **Don't** add a second typeface, a monospace, or uppercase tracked labels.
- **Don't** use italic outside the stage names on the depth strip.
- **Don't** use black or neutral shadows; shadows are navy-tinted, low, and only the two shipped strengths.
- **Don't** nest cards inside cards; divide rows inside a card with a hairline.
- **Don't** animate beyond 150ms state transitions, the sheet entrance, the figure settle, and the lifted drag card.
