---
name: ClaimHero Design System
description: Precision Medical Dark-Mode Design System for Autonomous Medical Appeal Sentinel
colors:
  primary: "#00e5ff"
  primary-foreground: "#080c14"
  neutral-canvas: "#080c14"
  neutral-card: "#0e1420"
  neutral-subtle: "#141c2c"
  border-dim: "#1e293b"
  text-white: "#f8fafc"
  text-muted: "#94a3b8"
  victory-emerald: "#10b981"
  denial-crimson: "#f43f5e"
  deadline-amber: "#f59e0b"
  precedent-indigo: "#6366f1"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.025em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.text-white}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.text-muted}"
  button-secondary:
    backgroundColor: "{colors.neutral-subtle}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  button-destructive:
    backgroundColor: "{colors.denial-crimson}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.neutral-subtle}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.text-white}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
---

# Design System: ClaimHero

## Overview

**Creative North Star: "The Precision Medical Sentinel"**

ClaimHero operates as a high-density, authoritative tactical console for fighting health insurance claim rejections. The visual world is characterized by an obsidian midnight canvas, layered optical glass, surgical cyber-luminescence, and razor-sharp data typography. Every interface component conveys the rigor of an ICU clinical telemetry monitor fused with the unyielding authority of a federal appellate legal brief.

Information is organized for rapid scanability, urgent deadline awareness, and clear evidentiary proof. High-contrast clinical signals cut through deep background shadows to immediately guide the user's attention to critical denial reason codes (e.g., CO-50), statutory ERISA countdown thresholds, insurer policy clause contradictions, and recovered financial amounts.

**Key Characteristics:**
- High-density dark canvas (`#080c14`) engineered for sustained focus and zero eye fatigue during intense case reviews.
- Layered translucent glass panels (12px to 16px blur) with 1px inner specular rim highlights providing depth and separation without clutter.
- Purposeful, highly restricted neon color accents reserved exclusively for actionable data states, urgency alarms, and victory triggers.
- Compact, tactile controls with responsive micro-interactions (150ms transitions, subtle 1px active press displacement).

## Colors

The palette is anchored by deep obsidian slates, punctuated by clinical cyan illumination and high-urgency semantic signals.

### Primary
- **Clinical Cyan** (`#00e5ff`): The primary energy and focus color. Used for active radar scanning sweeps, active navigation tabs, key interactive focus rings, and primary case action triggers.

### Secondary
- **Precedent Indigo** (`#6366f1`): Secondary analytical accent. Used for Clinical Policy Bulletin (CPB) evidence highlights, precedent matching tags, and analytical trend lines.

### Semantic Status
- **Victory Emerald** (`#10b981`): Success, claim overturned, payment won, high win-probability scores (>75%), and verified policy compliance.
- **Denial Crimson** (`#f43f5e`): Payer denial codes, disputed amounts, expired deadlines, and severe ERISA non-compliance flags.
- **Deadline Amber** (`#f59e0b`): Statutory appeal countdown warnings (<30 days remaining), pending review states, and required human sign-offs.

### Neutral
- **Obsidian Midnight** (`#080c14`): The universal base canvas background. Deep, absorbing, non-distracting.
- **Slate Card** (`#0e1420`): Primary container and card surface, rendered at 50%–72% opacity with backdrop blur.
- **Slate Subtle** (`#141c2c`): Secondary container fill, hover state backgrounds, and muted component tracks.
- **Border Dim** (`#1e293b`): Subtle 1px structural dividing lines and container borders (often with 60% opacity).
- **Text Clinical White** (`#f8fafc`): High-contrast primary foreground for headers, case titles, and critical figures.
- **Text Muted Slate** (`#94a3b8`): Secondary foreground for clinical metadata, footnotes, timestamps, and helper labels.

### Named Rules
**The Rarity Rule.** High-intensity neon accents (cyan, crimson, emerald, amber) are strictly rationed and must occupy ≤10% of any given view. Their rarity is what guarantees instant visual triage.

**The Semantic Truth Rule.** Red is never used decoratively; it is strictly reserved for denials, errors, and critical countdown risks. Green is strictly reserved for positive claim outcomes, overturned precedents, and verified evidence.

## Typography

