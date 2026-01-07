# CoAIleague Design System v5.0 - Fortune 500 Enterprise Design

## Enterprise Workforce Management Platform for Fortune 500

---

## Design Approach

**System**: Clean, minimal enterprise SaaS with refined proportions
**Philosophy**: "OS"-branded modules (ScheduleOS, BillOS, TimeOS, etc.) delivering autonomous workforce intelligence
**Visual Identity**: Subtle slate grays + refined teal accents + clean white content areas
**Mobile Strategy**: Equally polished native app experience with dark navigation
**Key Principles**: Thin borders, subtle shadows, smaller border-radius, refined typography, ample whitespace

---

## Brand Identity & Logo

**CoAIleague Logo**: Teal-to-cyan gradient wordmark with gradient icon badge
**Icon Badge**: Rounded-xl with gradient background (from-teal-400 via-cyan-500 to-blue-500)
**Wordmark**: "Co" (teal gradient) + "AI" (white) + "league" (cyan gradient) + ™
**Shadow**: shadow-lg shadow-cyan-500/20 on icon for depth
**Tagline**: "Autonomous Management Solutions" in slate-400

---

## Color System - Polished Dark Theme

### Primary Brand Colors - Teal/Cyan Gradient
- **Gradient Start**: #2dd4bf (teal-400)
- **Gradient Mid**: #06b6d4 (cyan-500)
- **Gradient End**: #3b82f6 (blue-500)
- **Accent**: cyan-400 for active states and highlights
- **Logo Shadow**: shadow-cyan-500/20

### Navigation & Sidebar (Dark)
- **Sidebar Background**: #0f172a (slate-900)
- **Sidebar Hover**: #1e293b (slate-800)
- **Sidebar Border**: slate-700/50
- **Section Labels**: slate-400 (text), uppercase, tracking-wider
- **Nav Text**: slate-300 (default), white (hover/active)
- **Active Background**: slate-800
- **Active Icon**: cyan-400

### Badges & Tags
- **Root Badge**: bg-red-500/20, text-red-400, border-red-500/30
- **Enterprise Badge**: bg-amber-500/20, text-amber-400, border-amber-500/30
- **QA Badge**: bg-purple-500/20, text-purple-400, border-purple-500/30
- **Default Badge**: bg-cyan-500/20, text-cyan-400, border-cyan-500/30

### Content Areas (Light)
- **Background**: bg-background (white in light mode)
- **Card Surface**: bg-card with subtle shadows
- **Text Primary**: foreground (slate-900 light / white dark)
- **Text Muted**: text-muted-foreground

### Status Colors
- **Success**: emerald-500 (bg-emerald-500/10 for backgrounds)
- **Warning**: amber-500 (bg-amber-500/10 for backgrounds)
- **Error**: red-500 (bg-red-500/10 for backgrounds)
- **Info**: cyan-400 (bg-cyan-500/10 for backgrounds)

---

## Typography

**Primary**: 'Inter', -apple-system, sans-serif (Variable weights: 400-700)
**Monospace**: 'JetBrains Mono' for data/metrics

### Scale
- **Section Labels**: 11px, font-bold, uppercase, tracking-wider (sidebar)
- **Nav Items**: 14px (text-sm), font-medium
- **Page Title**: 20-24px (text-xl/2xl), font-bold
- **Body**: 16px (text-base), font-normal
- **Small/Labels**: 12px (text-xs), font-medium
- **Micro**: 10px (text-[10px]), font-semibold

---

## Layout System

### Sidebar (Desktop)
- Width: 280-320px via CSS variable
- Header: p-5 with logo and tagline
- Content: px-3 py-4 with collapsible sections
- Footer: p-4 with user profile and actions
- Borders: border-slate-700/50

### Mobile Navigation
- Bottom Nav: Fixed, bg-slate-900/98, backdrop-blur-xl
- Nav Items: rounded-xl, py-2 px-3, transition-all duration-200
- Active: text-cyan-400 bg-slate-800
- Inactive: text-slate-400 hover:text-white hover:bg-slate-800/50
- Sheet Menu: bg-slate-900, border-slate-700

### Content Spacing
- Page Padding: responsive-container (px-4 sm:px-6)
- Card Padding: p-6 (desktop), p-4 (mobile)
- Section Gaps: gap-4 sm:gap-6

---

## Component Architecture

### Navigation Sidebar (Desktop)
**Container**: bg-slate-900, border-r border-slate-700/50
**Logo Header**: Gradient badge + wordmark with tagline
**Section Headers**: Collapsible with chevron icons
**Nav Items**: Icon + label + optional badge
**User Footer**: Avatar (gradient fallback) + name + email + logout

