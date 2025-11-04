# AutoForce™ Responsive Design System

## Overview
This guide explains the responsive design utilities built into AutoForce™. These CSS classes automatically handle text sizing, wrapping, and image scaling for mobile and desktop, ensuring all pages look perfect on every screen size.

## Quick Start

### For Text
Replace manual Tailwind sizing with responsive classes:

**Before:**
```jsx
<h1 className="text-4xl sm:text-5xl lg:text-6xl">Title</h1>
```

**After:**
```jsx
<h1 className="responsive-h1 text-wrap-auto">Title</h1>
```

### For Images
**Before:**
```jsx
<img src="hero.jpg" className="w-full" />
```

**After:**
```jsx
<img src="hero.jpg" className="responsive-img-hero" />
```

### For Containers
**Before:**
```jsx
<div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
```

**After:**
```jsx
<div className="responsive-container responsive-spacing-y">
```

## Typography Classes

### Headings
- **`responsive-h1`** - Scales from 28px (mobile) to 56px (desktop)
- **`responsive-h2`** - Scales from 24px (mobile) to 40px (desktop)
- **`responsive-h3`** - Scales from 20px (mobile) to 32px (desktop)
- **`responsive-h4`** - Scales from 18px (mobile) to 24px (desktop)

### Body Text
- **`responsive-body`** - Scales from 14px (mobile) to 18px (desktop)
- **`responsive-small`** - Scales from 12px (mobile) to 14px (desktop)

**Features:**
- Automatic font sizing using `clamp()`
- Built-in word wrapping
- Proper line heights for readability

## Text Wrapping Classes

### Essential Wrapping
- **`text-wrap-auto`** - Prevents text overflow, wraps long words
- **`text-wrap-anywhere`** - Aggressive wrapping for very long text
- **`text-balance`** - Balances text across lines (modern browsers)
- **`fix-overflow`** - Fixes overflow issues in containers and children

**When to use:**
- Headlines with long words
- User-generated content
- Product names or technical terms
- Any text that might overflow on mobile

**Example:**
```jsx
<h1 className="responsive-h1 text-wrap-auto">
  AutoForce™ Autonomous Workforce Management Solutions
</h1>
```

## Image Classes

### Standard Images
- **`responsive-img`** - Auto-scales, maintains aspect ratio
- **`responsive-img-cover`** - Fills container, crops to fit
- **`responsive-img-hero`** - Optimized for hero sections (60-80vh height)

**Example:**
```jsx
<img src="/product.jpg" className="responsive-img" alt="Product" />
```

### Hero Sections
For full-width hero sections with background images and text overlay:

```jsx
<section className="hero-section">
  <div className="hero-bg">
    <img src="/hero.jpg" alt="Hero" />
  </div>
  <div className="hero-content">
    <h1 className="hero-title">Welcome to AutoForce™</h1>
    <p className="hero-subtitle">Complete workforce automation</p>
    <button className="responsive-btn">Get Started</button>
  </div>
</section>
```

**Features:**
- Dark gradient overlay for text readability
- Auto-scaling text with shadows
- Responsive height (60vh mobile → 80vh desktop)
- White text with high contrast

## Layout Classes

### Containers
- **`responsive-container`** - Max-width container with responsive padding
  - Mobile: 100% width, 16px padding
  - Desktop: 1280px max-width, 32px padding

### Spacing
- **`responsive-spacing-y`** - Vertical padding that scales
  - Mobile: 32px (2rem)
  - Tablet: 48px (3rem)
  - Desktop: 64px (4rem)

### Grids
- **`responsive-flex-grid`** - Auto-adjusting grid
  - Mobile: 1 column
  - Tablet: 2 columns
  - Desktop: 3 columns

**Example:**
```jsx
<div className="responsive-flex-grid">
  <div className="responsive-card">Card 1</div>
  <div className="responsive-card">Card 2</div>
  <div className="responsive-card">Card 3</div>
</div>
```

## Buttons

### Responsive Buttons
- **`responsive-btn`** - Touch-friendly sizing
  - Mobile: Full width (100%), 44px min height
  - Desktop: Auto width, maintains 44px height

**Example:**
```jsx
<button className="responsive-btn">
  Start Free Trial
</button>
```

## Aspect Ratios

