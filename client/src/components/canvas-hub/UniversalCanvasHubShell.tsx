"use client"

import * as React from "react"
import { createContext, useContext, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { LayerManagerProvider } from "./LayerManager"

export interface CanvasHubConfig {
  title: string
  subtitle?: string
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl" | "full"
  showHeader?: boolean
  headerActions?: React.ReactNode
  headerLeft?: React.ReactNode
  sidePanel?: React.ReactNode
  sidePanelWidth?: number
  sidePanelOpen?: boolean
  onSidePanelToggle?: () => void
}

interface CanvasHubContextValue {
  config: CanvasHubConfig
  setConfig: (config: Partial<CanvasHubConfig>) => void
  isSidePanelOpen: boolean
  toggleSidePanel: () => void
  registerModal: (id: string) => void
  unregisterModal: (id: string) => void
  activeModals: string[]
}

const CanvasHubContext = createContext<CanvasHubContextValue | null>(null)

export function useCanvasHub() {
  const context = useContext(CanvasHubContext)
  if (!context) {
    return {
      config: { title: '' },
      setConfig: () => {},
      isSidePanelOpen: false,
      toggleSidePanel: () => {},
      registerModal: () => {},
      unregisterModal: () => {},
      activeModals: [],
    }
  }
  return context
}

interface UniversalCanvasHubShellProps {
  children: React.ReactNode
  initialConfig?: Partial<CanvasHubConfig>
  className?: string
}

function CanvasHubShellInner({ children, initialConfig, className }: UniversalCanvasHubShellProps) {
  const isMobile = useIsMobile()
  const [config, setConfigState] = useState<CanvasHubConfig>({
    title: '',
    maxWidth: '7xl',
    showHeader: true,
    ...initialConfig,
  })
  const [isSidePanelOpen, setSidePanelOpen] = useState(false)
  const [activeModals, setActiveModals] = useState<string[]>([])

  const setConfig = useCallback((partial: Partial<CanvasHubConfig>) => {
    setConfigState(prev => ({ ...prev, ...partial }))
  }, [])

  const toggleSidePanel = useCallback(() => {
    setSidePanelOpen(prev => !prev)
  }, [])

  const registerModal = useCallback((id: string) => {
    setActiveModals(prev => [...prev.filter(m => m !== id), id])
  }, [])

  const unregisterModal = useCallback((id: string) => {
    setActiveModals(prev => prev.filter(m => m !== id))
  }, [])

  const maxWidthClasses = {
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full',
  }

  const contextValue: CanvasHubContextValue = {
    config,
    setConfig,
    isSidePanelOpen,
    toggleSidePanel,
    registerModal,
    unregisterModal,
    activeModals,
  }

  return (
    <CanvasHubContext.Provider value={contextValue}>
      <div className={cn(
        "flex flex-col w-full",
        isMobile ? "min-h-full" : "h-full overflow-hidden",
        "bg-background",
        className
      )}>
        {config.showHeader && (
          <header className={cn(
            "flex items-center justify-between gap-4 px-4 py-3",
            "border-b border-border bg-background",
            "min-h-[56px] shrink-0"
          )}>
            <div className="flex items-center gap-3 min-w-0">
              {config.headerLeft}
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate">
                  {config.title}
                </h1>
                {config.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {config.subtitle}
                  </p>
                )}
              </div>
            </div>
            {config.headerActions && (
              <div className="flex items-center gap-2 shrink-0">
                {config.headerActions}
              </div>
            )}
          </header>
        )}
        
        <div className={cn("flex flex-1", !isMobile && "overflow-hidden")}>
          {config.sidePanel && (
            <aside className={cn(
              "shrink-0 border-r border-border overflow-auto",
              "transition-all duration-200",
              isMobile ? (
                isSidePanelOpen ? "w-full absolute inset-0 bg-background" : "w-0"
              ) : (
                isSidePanelOpen || !isMobile ? `w-[${config.sidePanelWidth || 280}px]` : "w-0"
              )
            )}
            style={{ 
              width: isMobile 
                ? (isSidePanelOpen ? '100%' : 0) 
                : (config.sidePanelWidth || 280),
              zIndex: isMobile && isSidePanelOpen ? 'var(--z-index-sheet, 2001)' : undefined,
            }}
            >
              {config.sidePanel}
            </aside>
          )}
          
          <main className={cn(
            "flex-1 min-w-0",
            !isMobile && "overflow-auto",
            "relative"
          )}>
            <div className={cn(
              "mx-auto px-3 sm:px-4 py-3 sm:py-4 max-w-full",
              maxWidthClasses[config.maxWidth || '7xl']
            )}>
              {children}
            </div>
          </main>
        </div>
        
{/* Layer portal removed - overlays are handled by individual Sheet/Dialog components */}
      </div>
    </CanvasHubContext.Provider>
  )
}

export function UniversalCanvasHubShell(props: UniversalCanvasHubShellProps) {
  return (
    <LayerManagerProvider>
      <CanvasHubShellInner {...props} />
    </LayerManagerProvider>
  )
}

interface CanvasHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  leftContent?: React.ReactNode
  className?: string
}

export function CanvasHeader({ title, subtitle, actions, leftContent, className }: CanvasHeaderProps) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-2 sm:gap-4 flex-wrap max-w-full overflow-hidden",
      className
    )}>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
        {leftContent}
        <div className="min-w-0 overflow-hidden">
          <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
    </div>
  )
}

interface CanvasSectionProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function CanvasSection({ children, className, padding = 'md' }: CanvasSectionProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
  }

  return (
    <section className={cn(paddingClasses[padding], className)}>
      {children}
    </section>
  )
}

export { LayerManagerProvider } from "./LayerManager"
