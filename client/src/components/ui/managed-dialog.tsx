import React from 'react';
/**
 * ManagedDialog - A Dialog wrapper that enforces modal exclusivity
 * 
 * This component ensures only one modal can be open at a time by integrating
 * with the OverlayController mutex. It works as a drop-in replacement for Dialog.
 * 
 * Usage:
 * - Controlled: Pass `open` and `onOpenChange` props (recommended)
 * - Uncontrolled: Pass `defaultOpen` prop (converted to controlled internally)
 * 
 * The mutex is enforced synchronously - if another modal is active, the open
 * request will be vetoed and the dialog will remain closed.
 */

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useOverlayController } from '@/contexts/overlay-controller';

interface ManagedDialogProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  modalId: string;
}

export function ManagedDialog({ 
  modalId, 
  open: controlledOpen, 
  defaultOpen, 
  onOpenChange, 
  children, 
  ...props 
}: ManagedDialogProps) {
  const { tryActivate, unregisterModal } = useOverlayController();
  
  // Warn if both controlled and uncontrolled props are provided
  if (process.env.NODE_ENV === 'development' && controlledOpen !== undefined && defaultOpen !== undefined) {
    console.warn(`[ManagedDialog "${modalId}"] Both 'open' and 'defaultOpen' props provided. Using 'open' (controlled mode).`);
  }
  
  // Determine if this is a controlled or uncontrolled dialog
  const isControlled = controlledOpen !== undefined;
  
  // Internal state for uncontrolled mode (initialized from defaultOpen)
  const [internalOpen, setInternalOpen] = useState(defaultOpen || false);
  
  // Track if the dialog has been blocked by the mutex
  const [isBlocked, setIsBlocked] = useState(false);
  
  // Single source of truth for open state
  const currentOpen = isControlled ? controlledOpen : internalOpen;
  
  // Actual open state passed to Radix (forced to false if blocked)
  const effectiveOpen = isBlocked ? false : currentOpen;
  
  // Track the last known open state to detect transitions (initialize to false to catch initial-open scenarios)
  const prevOpenRef = useRef(false);
  
  // Handle open state transitions SYNCHRONOUSLY before paint using useLayoutEffect
  useLayoutEffect(() => {
    const wasOpen = prevOpenRef.current;
    const isOpen = currentOpen;
    
    // Transition: closed -> open
    if (!wasOpen && isOpen) {
      // Attempt to activate (will fail if another modal is active)
      const activated = tryActivate(modalId);
      if (!activated) {
        // Mutex blocked this modal - set blocked flag to force close BEFORE render
        setIsBlocked(true);
        
        // Notify parent/handler
        if (!isControlled) {
          setInternalOpen(false);
        } else {
          if (onOpenChange) {
            onOpenChange(false);
          }
        }
      } else {
        // Successfully activated - clear any previous blocked state
        setIsBlocked(false);
      }
    }
    
    // Transition: open -> closed
    if (wasOpen && !isOpen) {
      unregisterModal(modalId);
      setIsBlocked(false); // Clear blocked state when closing
    }
    
    prevOpenRef.current = currentOpen;
  }, [currentOpen, modalId, tryActivate, unregisterModal, isControlled, onOpenChange]);
  
  // Cleanup on unmount - use ref to get latest open state
  useEffect(() => {
    return () => {
      // Use prevOpenRef to get the latest open state at unmount time
      if (prevOpenRef.current) {
        unregisterModal(modalId);
      }
    };
  }, [modalId, unregisterModal]);
  
  // Enhanced onOpenChange that updates internal state for uncontrolled mode
  const handleOpenChange = useCallback((open: boolean) => {
    // For uncontrolled mode, update internal state
    // The mutex check will happen in the effect above
    if (!isControlled) {
      setInternalOpen(open);
    }
    
    // Always call parent's onOpenChange if provided
    if (onOpenChange) {
      onOpenChange(open);
    }
  }, [isControlled, onOpenChange]);
  
  return (
    <DialogPrimitive.Root 
      open={effectiveOpen}
      onOpenChange={handleOpenChange} 
      {...props}
    >
      {children}
    </DialogPrimitive.Root>
  );
}
