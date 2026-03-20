# Overprint — Mobile and Tablet Responsive UX Specification

## Overview

This specification defines how Overprint adapts from desktop to tablet to phone without regressing the desktop experience. The core constraint is that Overprint is a precision spatial editing tool — the canvas must always dominate the screen, and interactions must never feel like desktop-web-shrunk-to-mobile.

---

## 1. Responsive Breakpoints

Three tiers, based on physical device categories:

| Tier | Tailwind prefix | Width | Target devices |
|---|---|---|---|
| **Desktop** | (default / `lg:`) | >= 1024px | MacBook, Windows laptop, desktop monitor |
| **Tablet** | `md:` | 640px – 1023px | iPad (any), Android tablet, Surface |
| **Phone** | (base / `sm:`) | < 640px | iPhone, Android phone |

### Rationale for these thresholds

- iPad mini in landscape is 1024px wide — sits right at the desktop/tablet boundary. Accept it as desktop.
- iPad mini in portrait is 768px — firmly tablet tier.
- iPhone 15 Pro Max in landscape is 932px — treat as tablet (same panel strategy, more room to work).
- At < 640px, nothing that isn't the map should steal horizontal space.

### What changes at each tier

**Tablet (md):**
- Top toolbar collapses menu bar into a single hamburger/menu button; tool buttons become icon-only with tooltips
- Course panel becomes a slide-in drawer from the right edge (not floating)
- Description panel becomes a bottom sheet instead of a right sidebar
- Map settings panel collapses to a floating badge showing current scale; tap to expand
- Zoom controls move to bottom-left (away from panel triggers)
- Symbol picker becomes a full-width bottom sheet

**Phone (base):**
- Everything from tablet tier, plus:
- Toolbar reduces to logo + hamburger only; all tools move to a FAB cluster
- Bottom navigation bar replaces floating panel controls
- Description panel is full-screen modal
- No always-visible control list; control list shows as a bottom sheet on demand
- Course selector shows as a compact pill/badge, tap opens bottom sheet course list

---

## 2. Panel Management

### Desktop (unchanged)
- Course panel: `absolute right-4 top-4 w-56` floating panel — no change
- Description panel: `w-70` fixed right sidebar — no change
- Map settings: `absolute left-4 top-4` floating panel — no change

### Tablet

**Course panel — right drawer**

The `w-56` floating panel becomes a slide-in drawer that overlays the canvas from the right. Default state: closed. A persistent tab/handle sits at the right edge of the canvas showing the active course name and control count.

```
Canvas         | Drawer tab
               | "Course 1 · 12 controls" →
```

Tapping the tab slides in the drawer (translate-x animation, 240ms ease-out). The drawer occupies full viewport height minus the toolbar. Canvas is NOT pushed — the drawer overlaps it. A scrim overlay covers the canvas when the drawer is open, tapping the scrim closes it.

The drawer's internal layout is identical to the desktop Course panel, but with larger tap targets (minimum 44px row height, currently some rows are `py-1` which is too small).

**Description panel — bottom sheet**

When the user taps "Descriptions" in the toolbar (or via FAB on phone), the IOF description sheet rises from the bottom as a sheet. Default height: 50% of viewport. The sheet has a drag handle at the top centre — dragging up expands to ~85% (leaving room to see the map), dragging down collapses.

The sheet is independently scrollable. When a control is selected on the map, the sheet auto-scrolls to that row.

**Map settings — collapsed badge**

The map settings floating panel (`absolute left-4 top-4`) becomes a small badge showing only `1:15000` (the current scale). Tap opens the full settings panel as a small popover anchored to the badge. This badge sits below the toolbar, not above it, to avoid the toolbar area on tablets.

### Phone

**Course panel — bottom sheet (half-height)**

A persistent bottom navigation strip shows: active course name, control count, and a "Courses" button. Tapping opens the course list as a half-height bottom sheet. The sheet contains the full CourseList (with larger touch targets), then collapses again when a course is selected.

The control list within the selected course is accessible via a "Controls (12)" button in the bottom strip, opening another bottom sheet.

**Description panel — full-screen modal**

On phone, the description panel takes the full screen. Header shows "Descriptions — [Course name]" with a close button. The IOF grid is rendered at a larger cell size (see section 6).

---

