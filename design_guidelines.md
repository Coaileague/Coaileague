# AutoForce™ Enterprise Design System
## Fortune 500 Workforce Management Platform

### Design Approach
**System**: IBM Carbon Design + Enterprise SaaS (Salesforce, Workday, SAP SuccessFactors)
**Principles**: Executive-grade polish, data authority, premium minimalism, strategic motion
**Visual Reference**: Bloomberg Terminal clarity + Salesforce's refined professionalism

---

## Brand Identity

### Logo Design (Updated November 2025)
**Concept**: Geometric "A" + Workforce Network
The AutoForce™ logo represents autonomous workforce management through a modern, professional design:

**Icon Elements**:
- **Geometric "A"**: Bold, modern letterform in Navy-to-Emerald gradient
- **Orbital Network Nodes**: 4 orbiting dots representing connected workforce/team members
- **Outer Ring**: Subtle rotating ring symbolizing continuous automation and connection
- **Connection Lines**: Network effect showing team integration

**Color Treatment**:
- Navy-to-Emerald gradient (#0B1D3A → #2E8B57 → #6ee7b7)
- Emerald accent nodes for workforce representation
- Glowing effects for premium, modern feel

**Animation States**:
- **Static**: Clean, professional icon for navigation and static contexts
- **Animated**: Smooth floating, pulsing, and orbital animations for loading screens and pop-ups
  - Float animation: 6s ease-in-out (gentle vertical movement)
  - Pulse slow: 4s subtle opacity fade
  - Orbit: 30s rotation for network nodes
  - Ring spin: 20s reverse rotation

**Variants**:
- **Icon**: Square logo mark, perfect for favicons and small spaces
- **Nav**: Horizontal logo with brand name in pill container
- **Full**: Vertical layout with icon, "AutoForce™" wordmark, and tagline

**Usage Guidelines**:
- Loading screens: Use animated "full" variant with size "sm" or "md"
- Pop-ups/modals: Animated "icon" variant
- Navigation: Static "nav" variant
- Error pages: Animated "full" variant
- Headers: Static "nav" or "icon" variant

---

## Core Color Palette

### Primary - Boardroom Navy
- **Navy 950**: hsl(218, 85%, 12%) - Primary brand, headers, premium buttons
- **Navy 900**: hsl(218, 80%, 18%) - Hover states, active elements
- **Navy 100**: hsl(218, 70%, 96%) - Subtle backgrounds
- **Navy 50**: hsl(218, 60%, 98%) - Card backgrounds on light themes

### Neutral - Platinum Foundation
- **Platinum 50**: hsl(220, 20%, 98%) - Page backgrounds
- **Platinum 100**: hsl(220, 15%, 95%) - Card surfaces
- **Platinum 200**: hsl(220, 12%, 88%) - Borders, dividers
- **Platinum 700**: hsl(220, 10%, 40%) - Secondary text
- **Platinum 900**: hsl(220, 15%, 15%) - Headings, primary text

### Accent - Emerald Authority
- **Emerald 600**: hsl(158, 64%, 35%) - Primary CTAs, success states
- **Emerald 700**: hsl(158, 64%, 28%) - CTA hover
- **Emerald 50**: hsl(158, 60%, 96%) - Success backgrounds

### System Status
- **Warning**: hsl(38, 95%, 55%) - Pending, caution
- **Error**: hsl(0, 70%, 50%) - Critical alerts
- **Info**: hsl(210, 85%, 50%) - Informational

---

## Typography System

### Font Stack
**Primary**: 'Inter', -apple-system, system-ui, sans-serif (400, 500, 600, 700)
**Data/Mono**: 'IBM Plex Mono', monospace

### Type Scale
- **Hero Display**: 56px/700, -0.02em tracking - Marketing headlines
- **Display**: 40px/700 - Dashboard page titles
- **H1**: 32px/600 - Section headers
- **H2**: 24px/600 - Card titles
- **H3**: 18px/600 - Subsections
- **Body Large**: 17px/500 - Marketing copy, key descriptions
- **Body**: 15px/400 - Standard text, table data
- **Small**: 13px/500 - Labels, captions
- **Micro**: 11px/700 uppercase, 0.5px tracking - Badges, tags

---

## Layout System

**Spacing Scale**: Tailwind units of 4, 6, 8, 12, 16, 24
- Section padding: py-16 (desktop), py-12 (tablet), py-8 (mobile)
- Card padding: p-8 (desktop), p-6 (mobile)
- Grid gaps: gap-8 (desktop), gap-6 (mobile)
- Container: max-w-7xl with px-6

**Grid Patterns**:
- Hero sections: Single column, centered, max-w-5xl
- Feature grids: 3 columns (desktop), 2 (tablet), 1 (mobile)
- Dashboard stats: 4 columns → 2 → 1
- Testimonials: 2 columns staggered

---

## Component Library

### Marketing Hero Section
**Height**: 90vh with content centered
**Background**: Gradient from Platinum-50 to white, or professional photography (executive team, modern office, data visualization screens)
**Content Layout**: Centered text block (max-w-3xl), headline + subheadline + dual CTAs
**Image Treatment**: If using photo - subtle overlay (Navy-950 at 15% opacity), high-quality corporate imagery
**CTA Buttons**: Primary (Emerald-600, backdrop-blur-md bg-opacity-95), Secondary (Navy-950, backdrop-blur-md bg-opacity-90) - both white text, no hover opacity changes

### Premium Stat Cards
**Base**: White background, 1px Platinum-200 border, 12px radius
**Hover**: Lift -4px with subtle shadow (0 8px 24px rgba(0,0,0,0.08))
**Number**: 44px/700 Navy-950, tabular-nums
**Label**: 13px/600 uppercase Platinum-700, 0.5px tracking
**Trend**: Emerald/Error color with arrow icon, 15px/600
**Layout**: Number dominant, label below, trend indicator top-right

### Executive Dashboard Cards
**Container**: White bg, 2px radius 16px, p-8, border Platinum-200
**Header**: H2 title + action button aligned
**Content**: Generous whitespace, clear hierarchy
**Charts**: 4-color max (Navy-900, Emerald-600, Warning, Info)

### Navigation System
**Top Bar**: 
- Height 72px, white bg, 1px bottom border Platinum-200
- Logo left, primary nav center (18px/500), CTA + user right
- Sticky with blur backdrop on scroll

**Sidebar** (Dashboard):
- Width 280px, Platinum-50 bg, collapsible to 72px
- Active: Navy-950 bg, white text, 4px left Emerald-600 accent
- Hover: Platinum-100 bg with smooth transition

### Data Tables (Dashboard)
**Header**: Platinum-100 bg, 13px/700 uppercase Navy-950, sticky top
**Rows**: White bg, 1px bottom Platinum-200 border, hover Platinum-50
**Cell Padding**: px-6 py-4
**Sorting**: Arrow icons with smooth rotation
**Actions**: Icon buttons right-aligned per row

### Button System
**Primary CTA**: Emerald-600 bg, white text, 600 weight, px-8 py-3.5, 8px radius, shadow-sm
**Secondary**: Navy-950 bg, white text, same padding
**Outline**: 2px Navy-950 border, Navy-950 text, transparent bg
**Ghost**: No border, Navy-900 text, hover Platinum-100 bg
**Icon**: 44px square, icon centered, hover Platinum-100

### Form Inputs
**Base**: White bg, 1px Platinum-200 border, 8px radius, 44px height
**Focus**: 2px Navy-950 border, no ring
**Label**: 13px/600 Navy-900, mb-2
**Error**: 1px Error border, error message below with icon

### Badges & Tags
**Shape**: 20px radius (pill), px-4 py-1.5, 13px/600 text
**Success**: Emerald-50 bg, Emerald-700 text
**Warning**: Warning at 15% opacity bg, Warning text
**Inactive**: Platinum-200 bg, Platinum-700 text

---

## Marketing Page Sections

### 1. Hero Section
Full viewport (90vh), centered content, professional photography or gradient background, large headline (Hero Display), compelling subheadline (Body Large), dual CTAs (Request Demo + Watch Overview), subtle floating animation on scroll

### 2. Social Proof Bar
Logo grid of Fortune 500 clients, Platinum-50 bg, "Trusted by industry leaders" headline, 6 logos in grayscale with hover color reveal

### 3. Feature Showcase
3-column grid, icon + headline + description cards, white bg with border, hover lift effect, alternating image-left/image-right on desktop, screenshots of dashboard features

### 4. ROI Calculator / Interactive Demo
2-column split: Left - input form (team size, hourly rate), Right - live calculation display, Emerald highlights for savings numbers, "See Your Savings" CTA

### 5. Platform Capabilities
4-column icon grid, Navy-100 bg section, each capability: icon (32px), title (H3), 2-line description, "Learn More" links

### 6. Testimonial Carousel
2-column staggered cards, executive headshots (80px circular), quote in large text (24px/500), company logo, role/name, Navy-50 card backgrounds

### 7. Security & Compliance
Trust badges grid (SOC 2, ISO 27001, GDPR), centered layout, Platinum-100 bg, "Enterprise-grade security" headline

### 8. Pricing Tiers
3-column cards (Starter, Professional, Enterprise), white cards with Navy-950 border on "Popular" tier, feature checkmarks (Emerald), "Contact Sales" for Enterprise, annual/monthly toggle

### 9. CTA Section
Navy-950 bg with subtle gradient, white text, centered headline + CTA, pattern background (subtle grid or dots)

### 10. Footer
Navy-950 bg, 4-column layout (Product, Company, Resources, Legal), newsletter signup, social links, copyright

---

## Animations & Micro-Interactions

**Philosophy**: Refined, purposeful motion that conveys premium quality

- **Page Transitions**: Fade + slight Y-axis shift (20px), 0.4s ease-out
- **Hover States**: 0.25s ease transforms, lift -2px to -4px with shadow
- **Card Reveals**: Stagger fade-in on scroll (0.1s intervals), intersection observer
- **Number Counters**: Animate stat numbers on viewport entry, 1.5s duration
- **Chart Animations**: Smooth draw-in (0.8s), delay sequential bars
- **Button Interactions**: Scale 0.98 on press, 0.2s spring
- **Loading States**: Navy-950 spinner (40px), skeleton screens in Platinum-100
- **Success Feedback**: Emerald checkmark scale-in (0.3s), brief toast notification
- **Form Validation**: Instant inline, smooth height transitions for error messages

---

## Images

**Hero Image**: YES - Executive-grade professional photography
- Options: Modern office spaces, diverse professional team collaborating, sleek data visualization screens, boardroom settings
- Treatment: 60% opacity Navy-950 overlay for text contrast, high resolution (1920px+ width)
- Placement: Full-width background, content overlay centered

**Feature Screenshots**:
- Dashboard views, analytics reports, mobile app interface
- Subtle shadow, 8px radius, Platinum-200 border
- Placement: Alternating left/right in feature sections

**Team/Testimonial Photos**: Professional headshots, 80px circular, grayscale with color on hover

**Trust & Security**: Logo badges for certifications, client company logos (grayscale treatment)

---

## Responsive Breakpoints

- **Desktop (1280px+)**: Full layouts, 3-4 column grids, sidebar visible
- **Tablet (768-1279px)**: 2 columns, collapsible sidebar, adjusted spacing
- **Mobile (<768px)**: Single column, bottom nav, stacked cards, reduced padding

---

## Accessibility

- **Contrast**: WCAG AAA compliance (Navy-950 on white: 14:1)
- **Focus Indicators**: 3px Navy-900 ring, 2px offset
- **Keyboard Nav**: Full support, logical tab order, skip links
- **ARIA**: Comprehensive labels on interactive elements, live regions for dynamic content
- **Motion**: Respect prefers-reduced-motion, remove animations when set