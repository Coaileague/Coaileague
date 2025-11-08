# AutoForce™ Mobile Responsive Design Guide

## Problem
On mobile devices, borders are cut off, text goes off-screen, and content doesn't wrap properly.

## Solution
Use the new mobile-safe utility classes added to `index.css`.

## Mobile-Safe Utilities

### 1. `.mobile-safe-container`
Use for page content wrappers:
```tsx
<div className="mobile-safe-container max-w-7xl mx-auto">
  {/* Your content */}
</div>
```
- Adds responsive padding (16px → 24px → 32px)
- Prevents horizontal overflow
- Works with max-w-* classes

### 2. `.mobile-safe-page`
Use for full-page layouts:
```tsx
<div className="mobile-safe-page">
  {/* Your content */}
</div>
```
- Full width with safe padding
- Min-height 100vh
- Responsive padding

### 3. `.mobile-text-wrap`
Use for long text that might overflow:
```tsx
<h1 className="mobile-text-wrap">
  Very Long Title That Needs To Wrap On Mobile
</h1>
```

### 4. `.mobile-grid-responsive`
Auto-stacking responsive grid:
```tsx
<div className="mobile-grid-responsive">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
  <Card>Item 4</Card>
</div>
```
- 1 column (mobile)
- 2 columns (sm: 640px+)
- 3 columns (lg: 1024px+)
- 4 columns (xl: 1280px+)

## Page Layout Pattern

### Standard Page Structure
```tsx
export default function MyPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden w-full max-w-full">
      <div className="mobile-safe-container max-w-7xl mx-auto">
        {/* Page content here */}
        
        {/* Grid of cards */}
        <div className="mobile-grid-responsive">
          <Card>Item 1</Card>
          <Card>Item 2</Card>
        </div>
        
        {/* Long text */}
        <h1 className="text-3xl font-bold mobile-text-wrap">
          Title That Wraps
        </h1>
      </div>
    </div>
  );
}
```

## Common Issues Fixed

1. **Borders cut off**: Fixed by `overflow-x-hidden` and responsive padding
2. **Text off-screen**: Fixed by `mobile-text-wrap` and responsive containers
3. **Cards too wide**: Fixed by `mobile-grid-responsive` auto-stacking
4. **Horizontal scroll**: Fixed by `max-w-full` and global overflow controls

## App.tsx Changes
The main app container now has:
```tsx
<div className="flex h-screen w-full overflow-x-hidden max-w-full">
  <div className="flex flex-col flex-1 overflow-x-hidden max-w-full">
    <main className="flex-1 overflow-x-hidden overflow-y-auto w-full max-w-full">
```

This prevents any child page from causing horizontal overflow.
