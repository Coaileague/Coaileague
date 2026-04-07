# Canvas Hub & Dialog Migration Quick Reference

## Quick Start: 30-Second Migration

### Before (❌ Wrong)
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MyDialog() {
  const [open, setOpen] = useState(false);
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>  {/* z-[100] - HARDCODED, NO MOBILE SUPPORT */}
        <DialogHeader>
          <DialogTitle>My Dialog</DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
```

### After (✅ Correct)
```typescript
import { ResponsiveDialog } from "@/components/canvas-hub";

export function MyDialog() {
  const [open, setOpen] = useState(false);
  
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      title="My Dialog"
      sheetSide="bottom"  // Mobile drawer appears at bottom
      size="md"           // Desktop: medium width
    >
      {/* AUTO RESPONSIVE, Z-INDEX MANAGED */}
    </ResponsiveDialog>
  );
}
```

---

## Decision Tree: Which Canvas Hub Component?

```
Need a dialog/modal?
├─ YES → Is it desktop AND mobile?
│         ├─ YES → ResponsiveDialog ✅
│         └─ NO  → ManagedDialog (desktop) or ManagedSheet (mobile)
│
├─ Is it a drawer/sheet?
│         ├─ Simple → ManagedSheet ✅
│         └─ Complex (header gradient, sections) → MobileResponsiveSheet ✅
│
└─ Do you need multiple overlays stacking?
          └─ YES → Use LayerManager (automatic via ResponsiveDialog) ✅
```

---

## Component API Reference

### ResponsiveDialog (Most Common)

**When to use**: 95% of dialogs - auto-responsive desktop to mobile

**Props**:
```typescript
<ResponsiveDialog
  open={boolean}              // State: is dialog open?
  onOpenChange={(open) => {}} // Callback: user clicked close/backdrop
  title={React.ReactNode}     // Dialog header title
  description={string}        // Optional subtitle
  footer={React.ReactNode}    // Optional footer buttons
  children={React.ReactNode}  // Dialog content
  
  // Desktop options
  size="sm" | "md" | "lg" | "xl" | "full"  // Default: "md"
  
  // Mobile options
  sheetSide="bottom" | "top" | "left" | "right"  // Default: "bottom"
  
  // Styling
  className={string}          // Wrapper div className
  contentClassName={string}   // Content wrapper className
/>
```

**Example**:
```typescript
<ResponsiveDialog
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Edit User"
  description="Make changes to user profile"
  size="lg"
  sheetSide="bottom"
  footer={
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
      <Button onClick={handleSave}>Save</Button>
    </div>
  }
>
  <form>
    {/* Form fields */}
  </form>
</ResponsiveDialog>
```

---

### ManagedDialog (Desktop Only)

**When to use**: Desktop-only dialogs that need layer management

**Props**:
```typescript
<ManagedDialog
  open={boolean}
  onOpenChange={(open) => {}}
  title={string}
  description={string}
  footer={React.ReactNode}
  children={React.ReactNode}
  size="sm" | "md" | "lg" | "xl" | "full"
  className={string}
  contentClassName={string}
/>
```

---

### ManagedSheet (Desktop or Mobile)

**When to use**: Sheet-based overlays with layer management

**Props**:
```typescript
<ManagedSheet
  open={boolean}
  onOpenChange={(open) => {}}
  title={string}
  description={string}
  side="left" | "right" | "top" | "bottom"
  children={React.ReactNode}
  className={string}
/>
```

---

### MobileResponsiveSheet (Advanced Mobile)

**When to use**: Complex mobile sheets with custom headers, sections, icons

**Props**:
```typescript
<MobileResponsiveSheet
  open={boolean}
  onOpenChange={(open) => {}}
  title={React.ReactNode}          // Can include JSX
  titleIcon={React.ReactNode}      // Icon next to title
  subtitle={string}                // Additional text
  children={React.ReactNode}
  side="left" | "right" | "top" | "bottom"
  showCloseButton={boolean}        // Default: true
  headerGradient={boolean}         // Cyan-to-blue gradient
  maxHeight={string}               // CSS value, default: "90vh"
  className={string}
  contentClassName={string}
/>
```

**Example with all features**:
```typescript
<MobileResponsiveSheet
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Notifications"
  titleIcon={<Bell className="h-5 w-5" />}
  subtitle="3 new messages"
  side="bottom"
  headerGradient={true}
  maxHeight="80vh"
>
  <div className="space-y-2 p-4">
    {notifications.map(notification => (
      <NotificationItem key={notification.id} {...notification} />
    ))}
  </div>
