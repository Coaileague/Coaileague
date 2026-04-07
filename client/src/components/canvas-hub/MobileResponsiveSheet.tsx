"use client"

/**
 * Mobile Responsive Sheet - Canvas Hub Component
 * 
 * Fortune 500-grade mobile sheet with proper height adjustments, organized headers,
 * and 7-step process configuration integration for Universal Canvas Hub.
 * 
 * Features:
 * - Dynamic height calculation based on content and viewport
 * - Proper header organization with icon support
 * - Gradient headers for visual hierarchy
 * - LayerManager integration for z-index management
 * - Safe area insets for notched devices
 */

import * as React from "react"
import { useId, memo, useMemo, useEffect, useState, useCallback } from "react"
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalContent } from '@/components/ui/universal-modal'
import { useManagedLayer } from "./LayerManager"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { X, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

// 7-Step Process Configuration for Sheet Operations
export const SHEET_PROCESS_STEPS = {
  INIT: 'INIT',           // Initialize sheet state
  MEASURE: 'MEASURE',     // Measure content and viewport
  CALCULATE: 'CALCULATE', // Calculate optimal height
  RENDER: 'RENDER',       // Render sheet content
  ANIMATE: 'ANIMATE',     // Apply animations
  INTERACT: 'INTERACT',   // Enable user interaction
  COMPLETE: 'COMPLETE',   // Sheet ready
} as const

export type SheetProcessStep = keyof typeof SHEET_PROCESS_STEPS

// Height presets for different content types
export const SHEET_HEIGHT_PRESETS = {
  compact: '40vh',    // For simple actions, confirmations
  default: '60vh',    // Standard content
  expanded: '80vh',   // Lists, forms, detailed content
  full: '95vh',       // Full-screen content
  auto: 'auto',       // Content-based (up to 90vh)
} as const

export type SheetHeightPreset = keyof typeof SHEET_HEIGHT_PRESETS

interface MobileResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: React.ReactNode
  titleIcon?: React.ReactNode
  subtitle?: string
  side?: "left" | "right" | "top" | "bottom"
  className?: string
  contentClassName?: string
  showCloseButton?: boolean
  headerGradient?: boolean
  maxHeight?: string
  heightPreset?: SheetHeightPreset
  showDragIndicator?: boolean
  stickyFooter?: React.ReactNode
  onProcessStep?: (step: SheetProcessStep) => void
}