### Mobile Header Bar
**Background**: bg-slate-900, border-b border-slate-700/50
**Height**: py-3 (comfortable touch targets)
**Hamburger**: text-white hover:bg-slate-800
**Branding**: Gradient wordmark centered
**Actions**: Bell icon with badge for notifications

### Mobile Bottom Navigation
**Container**: bg-slate-900/98, backdrop-blur-xl, shadow-2xl
**Items**: 5 nav items with icons and labels
**Active State**: text-cyan-400, bg-slate-800, rounded-xl
**Safe Area**: paddingBottom: env(safe-area-inset-bottom)

### Mobile Sheet Menu
**Background**: bg-slate-900, rounded-t-3xl
**Quick Access Grid**: 3-column, bg-slate-800 cards
**Nav Items**: Same styling as sidebar
**User Profile**: bg-slate-800 card with gradient avatar

### Cards & Panels (Fortune 500 Style)
**Base**: bg-white, rounded-lg (NOT rounded-xl - more refined), border border-slate-200, shadow-sm
**Hover**: transition-all, hover:shadow-md, hover:border-slate-300
**Header**: Flex with icon, title, badge, action - minimal padding
**Content**: p-5 (not p-6 or p-8 - tighter proportions)
**Border-radius**: rounded-md or rounded-lg (never rounded-xl or rounded-2xl for professional look)
**Shadows**: shadow-sm or shadow-md only (never shadow-lg, shadow-xl, shadow-2xl)
**Borders**: Single pixel borders (border, not border-2)

### Buttons
**Primary**: Default shadcn with gradient hover
**Ghost (Dark)**: text-slate-300 hover:text-white hover:bg-slate-800
**Destructive (Dark)**: text-red-400 hover:text-red-300 hover:bg-red-500/10
**Size Icon**: h-10 w-10 for touch targets

### Form Inputs
**Base**: bg-input, border-input, rounded-md
**Focus**: focus-visible:ring-2 ring-primary/20
**Labels**: text-sm font-medium text-foreground

---

## Mobile-First Experience

### Touch Targets
- Minimum: 44px (WCAG)
- Comfortable: 48-52px (used for nav items)
- Large: 56px+ (CTAs)

### Bottom Navigation
- Fixed position with safe-area-inset
- 5 primary items: Home, Schedule, Time, Chat, More
- Haptic feedback on tap
- Keyboard-aware hiding

### Sheet Menus
- Slide up from bottom
- Rounded top corners (rounded-t-3xl)
- Max height 70vh with scroll
- Close handle at top

### Gestures
- Swipe navigation between tabs
- Pull-to-refresh on lists
- Touch-optimized scrolling

---

## Animations & Interactions

### Transitions
- Default: transition-all duration-200
- Hover: Subtle color/background changes
- Active: Instant feedback

### States
- Hover: hover:bg-slate-800/50 (dark theme)
- Active: bg-slate-800 (dark theme)
- Focus: focus-visible:ring-2

### Loading
- Skeleton states matching layout
- Subtle pulse animation
- Progress indicators for long operations

---

## Accessibility

- **Contrast**: WCAG AA on all dark theme combinations
- **Focus**: Clear visible rings (ring-2 ring-primary/20)
- **Touch**: 48px+ tap targets
- **Labels**: Screen reader friendly aria-labels
- **Motion**: Respect prefers-reduced-motion

---

## Implementation Notes

### Sidebar Colors
```css
/* Dark sidebar theme */
.sidebar {
  background: rgb(15 23 42); /* slate-900 */
  border-color: rgb(51 65 85 / 0.5); /* slate-700/50 */
}

.sidebar-item {
  color: rgb(203 213 225); /* slate-300 */
}

.sidebar-item:hover {
  background: rgb(30 41 59 / 0.6); /* slate-800/60 */
  color: white;
}

.sidebar-item.active {
  background: rgb(30 41 59); /* slate-800 */
  color: white;
}

.sidebar-icon.active {
  color: rgb(34 211 238); /* cyan-400 */
}
```

### Gradient Logo
```css
.logo-badge {
  background: linear-gradient(to bottom right, #2dd4bf, #06b6d4, #3b82f6);
  box-shadow: 0 10px 15px -3px rgb(6 182 212 / 0.2);
}

.logo-wordmark {
  /* "Co" - teal gradient */
  background: linear-gradient(to right, #2dd4bf, #22d3ee);
  -webkit-background-clip: text;
  color: transparent;
}
```

### Mobile Bottom Nav
```css
.bottom-nav {
  background: rgb(15 23 42 / 0.98);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgb(51 65 85 / 0.5);
}
```