**Display Font:** System Sans (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`)  
**Body Font:** System Sans (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`)  
**Label/Mono Font:** JetBrains Mono (`'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`)

**Character:** Crisp, clinical, and authoritative. Clean geometric sans for scanability, paired with monospace formatting for CPT codes, CARC denial codes, monetary figures, and regulatory statutes (e.g., `29 CFR § 2560.503-1`).

### Hierarchy
- **Display** (Bold 700, `clamp(2rem, 5vw, 3rem)`, line-height 1.15): Hero marketing titles, major case counter figures.
- **Headline** (SemiBold 600, `1.5rem` / 24px, line-height 1.25): Page headers, dashboard section titles, modal headers.
- **Title** (SemiBold 600, `1.125rem` / 18px, line-height 1.35): Card headers, drawer titles, claim case summary headers.
- **Body** (Regular 400, `0.875rem` / 14px, line-height 1.5, max line length 75ch): Clinical argument text, policy clause explanations, narrative descriptions.
- **Label** (Medium 500, `0.75rem` / 12px, line-height 1.4, tracking `0.025em`): Table column headers, badge text, metadata pills, timestamp indicators.
- **Mono Data** (Medium 500 / SemiBold 600, `0.75rem`–`0.875rem`, monospace): Financial values (`$24,500.00`), CPT codes (`27447`), CARC codes (`CO-50`), and deadline timers.

### Named Rules
**The Tabular Numbers Rule.** All currency amounts, case IDs, countdown timers, and probability percentages must render with monospace font or `font-variant-numeric: tabular-nums` to prevent visual jitter during live updates.

## Layout

ClaimHero employs a structured 3-tier desktop layout optimized for high-density clinical monitoring and multi-pane collaborative editing.

- **Sidebar (Navigation & Quick Case List)**: Fixed 240px (collapsible to 64px) left rail containing system status, active claim queue, and top-level sentinel navigation.
- **Main Command Surface**: Fluid width with maximum content containment (`max-w-7xl` or full-width viewport in Studio), structured with a 12-column responsive grid and 16px to 24px column gaps.
- **Auxiliary Drawers & Inspection Rails**: Slide-over panels (400px to 640px) for two-way AgentMail correspondence, Clinical Policy clause side-by-side matching, and immutable audit logs.
- **Density & Spacing Rhythm**: Dense 4px base increment. Common vertical rhythms: 8px between related fields, 16px between cards, 24px between major operational sections.

## Elevation & Depth

Surfaces rely on optical glassmorphic layering rather than heavy opaque drop shadows. Depth is communicated through backdrop blur intensity, translucent fills, and delicate 1px specular border highlights.

### Shadow Vocabulary
- **Ambient Card Depth** (`box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25)`): Primary depth foundation for floating cards, modals, and dropdown menus.
- **Specular Rim Highlight** (`box-shadow: inset 0 1px 1px 0 rgba(255, 255, 255, 0.06)`): Top inner edge reflection that gives glass cards tangible physical presence.
- **Tactical Pulse Glow** (`box-shadow: 0 0 16px rgba(0, 229, 255, 0.35)`): Radiated glow used for live radar pulses and active case selection indicators.

### Named Rules
**The Glass Hierarchy Rule.** Background canvas sits at 100% opacity (`#080c14`). Secondary background panels use 65% opacity with 12px blur. Interactive foreground cards use 72% opacity with 16px blur and 1px border stroke (`rgba(255, 255, 255, 0.08)`).

## Shapes

- **Base Radius**: 10px (`var(--radius)` = 0.625rem) for primary buttons, inputs, and controls.
- **Card Radius**: 12px (`rounded-xl`) for main content containers and dialog windows.
- **Sub-Component Radius**: 6px–8px (`rounded-md`, `rounded-lg`) for nested chips, select items, and dropdown triggers.
- **Pill Radius**: 9999px (`rounded-full`) for status indicators, countdown timers, and numerical count badges.
- **Border Treatment**: Consistent 1px subtle strokes (`border border-white/[0.08]`) enhanced on hover to `border-white/[0.14]`.

## Components