export const MobileResponsiveSheet = memo(function MobileResponsiveSheet({
  open,
  onOpenChange,
  children,
  title,
  titleIcon,
  subtitle,
  side = "right",
  className,
  contentClassName,
  showCloseButton = true,
  headerGradient = true,
  maxHeight = "90vh",
  heightPreset,
  showDragIndicator = true,
  stickyFooter,
  onProcessStep,
}: MobileResponsiveSheetProps) {
  const isMobile = useIsMobile()
  const autoId = useId()
  const sheetId = `mobile-sheet-${autoId}`
  const [processStep, setProcessStep] = useState<SheetProcessStep>('INIT')
  
  const { zIndex } = useManagedLayer({
    id: sheetId,
    type: 'sheet',
    open,
    onOpenChange,
  })

  // Track process steps for 7-step architecture
  const updateProcessStep = useCallback((step: SheetProcessStep) => {
    setProcessStep(step)
    onProcessStep?.(step)
  }, [onProcessStep])

  // Calculate effective height based on preset or maxHeight
  const effectiveMaxHeight = useMemo(() => {
    if (heightPreset && SHEET_HEIGHT_PRESETS[heightPreset]) {
      return SHEET_HEIGHT_PRESETS[heightPreset]
    }
    return maxHeight
  }, [heightPreset, maxHeight])

  // Process step tracking
  useEffect(() => {
    if (open) {
      updateProcessStep('INIT')
      const timer1 = setTimeout(() => updateProcessStep('MEASURE'), 50)
      const timer2 = setTimeout(() => updateProcessStep('CALCULATE'), 100)
      const timer3 = setTimeout(() => updateProcessStep('RENDER'), 150)
      const timer4 = setTimeout(() => updateProcessStep('ANIMATE'), 250)
      const timer5 = setTimeout(() => updateProcessStep('INTERACT'), 400)
      const timer6 = setTimeout(() => updateProcessStep('COMPLETE'), 500)
      
      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
        clearTimeout(timer4)
        clearTimeout(timer5)
        clearTimeout(timer6)
      }
    }
  }, [open, updateProcessStep])

  const sheetWidth = useMemo(() => {
    if (side !== "left" && side !== "right") return undefined
    return isMobile ? "min(85vw, 320px)" : "320px"
  }, [side, isMobile])

  // Calculate safe area for notched devices
  const safeAreaInsets = isMobile ? "env(safe-area-inset-bottom, 16px)" : "0px"

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent 
        side={side} 
        hideBuiltInClose={!!(title || subtitle) || !showCloseButton}
        style={{ 
          width: sheetWidth,
          maxHeight: side === "bottom" || side === "top" ? effectiveMaxHeight : undefined,
          zIndex,
          paddingBottom: side === "bottom" ? safeAreaInsets : undefined,
        }}
        className={cn(
          "!p-0 flex flex-col !overflow-x-hidden h-full",
          "!overflow-y-auto overscroll-contain",
          (side === "bottom" || side === "top") && "rounded-t-xl",
          contentClassName
        )}
      >
        {/* Drag Indicator for Bottom Sheets - tappable to close */}
        {showDragIndicator && (side === "bottom" || side === "top") && isMobile && (
          <button
            className="flex justify-center w-full pt-2 pb-1 shrink-0 cursor-pointer"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            data-testid="button-sheet-drag-close"
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </button>
        )}

        {/* Organized Header with Proper Structure */}
        {(title || subtitle) && (
          <div className={cn(
            "sticky top-0 z-10 border-b border-border/50 shrink-0",
            "px-4 py-3",
            isMobile && "px-3 py-2.5",
            headerGradient && "bg-gradient-to-r from-primary/10 to-secondary/10"
          )}>
            <UniversalModalHeader className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {titleIcon && (
                    <div className="shrink-0 flex items-center justify-center w-6 h-6 rounded-md bg-primary/10">
                      {titleIcon}
                    </div>
                  )}
                  <UniversalModalTitle className={cn(
                    "text-sm font-semibold leading-tight truncate",
                    isMobile && "text-xs",
                    headerGradient && "text-primary"
                  )}>
                    {title}
                  </UniversalModalTitle>
                </div>
                {showCloseButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-sheet-close"
                  >
                    {side === "bottom" ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="sr-only">Close</span>
                  </Button>
                )}
              </div>
              {subtitle && (
                <UniversalModalDescription className={cn(
                  "text-xs text-muted-foreground line-clamp-2",
                  isMobile && "text-[11px]"
                )}>
                  {subtitle}
                </UniversalModalDescription>
              )}
            </UniversalModalHeader>
          </div>
        )}
        
        {/* Content Area — fills remaining space, scrolling handled by parent container */}
        <div
          className={cn(
            "flex-1 overflow-x-hidden",
            className
          )}
          style={{
            touchAction: 'pan-y',
            minHeight: 0,
          }}
        >
          {children}
        </div>

        {/* Sticky Footer */}
        {stickyFooter && (
          <div className={cn(
            "sticky bottom-0 z-10 border-t border-border/50 shrink-0",
            "px-4 py-3 bg-background",
            isMobile && "px-3 py-2.5"
          )}>
            {stickyFooter}
          </div>
        )}
      </UniversalModalContent>
    </UniversalModal>
  )
})

interface NavigationSheetItemProps {
  icon?: React.ReactNode
  label: string
  onClick?: () => void
  isActive?: boolean
  variant?: "default" | "destructive"
  className?: string
}

export function NavigationSheetItem({
  icon,
  label,
  onClick,
  isActive,
  variant = "default",
  className,
}: NavigationSheetItemProps) {
  return (
    <Button
      variant={isActive ? "default" : "ghost"}
      className={cn(
        "w-full justify-start gap-2 h-auto py-2.5 px-3 min-h-0",
        "text-xs sm:text-sm",
        variant === "destructive" && "text-destructive hover:bg-destructive/10",
        className
      )}
      onClick={onClick}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
    </Button>
  )
}

interface NavigationSheetSectionProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export function NavigationSheetSection({
  title,
  children,
  className,
}: NavigationSheetSectionProps) {
  return (
    <div className={cn("space-y-1", className)} style={{ touchAction: 'pan-y' }}>
      {title && (
        <div className="px-2 py-1 pointer-events-none" style={{ touchAction: 'pan-y' }}>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </span>
        </div>
      )}
      <div className="space-y-0.5 bg-muted/30 rounded-lg p-1.5" style={{ touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  )
}
