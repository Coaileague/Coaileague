"use client"

import * as React from "react"
import { useId, memo } from "react"
import { UniversalModal, UniversalModalHeader, UniversalModalTitle, UniversalModalDescription, UniversalModalFooter, UniversalModalContent } from '@/components/ui/universal-modal'
import { useManagedLayer } from "./LayerManager"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

interface ManagedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: string
  description?: string
  footer?: React.ReactNode
  size?: "sm" | "md" | "lg" | "xl" | "full"
  className?: string
  contentClassName?: string
}

export const ManagedDialog = memo(function ManagedDialog({
  open,
  onOpenChange,
  children,
  title,
  description,
  footer,
  size = "md",
  className,
  contentClassName,
}: ManagedDialogProps) {
  const autoId = useId()
  const dialogId = `dialog-${autoId}`
  
  const { zIndex } = useManagedLayer({
    id: dialogId,
    type: 'dialog',
    open,
    onOpenChange,
  })

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent 
        size={size}
        className={cn(contentClassName)}
        style={{ zIndex }}
      >
        {(title || description) && (
          <UniversalModalHeader>
            {title && <UniversalModalTitle>{title}</UniversalModalTitle>}
            {description && <UniversalModalDescription>{description}</UniversalModalDescription>}
          </UniversalModalHeader>
        )}
        <div className={className}>
          {children}
        </div>
        {footer && (
          <UniversalModalFooter>
            {footer}
          </UniversalModalFooter>
        )}
      </UniversalModalContent>
    </UniversalModal>
  )
})

interface ManagedSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  side?: "left" | "right" | "top" | "bottom"
  title?: string
  description?: string
  className?: string
}

export const ManagedSheet = memo(function ManagedSheet({
  open,
  onOpenChange,
  children,
  side = "right",
  title,
  description,
  className,
}: ManagedSheetProps) {
  const autoId = useId()
  const sheetId = `sheet-${autoId}`
  
  const { zIndex } = useManagedLayer({
    id: sheetId,
    type: 'sheet',
    open,
    onOpenChange,
  })

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent side={side} className={className}>
        {(title || description) && (
          <UniversalModalHeader>
            {title && <UniversalModalTitle>{title}</UniversalModalTitle>}
            {description && <UniversalModalDescription>{description}</UniversalModalDescription>}
          </UniversalModalHeader>
        )}
        {children}
      </UniversalModalContent>
    </UniversalModal>
  )
})

interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  title?: React.ReactNode
  description?: string
  footer?: React.ReactNode
  size?: "sm" | "md" | "lg" | "xl" | "full"
  sheetSide?: "left" | "right" | "top" | "bottom"
  className?: string
  contentClassName?: string
}

export const ResponsiveDialog = memo(function ResponsiveDialog({
  open,
  onOpenChange,
  children,
  title,
  description,
  footer,
  size = "md",
  sheetSide = "bottom",
  className,
  contentClassName,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile()
  const autoId = useId()
  const layerId = `responsive-${autoId}`
  
  const { zIndex } = useManagedLayer({
    id: layerId,
    type: isMobile ? 'sheet' : 'dialog',
    open,
    onOpenChange,
  })

  if (isMobile) {
    return (
      <UniversalModal open={open} onOpenChange={onOpenChange}>
        <UniversalModalContent side={sheetSide} className={cn("overflow-y-auto", contentClassName)}>
          {(title || description) && (
            <UniversalModalHeader>
              {title && <UniversalModalTitle>{title}</UniversalModalTitle>}
              {description && <UniversalModalDescription>{description}</UniversalModalDescription>}
            </UniversalModalHeader>
          )}
          <div className={className}>
            {children}
          </div>
          {footer && (
            <div className="mt-4 flex justify-end gap-2">
              {footer}
            </div>
          )}
        </UniversalModalContent>
      </UniversalModal>
    )
  }

  return (
    <UniversalModal open={open} onOpenChange={onOpenChange}>
      <UniversalModalContent 
        size={size}
        className={cn("overflow-y-auto", contentClassName)}
        style={{ zIndex }}
      >
        {(title || description) && (
          <UniversalModalHeader>
            {title && <UniversalModalTitle>{title}</UniversalModalTitle>}
            {description && <UniversalModalDescription>{description}</UniversalModalDescription>}
          </UniversalModalHeader>
        )}
        <div className={className}>
          {children}
        </div>
        {footer && (
          <UniversalModalFooter>
            {footer}
          </UniversalModalFooter>
        )}
      </UniversalModalContent>
    </UniversalModal>
  )
})