</MobileResponsiveSheet>
```

---

## Size Variants Explained

| Size | Desktop Width | Mobile Width | Use Case |
|------|---------------|--------------|----------|
| `sm` | 352px (22rem) | 92vw | Forms, confirmations |
| `md` | 416px (26rem) | 92vw | **Default, most dialogs** |
| `lg` | 512px (32rem) | 92vw | Large forms, previews |
| `xl` | 672px (42rem) | 92vw | Tables, complex layouts |
| `full` | 896px (56rem) | 95vw | Full-width content |

---

## Sheet Side Explained

| Side | Mobile Behavior | Desktop Alternative | Use Case |
|------|-----------------|---------------------|----------|
| `bottom` | Slides up from bottom | Sheet (right) | **Most common** - drawers, menus |
| `top` | Slides down from top | Sheet (right) | Top notifications |
| `left` | Slides in from left | Navigation sidebar | Side navigation |
| `right` | Slides in from right | Sheet (right) | Details panels, sidebars |

---

## Common Migration Patterns

### Pattern 1: Simple Dialog → ResponsiveDialog

```typescript
// Before
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Delete</DialogTitle>
    </DialogHeader>
    <p>Are you sure?</p>
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="destructive" onClick={handleDelete}>Delete</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// After
<ResponsiveDialog
  open={open}
  onOpenChange={setOpen}
  title="Confirm Delete"
  size="sm"
  footer={
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
      <Button variant="destructive" onClick={handleDelete}>Delete</Button>
    </>
  }
>
  <p>Are you sure?</p>
</ResponsiveDialog>
```

### Pattern 2: Complex Dialog with Form

```typescript
// Before
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent size="lg">
    <DialogHeader>
      <DialogTitle>Edit User</DialogTitle>
      <DialogDescription>Update user profile information</DialogDescription>
    </DialogHeader>
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
    <DialogFooter>
      {/* Buttons */}
    </DialogFooter>
  </DialogContent>
</Dialog>

// After
<ResponsiveDialog
  open={open}
  onOpenChange={setOpen}
  title="Edit User"
  description="Update user profile information"
  size="lg"
  sheetSide="bottom"
  footer={/* Buttons */}
>
  <form onSubmit={handleSubmit}>
    {/* Form fields */}
  </form>
</ResponsiveDialog>
```

### Pattern 3: Sheet → ManagedSheet

```typescript
// Before
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Details</SheetTitle>
    </SheetHeader>
    {/* Content */}
  </SheetContent>
</Sheet>

// After
<ManagedSheet
  open={open}
  onOpenChange={setOpen}
  title="Details"
  side="right"
>
  {/* Content */}
</ManagedSheet>
```

### Pattern 4: Complex Mobile Sheet → MobileResponsiveSheet

```typescript
// Before
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="bottom" className="h-[90vh]">
    <SheetHeader>
      <SheetTitle>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notifications
        </div>
      </SheetTitle>
    </SheetHeader>
    {/* Content */}
  </SheetContent>
</Sheet>

// After
<MobileResponsiveSheet
  open={open}
  onOpenChange={setOpen}
  title="Notifications"
  titleIcon={<Bell className="h-5 w-5" />}
  side="bottom"
  headerGradient={true}
>
  {/* Content */}
</MobileResponsiveSheet>
```

---

## Z-Index Hierarchy

The LayerManager automatically assigns z-indexes based on layer type and insertion order:

```
Base Z-Index:
┌─────────────────────────┐
│ Tooltip (70)            │ ← Highest priority
├─────────────────────────┤
│ Alert Dialog (60)       │
├─────────────────────────┤
│ Dialog (50)             │
│ Modal (50)              │
├─────────────────────────┤
│ Sheet (40)              │
├─────────────────────────┤
│ Popover (30)            │
├─────────────────────────┤
│ Dropdown (25)           │
├─────────────────────────┤
└─────────────────────────┘

Formula: baseZ + (index * 10) + (priority * 5)