## 3. Toolbar Redesign

### Desktop (current — unchanged)

```
[Overprint v0.9] [File][Edit][View][Insert][Help] | Event Name | [Pan][Add Control][Print Area] | [Descriptions]
```

### Tablet toolbar

```
[O] [≡ Menu ▾] | Event Name (truncated) | [↕ Pan][⊕ Add][⬚ Print] | [≡ Desc]
```

- Logo stays: `Overprint` with version hidden
- Single `Menu` dropdown replaces the 5-item menubar. All File/Edit/View/Insert/Help items live inside it, grouped by their current menu. Uses a single `FileMenu` component instance with all items merged.
- Tool buttons become icon-only with text labels below (or tooltip on hover). Use SVG icons for Pan (hand), Add Control (crosshair-circle), Set Print Area (crop), Descriptions (list).
- Tool buttons minimum 44×44px tap targets — currently `px-3 py-1.5` which measures roughly 36px tall. Change to `px-3 py-2.5` on tablet.
- Event name shows truncated to ~20 characters with ellipsis.

### Phone toolbar

```
[O] [Event Name...] [≡]
```

- Logo (O mark only, 28×28px)
- Event name (truncated, tap to edit — same inline edit behavior as desktop)
- Hamburger menu icon (all menus + tools inside)

All drawing tools move to a FAB cluster (see section 9).

---

## 4. Touch Interactions

### Current touch behavior (already works)
- Single-finger pan: works
- Pinch-to-zoom: works
- Tap to select control: works
- Drag control to move: works

### Missing touch behaviors to add

**Long-press on canvas (500ms) — context menu**

When the user long-presses on empty canvas in addControl mode, show a small action sheet with:
- "Add control here"
- "Cancel"

This is an alternative to the current "tap to add" which can be ambiguous (is the tap a pan or an add?). On touch, provide explicit confirmation for irreversible placement.