### Buttons
- **Shape:** Crisp rounded corners (10px radius, `rounded-lg`).
- **Primary:** High-contrast crisp white background (`#f8fafc`), obsidian text (`#080c14`), hover brightness reduction (`#f8fafc/90`), subtle shadow (`0 1px 2px rgba(0,0,0,0.15)`).
- **Secondary:** Dark subtle glass fill (`#141c2c`), crisp text (`#f8fafc`), hover background (`#1e293b`).
- **Destructive:** Soft crimson tint (`#f43f5e/15`), crimson border (`#f43f5e/30`), crimson text (`#f43f5e`), hover background (`#f43f5e/25`).
- **Ghost:** Transparent background, muted text (`#94a3b8`), hover background (`#141c2c`), hover text (`#f8fafc`).
- **Sizes:** Default `h-8 px-3 text-xs`, Small `h-7 px-2.5 text-xs`, Extra-Small `h-6 px-2 text-xs`, Large `h-9 px-3.5 text-sm`.
- **Tactile Feedback:** 1px downward translation on active click (`active:translate-y-px`).

### Cards & Glass Panels
- **Corner Style:** 12px (`rounded-xl`).
- **Background:** `hsl(224 25% 7.5% / 0.72)` with `backdrop-filter: blur(16px)`.
- **Border:** 1px `border-white/[0.08]` with hover transition to `border-white/[0.14]`.
- **Internal Padding:** 16px (compact 12px for `size="sm"`).
- **Header & Footer:** Integrated header with 6px vertical gap; separated footer with subtle top border and `bg-muted/40` tint.

### Badges & Status Pills
- **Style:** Compact pill (`rounded-full`, `h-5 px-2 text-xs`).
- **Variants:**
  - *Default:* Obsidian fill with clinical cyan or white text.
  - *Destructive:* Crimson translucent background (`bg-destructive/15 text-destructive border-destructive/30`).
  - *Success (Victory):* Emerald translucent background (`bg-emerald-500/15 text-emerald-400 border-emerald-500/30`).
  - *Warning (Countdown):* Amber translucent background (`bg-amber-500/15 text-amber-400 border-amber-500/30`).

### Inputs & Text Areas
- **Style:** 1px border (`border-input` / `#1e293b`), dark subtle fill (`bg-input/30`), 10px radius (`rounded-lg`), text `text-xs`.
- **Focus:** 2px cyan ring (`focus-visible:ring-ring/40`) with crisp border glow.

### Navigation & Tabs
- **Sidebar Rail:** Vertical list with 6px gap, 8px padding, icon + label with active highlight pill (`bg-sidebar-accent text-sidebar-accent-foreground`).
- **Segmented Tabs:** Subtle pill container with active tab elevated on slate card background with smooth layout animation.

### Signature Components
- **Case Ingestion Radar:** Concentric scanning radar rings with CSS pulse animation, live claim blips, and instant dispute tally overlays.
- **Deadline Countdown Dial:** Dynamic circular SVG timer with color-shifting stroke (emerald → amber → crimson) reflecting remaining ERISA statutory days.
- **Side-by-Side Evidence Matrix:** Dual-column comparative inspector highlighting contradictions between insurer CPB clauses and denial codes.

## Do's and Don'ts

### Do:
- **Do** format all monetary amounts with currency symbols and two decimal points (`$24,500.00`) in monospace numerals.
- **Do** keep button and control heights compact (`h-8` default) to maintain high data density.
- **Do** use translucent glass cards (`backdrop-blur-xl bg-card/70`) over solid opaque boxes.
- **Do** pair every denial code (e.g. `CO-50`) with its official plain-language regulatory description.
- **Do** provide immediate visual feedback (confetti on victory, pulsing amber on urgent statutory alarms).

### Don't:
- **Don't** use bright rainbow gradients or saturated decorative backgrounds that undermine clinical and legal credibility.
- **Don't** use generic default blue (`#3b82f6`); use authoritative Clinical Cyan (`#00e5ff`) or Precedent Indigo (`#6366f1`).
- **Don't** allow monetary or countdown numbers to jitter during real-time data streaming (always enforce tabular/mono typography).
- **Don't** hide statutory ERISA deadlines behind multi-click dropdowns; keep urgency clocks visible in primary views.
- **Don't** use pure black (`#000000`) for the canvas; always use deep obsidian slate (`#080c14`) to preserve glass depth.
