import { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

type MaxWidth = "4xl" | "5xl" | "6xl" | "7xl" | "full"

interface UniversalPageLayoutProps {
  children: ReactNode
  className?: string
  title?: string
  titleTestId?: string
  description?: string
  actions?: ReactNode
  maxWidth?: MaxWidth
  heroGradient?: boolean
  noPadding?: boolean
  fullHeight?: boolean
}

const maxWidthClasses: Record<MaxWidth, string> = {
  "4xl": "max-w-4xl 2xl:max-w-5xl",
  "5xl": "max-w-5xl xl:max-w-6xl 2xl:max-w-[1400px]",
  "6xl": "max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px]",
  "7xl": "max-w-7xl 2xl:max-w-[1400px]",
  "full": "max-w-full",
}

export function UniversalPageLayout({
  children,
  className,
  title,
  titleTestId,
  description,
  actions,
  maxWidth = "7xl",
  heroGradient = false,
  noPadding = false,
  fullHeight = false,
}: UniversalPageLayoutProps) {
  const isMobile = useIsMobile()

  return (
    <div
      className={cn(
        "bg-background w-full min-w-0",
        "overflow-x-hidden overflow-y-auto",
        fullHeight && "min-h-full",
        heroGradient && "bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10",
        className
      )}
    >
      <div
        className={cn(
          "min-w-0 mx-auto",
          maxWidthClasses[maxWidth],
          !noPadding && (isMobile ? "px-3 py-4" : "px-6 py-6"),
        )}
      >
        {(title || description || actions) && (
          <div className={cn("mb-4 sm:mb-6", (title && actions) && "flex items-start justify-between gap-3 flex-wrap")}>
            <div className="space-y-1 min-w-0 flex-1">
              {title && (
                <h1
                  data-testid={titleTestId || "text-page-title"}
                  className={cn(
                    "font-bold text-foreground leading-tight",
                    isMobile ? "text-xl" : "text-2xl sm:text-3xl"
                  )}
                >
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-sm sm:text-base text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {actions}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

interface UniversalPageSectionProps {
  children: ReactNode
  className?: string
  title?: string
  description?: string
  card?: boolean
  bordered?: boolean
  spacing?: "sm" | "md" | "lg"
}

export function UniversalPageSection({
  children,
  className,
  title,
  description,
  card = false,
  bordered = false,
  spacing = "md",
}: UniversalPageSectionProps) {
  const spacingClasses = {
    sm: "mb-4",
    md: "mb-6 sm:mb-8",
    lg: "mb-8 sm:mb-12",
  }

  return (
    <section
      className={cn(
        "space-y-4 sm:space-y-6",
        spacingClasses[spacing],
        card && "bg-card border border-border rounded-md p-4 sm:p-6",
        bordered && !card && "border-b border-border pb-6 sm:pb-8",
        className
      )}
    >
      {(title || description) && (
        <div className="space-y-1 sm:space-y-2">
          {title && (
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              {title}
            </h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
