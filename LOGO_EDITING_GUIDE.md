# CoAIleague™ Logo Editing Guide

## Overview
The CoAIleague logo is now implemented as a **fully editable React component** with dynamic SVG code. This allows you to edit colors, sizes, and styling without touching the SVG markup.

## Component Location
- **Component File:** `client/src/components/coailleague-logo.tsx`
- **Import:** `import { CoAIleagueLogo } from "@/components/coailleague-logo"`

## Usage

### Basic Usage (Default Branding)
```tsx
<CoAIleagueLogo />
```

### Usage with Props
```tsx
// Mobile header (compact)
<CoAIleagueLogo width={140} height={46} showTagline={false} />

// Desktop header (full)
<CoAIleagueLogo width={220} height={70} showTagline={false} />

// Icon only
<CoAIleagueLogo onlyIcon={true} width={80} height={80} />

// Full logo with tagline
<CoAIleagueLogo width={300} height={100} showTagline={true} showWordmark={true} />
```

### Available Props
- `width` - SVG width (default: 300)
- `height` - SVG height (default: 100)
- `showTagline` - Show/hide tagline (default: true)
- `showWordmark` - Show/hide wordmark (default: true)
- `onlyIcon` - Show only icon, no wordmark (default: false)
- `className` - Tailwind classes for styling
- `data-testid` - For testing

## Editing Colors

### Method 1: Edit CSS Variables (Recommended - Easy!)
The logo uses CSS variables defined in `index.css`. Edit these to change the logo colors:

```css
/* Light mode */
:root {
  --coailleague-color-start: #14B8A6;    /* Bright Teal */
  --coailleague-color-mid: #0E7490;      /* Darker Teal */
  --coailleague-color-end: #3B82F6;      /* Bright Blue */
  --wordmark-color-dark: #334155;        /* Dark Grey */
  --wordmark-color-light: #64748B;       /* Light Grey */
}

/* Dark mode */
.dark {
  --coailleague-color-start: #06D6A0;    /* Bright Teal */
  --coailleague-color-mid: #10B981;      /* Emerald Green */
  --coailleague-color-end: #60A5FA;      /* Light Blue */
  --wordmark-color-dark: #F1F5F9;        /* Light */
  --wordmark-color-light: #CBD5E1;       /* Medium Light */
}
```

### Method 2: Edit Within Component (Direct)
Edit the `<style>` block inside `coailleague-logo.tsx`:

```tsx
<style>{`
  :root {
    --coailleague-color-start: #14B8A6; /* Change this */
    --coailleague-color-mid: #0E7490;   /* Change this */
    --coailleague-color-end: #3B82F6;   /* Change this */
  }
  /* ... rest of styles */
`}</style>
```

## Seasonal/Themed Logo Colors

### Spring Theme (Green)
```css
--coailleague-color-start: #6EC06E;
--coailleague-color-mid: #3CB371;
--coailleague-color-end: #2E8B57;
```

### Summer Theme (Bright)
```css
--coailleague-color-start: #FFD700;
--coailleague-color-mid: #DAA520;
--coailleague-color-end: #FF8C00;
```

### Ocean Theme (Blue)
```css
--coailleague-color-start: #87CEEB;
--coailleague-color-mid: #4682B4;
--coailleague-color-end: #1E90FF;
```

### Awareness Themes
**Diabetes (Blue):**
```css
--coailleague-color-start: #4A90E2;
--coailleague-color-mid: #2E5C8A;
--coailleague-color-end: #1A3A5C;
```

**Mental Health (Green/Teal):**
```css
--coailleague-color-start: #00B4A6;
--coailleague-color-mid: #008B7F;
--coailleague-color-end: #006258;
```

## Logo Placement in App

### Desktop Header
**File:** `client/src/App.tsx` (line ~449)
```tsx
<a href="/" data-testid="link-logo-desktop" className="flex-shrink-0">
  <CoAIleagueLogo width={220} height={70} showTagline={false} className="h-9 w-auto" />
</a>
```

### Mobile Header
**File:** `client/src/App.tsx` (line ~271)
```tsx
<a href="/" data-testid="link-logo-mobile" className="flex-shrink-0">
  <CoAIleagueLogo width={140} height={46} showTagline={false} className="h-11 w-auto" />
</a>
```

## Best Practices

1. **Always maintain contrast** between logo colors and background
2. **Test in both light and dark modes** - use `.dark` class
3. **Keep the gradient smooth** - ensure start, mid, and end colors are visually compatible
4. **Mobile-first** - verify logo looks good on small screens (use devtools mobile view)
5. **Accessibility** - the logo has proper ARIA labels (role="img", aria-labelledby)

## Testing the Logo

### Visual Test
1. Open the app
2. Check desktop header - logo should appear next to settings gear
3. Check mobile header (use DevTools mobile view) - logo should be compact
4. Toggle dark mode - colors should adapt

### Data Attributes for Testing
```tsx
// Desktop
<a data-testid="link-logo-desktop" ...>
  
// Mobile
<a data-testid="link-logo-mobile" ...>
```

## Troubleshooting

**Logo not showing?**
- Verify `CoAIleagueLogo` component is imported in App.tsx
- Check that workflow has restarted after changes
- Clear browser cache (Ctrl+Shift+Delete)

**Colors not changing?**
- CSS variables might be cached - restart workflow
- Verify you're editing the correct `:root` or `.dark` block
- Check browser DevTools (F12) → Inspect → Computed to verify CSS variables

**Logo looks distorted?**
- Verify `viewBox="0 0 300 100"` is present (maintains aspect ratio)
- Ensure `className` includes `w-auto` to preserve proportions
- Don't set explicit width/height - use responsive sizing instead

## Quick Color Palette Reference

| Theme | Start | Mid | End |
|-------|-------|-----|-----|
| Default (Teal/Blue) | #14B8A6 | #0E7490 | #3B82F6 |
| Dark Mode | #06D6A0 | #10B981 | #60A5FA |
| Spring | #6EC06E | #3CB371 | #2E8B57 |
| Ocean | #87CEEB | #4682B4 | #1E90FF |
| Sunset | #FFD700 | #DAA520 | #FF8C00 |

## Need Help?
- Logo Component: `client/src/components/coailleague-logo.tsx`
- Integration: `client/src/App.tsx` (search for "CoAIleagueLogo")
- Styling: Check `index.css` for CSS variables