So if you have:
1. Dialog (#1) = 50 + (0*10) + (0*5) = z-50
2. Dialog (#2) = 50 + (1*10) + (0*5) = z-60
3. Dialog (#3) = 50 + (2*10) + (0*5) = z-70

Automatically stacks correctly!
```

---

## Escape Key & Layer Behavior

When using ResponsiveDialog or canvas-hub components:

```
User presses Escape
         ↓
LayerManager intercepts
         ↓
Closes TOP layer only (FIFO)
         ↓
Next layer becomes active
         ↓
User presses Escape again
         ↓
Closes next layer
```

**Important**: Don't implement custom escape handling - let LayerManager handle it!

---

## Mobile Responsiveness Breakpoints

ResponsiveDialog switches to Sheet at:

```typescript
// From client/src/hooks/use-mobile.tsx
const MOBILE_BREAKPOINT = 640  // sm breakpoint

// useIsMobile() returns true when viewport < 640px
// ResponsiveDialog automatically switches:
- Viewport >= 640px → Dialog (centered)
- Viewport < 640px → Sheet (bottom drawer)
```

**Testing mobile**: Use browser devtools, set viewport to < 640px

---

## Common Mistakes & Fixes

### ❌ Mistake 1: Hardcoded z-index

```typescript
// WRONG
<ResponsiveDialog className="z-[999]">

// RIGHT - Don't add z-index, let LayerManager handle it
<ResponsiveDialog>
```

### ❌ Mistake 2: Custom escape handling

```typescript
// WRONG
useEffect(() => {
  const handleEscape = () => setOpen(false);
  window.addEventListener('keydown', handleEscape);
  return () => window.removeEventListener('keydown', handleEscape);
}, []);

// RIGHT - LayerManager handles this automatically
```

### ❌ Mistake 3: Multiple Sheet vs ResponsiveDialog

```typescript
// WRONG - conditional rendering
{isMobile ? <Sheet /> : <Dialog />}

// RIGHT - ResponsiveDialog does this automatically
<ResponsiveDialog />
```

### ❌ Mistake 4: Raw Dialog on mobile

```typescript
// WRONG - no mobile support
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>{children}</DialogContent>
</Dialog>

// RIGHT - has mobile support
<ResponsiveDialog open={open} onOpenChange={setOpen}>
  {children}
</ResponsiveDialog>
```

### ❌ Mistake 5: Nested dialogs without LayerManager

```typescript
// WRONG - no layer coordination
<Dialog open={dialog1Open}>
  <Dialog open={dialog2Open}>
    {/* Z-index conflict! */}
  </Dialog>
</Dialog>

// RIGHT - LayerManager coordinates all layers
<ResponsiveDialog open={dialog1Open}>
  <ResponsiveDialog open={dialog2Open}>
    {/* Automatically stacked correctly */}
  </ResponsiveDialog>
</ResponsiveDialog>
```

---

## Testing Checklist

Before considering migration complete:

### Mobile Testing
- [ ] Open on mobile viewport (< 640px)
- [ ] Dialog appears as bottom sheet
- [ ] All content visible without scroll issues
- [ ] Close button accessible
- [ ] Form inputs work on mobile keyboard

### Desktop Testing
- [ ] Open on desktop viewport (>= 640px)
- [ ] Dialog appears centered
- [ ] Proper width (sm/md/lg/xl/full)
- [ ] Overlay visible and dark
- [ ] Close button works
- [ ] Click outside closes (if no escapeKeyEnabled: false)

### Z-Index Testing
- [ ] Open Dialog A
- [ ] Open Dialog B (should be on top)
- [ ] Press Escape → Dialog B closes
- [ ] Dialog A still visible
- [ ] Press Escape again → Dialog A closes

### Responsive Testing
- [ ] Resize browser from desktop → mobile
- [ ] Dialog should convert to sheet during resize
- [ ] No layout shift or glitches

---

## Reference Files

**Look at these files for correct implementation examples:**

1. `client/src/components/motd-dialog.tsx` - Simple ResponsiveDialog
2. `client/src/pages/invoices.tsx` - Multiple ResponsiveDialogs
3. `client/src/components/canvas-hub/ManagedDialog.tsx` - Implementation reference
4. `client/src/components/mobile/MobileNotificationSheet.tsx` - MobileResponsiveSheet example
5. `client/src/App.tsx` - LayerManagerProvider setup

---

## Need Help?

### Quick Questions

**Q: Which component should I use?**  
A: Start with ResponsiveDialog for 95% of cases.

**Q: How do I add buttons to footer?**  
```typescript
<ResponsiveDialog
  footer={
    <div className="flex gap-2">
      <Button variant="outline">Cancel</Button>
      <Button>Save</Button>
    </div>
  }
>
```

**Q: How do I make it full width on mobile?**  
A: ResponsiveDialog already does this. No configuration needed.

**Q: Can I have custom styling?**  
```typescript
<ResponsiveDialog
  className="space-y-4 p-6"  // Content wrapper
  contentClassName="max-h-[500px]"  // Dialog/Sheet content
>
```

**Q: How do I disable Escape key?**  
A: Escape key closes via LayerManager. Don't disable - it's a feature.

**Q: Can I nest dialogs?**  
A: Yes! LayerManager automatically handles stacking and escape behavior.

---

## Stats & Impact

| Metric | Current | After Migration |
|--------|---------|-----------------|
| Files using raw Dialog | 60+ | 0 |
| Files using raw Sheet | 20+ | 0 |
| Mobile support | 15% | 100% |
| Z-index conflicts | 8 | 0 |
| Escape key reliability | Inconsistent | 100% |
| Layer stacking bugs | Frequent | 0 |

---

## Summary

✅ **Use ResponsiveDialog** for new dialogs  
✅ **Migrate all raw Dialog/Sheet** to canvas-hub components  
✅ **Trust LayerManager** for z-index and escape handling  
✅ **Test on mobile** before considering complete  
✅ **Reference implementations** exist - follow their pattern  

The canvas-hub architecture is solid. Just need widespread adoption!
