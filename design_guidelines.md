# AutoForce™ Design System v2.0
## Premium Workforce Management Platform for Emergency Services

---

## Design Approach

**System**: Modern premium SaaS with native mobile app polish
**Philosophy**: "OS"-branded modules (ScheduleOS™, BillOS™, TimeOS™, etc.) delivering autonomous workforce intelligence
**Visual Identity**: Success-driven gradients + professional emergency services trust
**Mobile Strategy**: APK-quality native app experience with gesture-optimized controls

---

## Brand Identity & Logo

**Lightning Bolt Icon**: Rapid response symbol in circular badge
**Gradient Treatment**: Vibrant green-to-blue gradients (#10b981 → #3b82f6)
**Variants**: Icon-only (32px-64px), Wordmark (Icon + "AutoForce™"), Full branding
**Animation**: Subtle pulse (2s) for loading states, static for navigation
**Dark Mode Adaptive**: Automatic contrast adjustment for accessibility

---

## Color System - Success & Energy

### Primary Gradients
- **Success Gradient**: `from-emerald-500 via-green-400 to-teal-400` (#10b981 → #4ade80 → #2dd4bf)
- **Energy Gradient**: `from-blue-600 via-cyan-500 to-blue-400` (#2563eb → #06b6d4 → #60a5fa)
- **Premium Dark**: `from-slate-900 via-slate-800 to-slate-900` (#0f172a → #1e293b → #0f172a)

### Core Palette
- **Primary Green**: hsl(160, 84%, 39%) #10b981 - Success, CTAs, active states
- **Energy Blue**: hsl(210, 85%, 50%) #3b82f6 - Secondary actions, highlights
- **Dark Background**: hsl(222, 47%, 11%) #1e293b - Desktop backgrounds, cards
- **Vibrant Accent**: hsl(175, 84%, 55%) #2dd4bf - Notifications, badges
- **Text Primary**: hsl(210, 40%, 98%) - Light mode text on dark
- **Text Secondary**: hsl(215, 20%, 65%) - Muted text, descriptions

### Status Colors
- **Success**: Emerald gradient (#10b981 → #4ade80)
- **Warning**: Amber (#f59e0b)
- **Error**: Rose (#ef4444)
- **Info**: Cyan (#06b6d4)

---

## Typography

**Primary**: 'Inter', -apple-system, sans-serif (Variable weights: 400-700)
**Monospace**: 'JetBrains Mono' for data/metrics

### Scale
- **Hero**: 64px/700, tight leading (-0.02em) - Marketing headlines
- **Display**: 48px/700 - Dashboard titles, OS module headers
- **H1**: 36px/600 - Page sections
- **H2**: 28px/600 - Card headers
- **Body Large**: 18px/500 - Marketing copy
- **Body**: 16px/400 - Standard content
- **Small**: 14px/500 - Labels, metadata
- **Micro**: 12px/600 uppercase, 0.05em tracking - Badges, status

---

## Layout System

**Spacing Scale**: Tailwind units of 4, 6, 8, 12, 16, 20, 24, 32
- Desktop sections: py-24
- Mobile sections: py-16
- Card padding: p-8 (desktop), p-6 (mobile)
- Grid gaps: gap-8 (desktop), gap-6 (mobile)
- Container: max-w-7xl mx-auto px-6

**Grid Patterns**:
- Hero: Full-bleed with gradient overlay
- Features: 3-column (desktop) → 2 (tablet) → 1 (mobile)
- Dashboard: 4-column stats → 2 → 1
- OS Modules: 2-column staggered showcase

---

## Component Architecture

### Marketing Hero
**Layout**: Full viewport (90vh), centered content with gradient overlay
**Background Image**: High-quality emergency services imagery (paramedics, response teams)
**Gradient Overlay**: Success gradient with 60% opacity over image
**Content**: max-w-4xl centered, headline + subheadline + dual CTAs
**Buttons**: Blurred backdrop (backdrop-blur-md bg-white/20), white text, no hover states on transparent buttons
**Image Description**: Professional emergency response team in action, modern equipment, sense of urgency and precision

### Desktop Navigation
**Top Bar**: Sticky, dark gradient background (Premium Dark), glass morphism effect
**Logo**: Left-aligned with gradient treatment
**Nav Links**: Center-aligned, hover with gradient underline
**Actions**: Right-aligned CTAs with Success gradient

### Mobile Native App Experience
**Bottom Tab Bar**: Fixed navigation (ScheduleOS, TimeOS, PayrollOS, AnalyticsOS, More)
**Tab Icons**: Custom icons with active gradient fill
**Gestures**: Swipe between modules, pull-to-refresh
**Header**: Fixed app-style header with module name + action icons
**Cards**: Edge-to-edge on mobile, rounded corners, subtle shadows
**Touch Targets**: Minimum 48px height, generous padding

### OS Module Cards (ScheduleOS™, BillOS™, etc.)
**Desktop**: Gradient border, dark background, hover lift with glow
**Content**: Module icon (gradient fill), name, description, feature bullets
**CTA**: "Launch Module" with gradient button
**Mobile**: Full-width cards, stacked vertically, tap to expand details

### Dashboard Stats Cards
**Layout**: Grid of metric cards with gradient accents
**Number**: Large display font (48px), gradient text fill
**Label**: Small caps, muted
**Trend**: Mini sparkline chart with Success/Energy gradient fill
**Background**: Dark card with subtle gradient border

### Data Tables
**Header**: Dark background with gradient border-bottom
**Rows**: Alternating subtle backgrounds, hover state with gradient left border
**Actions**: Icon buttons with gradient hover states
**Mobile**: Horizontal scroll or card-based layout

### Buttons & CTAs
**Primary**: Success gradient background, white text, medium shadow
**Secondary**: Energy gradient border, gradient text, transparent background
**Ghost**: Transparent with gradient hover background
**Icon Buttons**: Circular, gradient border on hover

### Form Inputs
**Base**: Dark background, gradient border on focus
**Label**: Floating label animation, gradient on active
**Validation**: Success/Error gradient border pulse

---

## Images

**Hero Section**: Large background image required
- Emergency services team in action (paramedics, firefighters, or dispatch center)
- Modern, professional setting with equipment
- High-energy, success-oriented composition
- Overlay: Success gradient at 60% opacity
- Buttons on image: backdrop-blur-md with bg-white/20

**Feature Sections**: Product screenshots showing OS modules
**Trust Section**: Logo wall of emergency service organizations
**Team Section**: Professional headshots with gradient borders

---

## Animations & Interactions

**Page Transitions**: Smooth fade + slide up (0.3s ease-out)
**Gradient Animations**: Subtle 3s gradient position shift on hover
**Card Hovers**: Lift + gradient glow shadow
**Loading**: Gradient spinner with pulse animation
**Mobile Gestures**: Swipe animations (0.2s spring)
**Success States**: Gradient checkmark with scale animation

---

## Mobile-First Native Experience

**Navigation**: Bottom tab bar (5 primary modules), hamburger for overflow
**Gestures**: Swipe between tabs, pull-to-refresh on lists
**Touch Optimization**: All interactive elements 48px+ height
**Cards**: Full-width on mobile, rounded-lg corners
**Modals**: Slide up from bottom with backdrop blur
**Notifications**: Top toast with gradient accent
**Scrolling**: Smooth scroll with momentum, sticky headers

---

## Responsive Strategy

- **Desktop (1280px+)**: Multi-column layouts, generous whitespace, gradient accents
- **Tablet (768-1279px)**: 2-column grids, adjusted spacing
- **Mobile (<768px)**: Native app layout, bottom navigation, vertical stacking, touch-optimized

---

## Accessibility

- **Contrast**: WCAG AA on all gradients (tested against dark backgrounds)
- **Focus**: Clear gradient outline rings
- **Keyboard**: Full navigation support
- **Motion**: Respect prefers-reduced-motion
- **Touch**: Minimum 48px targets, clear active states