Maintain consistent image/video proportions:

- **`aspect-video`** - 16:9 ratio (standard video)
- **`aspect-square`** - 1:1 ratio (perfect square)
- **`aspect-wide`** - 21:9 ratio (ultrawide)

**Example:**
```jsx
<div className="aspect-video">
  <img src="/video-thumbnail.jpg" className="responsive-img-cover" />
</div>
```

## Common Patterns

### Landing Page Hero
```jsx
<section className="responsive-container responsive-spacing-y">
  <div className="grid lg:grid-cols-2 gap-12 items-center">
    <div className="space-y-6 fix-overflow">
      <h1 className="responsive-h1 text-wrap-auto">
        Your Amazing Product
      </h1>
      <p className="responsive-body text-wrap-auto">
        Description text that wraps properly on all devices
      </p>
      <button className="responsive-btn">Get Started</button>
    </div>
    <div className="aspect-video">
      <img src="/hero.jpg" className="responsive-img-cover" />
    </div>
  </div>
</section>
```

### Stats Section
```jsx
<section className="responsive-container">
  <div className="responsive-flex-grid text-center">
    <div>
      <div className="responsive-h2 text-primary">99.9%</div>
      <div className="responsive-small text-muted-foreground text-wrap-auto">
        Uptime SLA
      </div>
    </div>
    <!-- More stats -->
  </div>
</section>
```

### Feature Cards
```jsx
<div className="responsive-flex-grid">
  {features.map(feature => (
    <div key={feature.id} className="responsive-card fix-overflow">
      <h3 className="responsive-h3 text-wrap-auto">{feature.title}</h3>
      <p className="responsive-body text-wrap-auto">{feature.description}</p>
    </div>
  ))}
</div>
```

## Utility Classes

### Overflow Prevention
- **`flex-min-w-0`** - Prevents flex items from overflowing

**Example:**
```jsx
<div className="flex gap-4">
  <div className="flex-min-w-0">
    <p className="text-wrap-auto">Long text that won't overflow</p>
  </div>
</div>
```

## Migration Guide

### Step 1: Replace Container Classes
```diff
- <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20">
+ <div className="responsive-container responsive-spacing-y">
```

### Step 2: Replace Typography
```diff
- <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black">
+ <h1 className="responsive-h1">
```

### Step 3: Add Text Wrapping
```diff
- <h2>Long Product Name That Might Overflow</h2>
+ <h2 className="responsive-h3 text-wrap-auto">Long Product Name That Might Overflow</h2>
```

### Step 4: Fix Images
```diff
- <img src="hero.jpg" className="w-full h-auto" />
+ <img src="hero.jpg" className="responsive-img-hero" />
```

### Step 5: Add Overflow Protection
```diff
- <div className="space-y-6">
+ <div className="space-y-6 fix-overflow">
```

## Browser Support

All utilities use modern CSS with fallbacks:
- `clamp()` for fluid typography (IE11+)
- `aspect-ratio` for image containers (IE11+ with fallback)
- `text-wrap: balance` for balanced text (Chrome 114+, graceful fallback)

## Best Practices

1. **Always use text wrapping** on user-facing text
2. **Apply fix-overflow** to containers with dynamic content
3. **Use responsive-h* classes** instead of manual breakpoints
4. **Test on mobile first**, then verify desktop
5. **Combine classes** for maximum effect:
   ```jsx
   <div className="responsive-container responsive-spacing-y fix-overflow">
   ```

## Testing Checklist

- [ ] Text wraps properly on 320px width (smallest mobile)
- [ ] Images don't overflow on mobile
- [ ] Buttons are touch-friendly (44px minimum)
- [ ] Hero sections are readable on all sizes
- [ ] No horizontal scrolling on any device

## Examples in Codebase

See these files for reference:
- `client/src/pages/landing.tsx` - Hero sections, stats, features
- `client/src/pages/pricing.tsx` - Pricing hero
- `client/src/pages/dashboard-compact.tsx` - Mobile dashboard

## Support

For questions or issues with responsive design, check:
1. This guide (RESPONSIVE_DESIGN_GUIDE.md)
2. CSS utilities (client/src/index.css - search for "RESPONSIVE DESIGN SYSTEM")
3. Design guidelines (design_guidelines.md)
