"use client"

import * as React from "react"
import { useCallback, useRef, useState, useEffect, useMemo } from "react"
import { triggerHaptic } from "@/hooks/use-touch-swipe"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface ModalGuardContextValue {
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (value: boolean) => void
  requestClose: () => void
  forceClose: () => void
}

const ModalGuardContext = React.createContext<ModalGuardContextValue | null>(null)

export function useModalGuard() {
  const context = React.useContext(ModalGuardContext)
  if (!context) {
    return {
      hasUnsavedChanges: false,
      setHasUnsavedChanges: () => {},
      requestClose: () => {},
      forceClose: () => {},
    }
  }
  return context
}

interface ModalGuardProps {
  children: React.ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  discardWarningTitle?: string
  discardWarningDescription?: string
  discardButtonText?: string
  keepEditingText?: string
}

export function ModalGuard({
  children,
  open,
  onOpenChange,
  discardWarningTitle = "Discard changes?",
  discardWarningDescription = "You have unsaved changes that will be lost if you close this form.",
  discardButtonText = "Discard",
  keepEditingText = "Keep editing",
}: ModalGuardProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showDiscardWarning, setShowDiscardWarning] = useState(false)

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) {
      triggerHaptic('medium')
      setShowDiscardWarning(true)
    } else {
      onOpenChange(false)
    }
  }, [hasUnsavedChanges, onOpenChange])

  const forceClose = useCallback(() => {
    setHasUnsavedChanges(false)
    setShowDiscardWarning(false)
    onOpenChange(false)
  }, [onOpenChange])

  const handleKeepEditing = useCallback(() => {
    setShowDiscardWarning(false)
  }, [])

  useEffect(() => {
    if (!open) {
      setHasUnsavedChanges(false)
      setShowDiscardWarning(false)
    }
  }, [open])

  const contextValue: ModalGuardContextValue = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    requestClose,
    forceClose,
  }

  return (
    <ModalGuardContext.Provider value={contextValue}>
      {children}
      <AlertDialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{discardWarningTitle}</AlertDialogTitle>
            <AlertDialogDescription>{discardWarningDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel 
              onClick={handleKeepEditing}
              className="min-h-11"
              data-testid="button-keep-editing"
            >
              {keepEditingText}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={forceClose}
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-discard-changes"
            >
              {discardButtonText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModalGuardContext.Provider>
  )
}

interface SwipeToCloseSheetProps {
  children: React.ReactNode
  onClose: () => void
  direction?: 'down' | 'right' | 'left'
  threshold?: number
  disabled?: boolean
}

export function SwipeToCloseSheet({
  children,
  onClose,
  direction = 'down',
  threshold = 80,
  disabled = false,
}: SwipeToCloseSheetProps) {
  const startPos = useRef({ x: 0, y: 0 })
  const [swipeDistance, setSwipeDistance] = useState(0)
  const [isSwiping, setIsSwiping] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return
    startPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
    setIsSwiping(true)
  }, [disabled])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSwiping || disabled) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    
    let distance = 0
    if (direction === 'down') {
      distance = currentY - startPos.current.y
    } else if (direction === 'right') {
      distance = currentX - startPos.current.x
    } else if (direction === 'left') {
      distance = startPos.current.x - currentX
    }

    if (distance > 0) {
      setSwipeDistance(Math.min(distance, threshold * 2))
    }
  }, [isSwiping, direction, threshold, disabled])

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping || disabled) return

    if (swipeDistance >= threshold) {
      triggerHaptic('medium')
      onClose()
    }

    setSwipeDistance(0)
    setIsSwiping(false)
  }, [isSwiping, swipeDistance, threshold, onClose, disabled])

  const progress = Math.min((swipeDistance / threshold) * 100, 100)
  
  const transformStyle = React.useMemo(() => {
    if (swipeDistance === 0) return {}
    
    if (direction === 'down') {
      return { transform: `translateY(${swipeDistance * 0.3}px)` }
    } else if (direction === 'right') {
      return { transform: `translateX(${swipeDistance * 0.3}px)` }
    } else if (direction === 'left') {
      return { transform: `translateX(-${swipeDistance * 0.3}px)` }
    }
    return {}
  }, [swipeDistance, direction])

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={transformStyle}
      className="relative"
    >
      {isSwiping && progress > 20 && (
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-6 text-xs text-muted-foreground opacity-70"
          style={{ opacity: progress / 100 }}
        >
          {progress >= 100 ? 'Release to close' : 'Swipe to close'}
        </div>
      )}
      {children}
    </div>
  )
}

interface MobileSheetHandleProps {
  className?: string
  onTap?: () => void
}

export function MobileSheetHandle({ className, onTap }: MobileSheetHandleProps) {
  return (
    <div 
      className={`flex justify-center py-2 cursor-grab active:cursor-grabbing ${className || ''}`}
      onClick={onTap}
      role="button"
      tabIndex={0}
      aria-label="Drag to close or tap for options"
      data-testid="handle-sheet-drag"
    >
      <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
    </div>
  )
}

interface SafeDialogTitleProps {
  children?: React.ReactNode
  visuallyHidden?: boolean
  className?: string
}

export function SafeDialogTitle({ 
  children = "Dialog", 
  visuallyHidden = false,
  className 
}: SafeDialogTitleProps) {
  if (visuallyHidden) {
    return (
      <span className="sr-only">{children}</span>
    )
  }
  return <>{children}</>
}

interface SafeDialogDescriptionProps {
  children?: React.ReactNode
  visuallyHidden?: boolean
  className?: string
}

export function SafeDialogDescription({ 
  children = "Dialog content", 
  visuallyHidden = false,
  className 
}: SafeDialogDescriptionProps) {
  if (visuallyHidden) {
    return (
      <span className="sr-only">{children}</span>
    )
  }
  return <>{children}</>
}

interface ModalGuardContentProps {
  children: React.ReactNode
  isDirty: boolean
}

export function ModalGuardContent({ children, isDirty }: ModalGuardContentProps) {
  const { setHasUnsavedChanges } = useModalGuard()

  useEffect(() => {
    setHasUnsavedChanges(isDirty)
  }, [isDirty, setHasUnsavedChanges])

  return <>{children}</>
}
