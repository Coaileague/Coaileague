"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogStyledHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetStyledHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { VariantProps } from "class-variance-authority"
import { dialogContentVariants } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type DialogSize = VariantProps<typeof dialogContentVariants>["size"]

interface ContentPropsOverride {
  size?: DialogSize
  side?: "top" | "bottom" | "left" | "right"
  showHomeButton?: boolean
  homeButtonPath?: string
  isGuest?: boolean
  hideBuiltInClose?: boolean
  className?: string
}

const ContentPropsContext = React.createContext<{
  override: ContentPropsOverride | null
  setOverride: (props: ContentPropsOverride) => void
}>({ override: null, setOverride: () => {} })

interface UniversalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  size?: DialogSize
  side?: "top" | "bottom" | "left" | "right"
  showHomeButton?: boolean
  homeButtonPath?: string
  isGuest?: boolean
  hideBuiltInClose?: boolean
  className?: string
  forceMode?: "dialog" | "sheet"
  "data-testid"?: string
  style?: React.CSSProperties
}

function UniversalModalInner({
  open,
  onOpenChange,
  children,
  size = "default",
  side = "bottom",
  showHomeButton,
  homeButtonPath,
  isGuest,
  hideBuiltInClose,
  className,
  forceMode,
  "data-testid": testId,
  style,
}: UniversalModalProps) {
  const isMobile = useIsMobile()
  const useSheet = forceMode === "sheet" || (forceMode !== "dialog" && isMobile)
  const { override } = React.useContext(ContentPropsContext)

  const finalSize = override?.size ?? size
  const finalSide = override?.side ?? side
  const finalShowHomeButton = override?.showHomeButton ?? showHomeButton
  const finalHomeButtonPath = override?.homeButtonPath ?? homeButtonPath
  const finalIsGuest = override?.isGuest ?? isGuest
  const finalHideBuiltInClose = override?.hideBuiltInClose ?? hideBuiltInClose
  const finalClassName = override?.className ? cn(className, override.className) : className

  if (useSheet) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={finalSide}
          className={finalClassName}
          showHomeButton={finalShowHomeButton}
          homeButtonPath={finalHomeButtonPath}
          isGuest={finalIsGuest}
          hideBuiltInClose={finalHideBuiltInClose}
          data-testid={testId}
          style={style}
        >
          {children}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size={finalSize}
        className={finalClassName}
        showHomeButton={finalShowHomeButton}
        homeButtonPath={finalHomeButtonPath}
        isGuest={finalIsGuest}
        hideBuiltInClose={finalHideBuiltInClose}
        data-testid={testId}
        style={style}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

function UniversalModal(props: UniversalModalProps) {
  const [override, setOverride] = React.useState<ContentPropsOverride | null>(null)
  return (
    <ContentPropsContext.Provider value={{ override, setOverride }}>
      <UniversalModalInner {...props} />
    </ContentPropsContext.Provider>
  )
}

interface UniversalModalContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right"
  showHomeButton?: boolean
  homeButtonPath?: string
  isGuest?: boolean
  hideBuiltInClose?: boolean
  size?: DialogSize
  "data-testid"?: string
}

function UniversalModalContent({
  children,
  className,
  side,
  showHomeButton,
  homeButtonPath,
  isGuest,
  hideBuiltInClose,
  size,
  ...rest
}: UniversalModalContentProps) {
  const { setOverride } = React.useContext(ContentPropsContext)

  React.useLayoutEffect(() => {
    const props: ContentPropsOverride = {}
    if (size !== undefined) props.size = size
    if (side !== undefined) props.side = side
    if (showHomeButton !== undefined) props.showHomeButton = showHomeButton
    if (homeButtonPath !== undefined) props.homeButtonPath = homeButtonPath
    if (isGuest !== undefined) props.isGuest = isGuest
    if (hideBuiltInClose !== undefined) props.hideBuiltInClose = hideBuiltInClose
    if (className !== undefined) props.className = className
    if (Object.keys(props).length > 0) {
      setOverride(props)
    }
    // @ts-expect-error — TS migration: fix in refactoring sprint
    return () => setOverride(null)
  }, [size, side, showHomeButton, homeButtonPath, isGuest, hideBuiltInClose, className, setOverride])

  return <>{children}</>
}

interface UniversalModalHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

function UniversalModalHeader({ className, ...props }: UniversalModalHeaderProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetHeader className={className} {...props} />
  }
  return <DialogHeader className={className} {...props} />
}

interface UniversalModalStyledHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "gradient"
  showClose?: boolean
  onClose?: () => void
}

const UniversalModalStyledHeader = React.forwardRef<HTMLDivElement, UniversalModalStyledHeaderProps>(
  ({ className, variant, showClose, onClose, ...props }, ref) => {
    const isMobile = useIsMobile()
    if (isMobile) {
      return <SheetStyledHeader ref={ref} className={className} variant={variant} showClose={showClose} onClose={onClose} {...props} />
    }
    return <DialogStyledHeader ref={ref} className={className} variant={variant} showClose={showClose} onClose={onClose} {...props} />
  }
)
UniversalModalStyledHeader.displayName = "UniversalModalStyledHeader"

function UniversalModalBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetBody className={className} {...props} />
  }
  return <DialogBody className={className} {...props} />
}

function UniversalModalFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetFooter className={className} {...props} />
  }
  return <DialogFooter className={className} {...props} />
}

const UniversalModalTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetTitle ref={ref} className={className} {...props} />
  }
  return <DialogTitle ref={ref} className={className} {...props} />
})
UniversalModalTitle.displayName = "UniversalModalTitle"

const UniversalModalDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetDescription ref={ref} className={className} {...props} />
  }
  return <DialogDescription ref={ref} className={className} {...props} />
})
UniversalModalDescription.displayName = "UniversalModalDescription"

function UniversalModalClose({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogClose>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetClose {...props}>{children}</SheetClose>
  }
  return <DialogClose {...props}>{children}</DialogClose>
}

function UniversalModalTrigger({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogTrigger>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return <SheetTrigger {...props}>{children}</SheetTrigger>
  }
  return <DialogTrigger {...props}>{children}</DialogTrigger>
}

export {
  UniversalModal,
  UniversalModalContent,
  UniversalModalHeader,
  UniversalModalStyledHeader,
  UniversalModalBody,
  UniversalModalFooter,
  UniversalModalTitle,
  UniversalModalDescription,
  UniversalModalClose,
  UniversalModalTrigger,
}
