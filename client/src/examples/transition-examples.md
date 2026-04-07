DEPRECATED: These examples use the old transition system. Use Canvas Hub TransitionLoader instead (see client/src/components/canvas-hub/TransitionLoader.tsx)

# Universal Transition System - Usage Guide

The WorkforceOS transition system provides a branded, animated overlay for all major user actions throughout the platform. It ensures smooth transitions between pages, during authentication, and for form submissions.

## Features
- ✅ Animated WorkforceOS logo
- ✅ Multiple status states (loading, success, error, info)
- ✅ Auto-redirect capability
- ✅ Customizable messages
- ✅ Smooth animations with Framer Motion
- ✅ Mobile-optimized for APK conversion

## Basic Usage

### 1. Import the hook
```tsx
import { useTransition } from "@/contexts/transition-context";
```

### 2. Use in your component
```tsx
function MyComponent() {
  const transition = useTransition();
  
  const handleAction = () => {
    transition.showTransition({
      status: "loading",
      message: "Processing...",
      submessage: "Please wait"
    });
    
    // Your action here
    
    // Hide when done
    transition.hideTransition();
  };
}
```

## Utility Functions

### Authentication Transitions

#### Login
```tsx
import { showLoginTransition, showSuccessTransition } from "@/lib/transition-utils";
import { useTransition } from "@/contexts/transition-context";

function LoginPage() {
  const transition = useTransition();
  
  const handleLogin = async (data) => {
    showLoginTransition(transition, data.email);
    
    const result = await loginUser(data);
    
    if (result.success) {
      showSuccessTransition(
        transition,
        "Login Successful!",
        "/dashboard",
        `Welcome back, ${data.email.split('@')[0]}!`
      );
    }
  };
}
```

#### Logout
```tsx
import { showLogoutTransition } from "@/lib/transition-utils";
import { useTransition } from "@/contexts/transition-context";

function Sidebar() {
  const transition = useTransition();
  
  const handleLogout = () => {
    showLogoutTransition(transition);
    // Auto-redirects to /login after animation
  };
}
```

### Form Submission Transitions

```tsx
import { handleFormSubmissionWithTransition } from "@/lib/transition-utils";
import { useTransition } from "@/contexts/transition-context";

function EmployeeForm() {
  const transition = useTransition();
  
  const onSubmit = async (data) => {
    await handleFormSubmissionWithTransition(
      transition,
      () => createEmployee(data),
      {
        loadingMessage: "Creating employee...",
        successMessage: "Employee added successfully!",
        errorMessage: "Failed to create employee",
        redirectTo: "/employees"
      }
    );
  };
}
```

### Success with Redirect
```tsx
import { showSuccessTransition } from "@/lib/transition-utils";

const handleSave = async () => {
  const result = await saveData();
  
  showSuccessTransition(
    transition,
    "Settings Saved!",
    "/dashboard",
    "Your changes have been applied"
  );
};
```

### Error Handling
```tsx
import { showErrorTransition } from "@/lib/transition-utils";

const handleAction = async () => {
  try {
    await riskyOperation();
  } catch (error) {
    showErrorTransition(
      transition,
      "Operation Failed",
      error.message
    );
  }
};
```

### Info Messages
```tsx
import { showInfoTransition } from "@/lib/transition-utils";

const handleVerification = () => {
  showInfoTransition(
    transition,
    "Email Sent",
    undefined, // no redirect
    "Check your inbox for verification link"
  );
};
```

### Navigation with Transition
```tsx
import { navigateWithTransition } from "@/lib/transition-utils";

const goToPage = () => {
  navigateWithTransition(
    transition,
    "/employees",
    "Loading employees..."
  );
};
```

## Status Types

### Loading (default)
Shows spinning icon with message
```tsx
transition.showTransition({
  status: "loading",
  message: "Loading...",
  submessage: "Please wait"
});
```

### Success
Shows checkmark with message, auto-hides after duration
```tsx
transition.showTransition({
  status: "success",
  message: "Success!",
  submessage: "Operation completed",
  duration: 2000
});
```

### Error
Shows X icon with message
```tsx
transition.showTransition({
  status: "error",
  message: "Error!",
  submessage: "Something went wrong",
  duration: 3000
});
```

### Info
Shows info icon with message
```tsx
transition.showTransition({
  status: "info",
  message: "Notice",
  submessage: "Important information",
  duration: 2000
});
```

## Advanced Usage

### Manual Control
```tsx
// Show
transition.showTransition({
  status: "loading",
  message: "Processing..."
});

// Update
transition.updateTransition({
  status: "success",
  message: "Complete!"
});

// Hide
transition.hideTransition();
```

### Auto-hide with Callback
```tsx
transition.showTransition({
  status: "info",
  message: "Redirecting...",
  duration: 1500,
  onComplete: () => {
    console.log("Transition finished!");
    // Custom action here
  }
});
```

## Best Practices

1. **Always show feedback** - Users should see visual confirmation for actions
2. **Use appropriate status** - Match the status to the action result
3. **Keep messages short** - Brief, clear messages work best
4. **Auto-redirect on success** - Navigate users after successful operations
5. **Handle errors gracefully** - Show helpful error messages with details
6. **Test on mobile** - Ensure transitions work smoothly for APK

## Examples in WorkforceOS

### Already Implemented
- ✅ Login page (`/login`)
- ✅ Logout (sidebar)

### Ready to Implement
- Form submissions (employees, clients, schedules)
- Data deletions with confirmation
- File uploads
- Report generation
- Export operations
- Bulk actions
- Settings saves

## Integration Checklist

For any new feature:
- [ ] Import useTransition hook
- [ ] Add loading state for async operations
- [ ] Show success transition on completion
- [ ] Show error transition on failure
- [ ] Add redirect if navigation needed
- [ ] Test on mobile view