Implementation note: use a `touchstart` timer + `touchend` check. If touch moves more than 8px during the timer, cancel the long-press (it's a pan).

**Long-press on a control circle — control actions sheet**

Long-press on an existing control circle shows an action sheet:
- "Remove from course"
- "Change code"
- "Make crossing point" / "Make map exchange" (if applicable)
- "Cancel"

This replaces the desktop right-click context menu pattern that doesn't exist on touch.

**Swipe to dismiss panels**

Right-edge drawer: swipe right to close.
Bottom sheets: swipe down to close (track `touchmove` delta).

**Double-tap to fit map**

Double-tap on empty canvas area triggers fit-to-view. Currently only accessible via "Fit" button in zoom controls. Natural gesture for touch users.

### Tap target sizing

Current tap targets that are too small for touch:
- Course list rows: `py-1.5` ≈ 32px — needs 44px minimum. Change to `py-3` on tablet/phone.
- Control list up/down arrows: `px-1` — nearly untappable. Needs `px-3 py-2` minimum. Consider replacing with drag-to-reorder handles.
- Toolbar tool buttons: `py-1.5` — needs `py-2.5` on tablet.
- Zoom +/- buttons: `px-2 py-0.5` — needs `px-4 py-3`.
- Description cells: currently sized for mouse hover; on touch increase cell height.

---

## 5. Canvas Interaction on Touch

### Tool switching

On desktop, the Pan tool is a fallback (no tool active = pan). On touch, this ambiguity must be resolved explicitly.

**Tablet approach:**
- Default: pan is always active (single finger pans)
- When "Add Control" mode is active, single finger adds a control (not pans)
- A persistent mode indicator appears at the top of the canvas: `[+ Add Control mode] [Done]`. Tapping "Done" returns to pan mode.
- In add-control mode, two-finger gesture still pans (natural for orienteering tablet users who want to navigate the map while placing controls)

**Phone approach:**
- Pan is always the default gesture
- FAB shows a prominent "Add Control" button
- Tapping FAB "Add Control" enters placement mode — a crosshair-style aiming reticle appears at the centre of the canvas
- A large "Place here" button appears at the bottom of the screen
- User pans the map until the reticle is over the desired location, then taps "Place here"
- This avoids the precision-tap problem entirely on small screens

### Precision placement problem

On a 375px wide phone showing a 1:10000 map, a 5mm control circle is roughly 6–8 pixels on screen. Tapping to within 6 pixels on a touch device is not reliably precise.

**Solution: placement refinement UI**

After placing a control (either via tap or "Place here"), if the device is touch-only:
- The placed control temporarily shows a large drag handle (32px diameter)
- A position adjustment nudge pad appears as a floating control (like a D-pad):
  - Four arrow buttons (left/right/up/down), each moving the control by 1px on map at current zoom
  - A "Confirm" button to commit the position
  - A "Undo" button to remove the control
- This gives users a way to precisely fine-tune positions without needing sub-pixel touch accuracy

### Rubber-band preview on touch

The current rubber-band preview line (from last control to cursor) relies on mouse position. On touch:
- In the center-reticle placement mode (phone), draw the rubber-band from the last control to the reticle center
- On tablet tap-to-place, show a 300ms animated "pulse" on the placed control to confirm placement

---

## 6. Description Sheet on Mobile

The IOF 8-column grid is the hardest problem. At w-70 (280px), the grid is already tight on desktop. On a 375px phone in portrait, it cannot render at full width alongside anything else.

### Current grid

`grid-cols-[1.5rem_2rem_repeat(6,1fr)]` — 8 columns in ~260px usable space. Each of the 6 symbol columns is ~33px wide.

### Tablet approach — wider cells, larger touch targets

The description panel renders as a bottom sheet at 50% height. Within this, the grid width matches the full device width (up to 600px). This gives the 6 symbol columns ~65px each — large enough to tap.

Increase cell height from the current ~28px to 44px on tablet. The scroll area accommodates 10–15 controls without scrolling on most courses.

### Phone approach — column C-H as a swipeable card per control

On phone portrait (<640px), the 8-column IOF grid cannot render usably. Instead, render a card-based description editor:

**One row per control** in a scrollable vertical list. Each row shows:
- Control code and sequence number (left)
- A horizontal strip showing columns C-H as scrollable icon slots (scroll left/right within the strip)
- Tap any slot to open the symbol picker

This is a progressive disclosure pattern: the strip always shows the current symbols (or blank squares for empty columns), and users scroll horizontally within a row to reach columns F, G, H.

Alternative (simpler): render the grid with horizontal scroll on the entire sheet. Each column is 52px wide (minimum for a good tap target). Total width = 1.5rem + 2rem + 6×52px = ~356px. On a 375px phone this is nearly full-width and scrollable by ~20px. This is the simpler MVP approach.

### Symbol picker on mobile

Current: `fixed` positioned popover anchored below the tapped cell, `w-[250px]`.

On tablet: Convert to a bottom sheet. Full width, `max-height: 60vh`. The column label and search field are at the top. Symbol grid renders as 4 columns of larger icons (48×48px buttons).

On phone: Full-screen modal. Header shows "Choose symbol — Column D". Search field. 3-column icon grid with names below.

The `anchorRect`-based positioning is meaningless on mobile — replace entirely with bottom sheet / modal.

---

## 7. Modal and Dialog Patterns

### Desktop (unchanged)
- Print Settings: centred modal overlay
- Preferences: centred modal overlay
- Shortcuts reference: centred modal overlay
- Getting Started: right-edge drawer

### Tablet
- Print Settings: centred modal, max-width: 90vw
- Preferences: centred modal, max-width: 90vw
- Shortcuts: bottom sheet (keyboard shortcuts less relevant on touch, but still useful)
- Getting Started: bottom sheet, 70% height

### Phone
All modals become full-screen sheets:
- Full viewport height, with a prominent close button
- Header with back-arrow style dismiss
- Content scrolls within the sheet

`window.confirm()` calls (used for course deletion) must be replaced with custom inline confirmation patterns on mobile — native confirm dialogs are styled badly on iOS and Android and block the UI harshly. Replace with an inline "Are you sure? [Delete] [Cancel]" expansion within the course list row.

---

## 8. Orientation Handling

### Tablet landscape (>= 1024px wide when rotated)

Treat as desktop — all desktop layout rules apply. This is the natural orientation for field work on an iPad with a keyboard.

### Tablet portrait (640–1023px)

Apply tablet tier layout (panels as drawers/bottom sheets).

### Phone landscape (typically 667–932px)

The phone in landscape is actually 667px+ wide — it crosses into the tablet tier threshold. Apply tablet layout. The additional width makes the canvas much more usable.

**Orientation change handling:**
- On orientation change, close any open bottom sheets and drawers
- Re-run fit-to-view to recenter the map for the new aspect ratio
- Show a brief toast/indicator if panels were closed ("Panels collapsed for landscape mode")

### Phone portrait

Full phone tier layout. The canvas height is ~600px after toolbar (~55px) and bottom navigation strip (~50px). This is workable for placing controls. Users will zoom in significantly for precision work — the pinch and double-tap to fit gestures are essential here.

---

## 9. Specific UI Patterns

### Bottom sheet pattern

All bottom sheets share:
- Rounded top corners (border-radius: 16px top)
- Drag handle bar (40px wide, 4px tall, centered, `bg-gray-300`)
- Touch gesture to dismiss: swipe down past 30% of sheet height triggers close animation
- `position: fixed`, `bottom: 0`, `left: 0`, `right: 0`
- `z-index: 40` (below symbol picker at z-50)
- Entry: slide up from bottom with `transform: translateY(0)`, 200ms ease-out
- Exit: slide down, 150ms ease-in
- No scrim for small sheets (< 30% height); scrim for larger sheets

### FAB cluster (phone only)

A primary FAB sits at `bottom: 72px, right: 16px` (above the bottom nav strip). Primary action: the most recently used tool (defaults to "Add Control" when a course is active).

Long-pressing the FAB reveals secondary action buttons in an arc above it:
- Add Control (crosshair-in-circle icon)
- Pan (hand icon) — rarely needed since single-finger pans, but explicit selection helps
- Add Text (T icon)
- Add Line (line segment icon)

Each secondary button is 44×44px with a label chip beside it.

The FAB is only shown when a map is loaded.

### Mode indicator banner (tablet — add control mode)

When "Add Control" is active on tablet, a slim banner appears below the toolbar:

```
[+ Adding controls — tap map to place] [Done]
```

Height: 36px. Violet background. "Done" button returns to pan mode. Banner disappears automatically when pan tool is selected.

### Placement confirmation nudge pad (touch — after placing a control)

Appears 300ms after a control is placed via touch. Anchored to bottom of screen, above the FAB. Contains:
- D-pad arrows (left/right/up/down), each 44×44px
- "Confirm" button (accepts position)
- "Undo" button (removes just-placed control)
- Disappears automatically when user pans or places another control

### Toast notifications

Use a brief slide-up toast for confirmations on mobile (e.g., "Control removed", "Course added"). Currently the app has no feedback beyond state change. On touch, users need explicit confirmation that actions registered. Toast at `bottom: [bottom-nav-height + 8px]`, auto-dismiss after 2.5 seconds.

### Course badge (phone — persistent bottom strip)

A slim strip above the device's safe area (above home indicator) shows:
- Active course name (left)
- Control count (right) — e.g., "12 controls · 4.2km"
- Tap anywhere to open the course sheet

Height: 48px. `bg-white`, `border-t border-gray-200`.

---

## 10. What NOT to Change

These desktop behaviors must be preserved exactly:

**Canvas interactions:**
- Mouse wheel zoom (with focal point) — unchanged
- Middle-click pan — unchanged
- Click-to-place control in addControl mode — unchanged
- Rubber-band preview line on mouse move — unchanged
- Drag to move controls — unchanged
- Arrow key panning — unchanged
- Delete/Backspace to remove last control — unchanged

**Toolbar layout on desktop:**
- The 5-menu menubar — unchanged
- Tool buttons with text labels — unchanged
- Descriptions toggle button — unchanged
- Inline event name editing — unchanged

**Floating panels on desktop:**
- Course panel position and behavior — unchanged
- Map settings panel position and behavior — unchanged
- Zoom controls position — unchanged
- Symbol picker anchored to clicked cell — unchanged

**Description panel on desktop:**
- Right sidebar `w-70` — unchanged
- IOF grid layout and cell sizes — unchanged
- Symbol picker as a fixed popover — unchanged

**All export and file operations** — these are inherently desktop behaviors (file system pickers, multi-course PDF batch export). On mobile, gracefully degrade: show a message that batch export is best done on desktop, but allow single-course PDF download via the browser's native download flow. The `showSaveFilePicker` API is not available on iOS Safari — the fallback `saveBlob` auto-download path already handles this correctly.

---

## 11. Implementation Approach

This specification deliberately avoids prescribing a single implementation PR. The breakpoints and patterns above can be introduced incrementally:

**Phase 1 — Touch target sizing (low risk, immediate benefit)**
Increase tap target sizes throughout. Add `md:py-3` responsive padding to course list rows, toolbar buttons, zoom controls. This is pure Tailwind class addition with no behavior change.

**Phase 2 — Toolbar collapse (medium complexity)**
Introduce a `useBreakpoint()` hook (or use Tailwind's `hidden md:flex` patterns) to swap the 5-menu menubar for a single merged menu on tablet. This requires merging the five `fileMenuItems`/`editMenuItems`/etc arrays with section headers. No state store changes required.

**Phase 3 — Course panel drawer (tablet)**
Wrap `CoursePanel` in a drawer container that is position-fixed on `md:` screens. The Course panel's internal JSX does not change — only its container changes. Introduce a `CoursePanelDrawer` wrapper component.

**Phase 4 — Description panel bottom sheet (tablet)**
Wrap `DescriptionPanel` in a bottom sheet container on `md:`. The `DescriptionSheet` and `DescriptionCell` components are unchanged. The `SymbolPicker` needs an alternate render path for mobile (bottom sheet vs. fixed popover).

**Phase 5 — Phone FAB and bottom nav**
New components: `MobileFab`, `MobileBottomBar`. These render only below 640px (`sm:hidden` on larger). No changes to existing components.

**Phase 6 — Phone canvas placement mode**
The center-reticle placement mode and nudge pad. This requires changes to `use-map-navigation.ts` to detect touch-only devices and route addControl interactions differently.

---

## 12. Design Tokens for Mobile

Add these to `index.css` or a Tailwind config extension:

```css
/* Minimum touch target */
--touch-target-min: 44px;

/* Bottom safe area (iOS home indicator) */
--safe-bottom: env(safe-area-inset-bottom, 0px);

/* Mobile bottom nav height */
--mobile-nav-height: 48px;

/* Bottom sheet drag handle */
--sheet-handle-width: 40px;
--sheet-handle-height: 4px;
--sheet-border-radius: 16px;
```

All fixed bottom elements on phone must add `padding-bottom: var(--safe-bottom)` to respect the iOS safe area. The canvas height calculation must subtract `--mobile-nav-height + --safe-bottom` on phone.

---

## 13. Accessibility Notes (Touch-Specific)

- All bottom sheets must trap focus when open (`aria-modal="true"`, focus returns to trigger on close)
- FAB must have `aria-label` — "Add control" or current tool name
- Bottom sheet drag handles are decorative; the sheet close button is the accessible dismiss mechanism
- Toast messages need `role="status"` and `aria-live="polite"`
- Do not rely on hover states for any touch-critical information (currently some hover-reveal patterns: the pencil icon on event name, the up/down arrows on control list rows — these need always-visible tap targets on touch)
- The IOF description symbol picker's search field must receive focus when the sheet opens (currently done, but needs to work in the bottom sheet variant)

---

## Summary Table

| Feature | Phone (<640px) | Tablet (640–1023px) | Desktop (>=1024px) |
|---|---|---|---|
| Toolbar | Logo + event name + hamburger | Logo + merged menu + icon tools | Current 5-menu + text tools |
| Course panel | Bottom sheet (on demand) | Right slide-in drawer | Floating panel (current) |
| Description panel | Full-screen modal | Bottom sheet (50% height) | Right sidebar (current) |
| Map settings | Collapsed badge | Collapsed badge | Floating panel (current) |
| Zoom controls | Bottom-left, larger buttons | Bottom-left, larger buttons | Bottom-right (current) |
| Tool selection | FAB cluster | Mode banner + toolbar icons | Toolbar text buttons (current) |
| Add control gesture | Center-reticle + "Place here" | Tap with mode indicator | Click (current) |
| Symbol picker | Full-screen modal | Bottom sheet | Fixed popover (current) |
| Modals/dialogs | Full-screen sheets | 90vw centred or bottom sheet | Centred modal (current) |
| Haptic feedback | On control place, on tool select | On control place | None (no API on desktop) |
