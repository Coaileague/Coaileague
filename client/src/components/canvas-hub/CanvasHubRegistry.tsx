"use client"

import * as React from "react"
import { createContext, useContext, useMemo } from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { useLayerManager, LayerManagerProvider } from "./LayerManager"
import { MobilePageWrapper, MobilePageHeader } from "@/components/mobile-page-wrapper"
import { WorkspaceLayout } from "@/components/workspace-layout"

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

export type PageCategory = 
  | 'public'      
  | 'auth'        
  | 'dashboard'   
  | 'operations'  
  | 'communication' 
  | 'admin'       
  | 'settings'    
  | 'error'       
  | 'legal'       

export type PageVariant = 
  | 'standard'    
  | 'fullWidth'   
  | 'centered'    
  | 'split'       
  | 'chat'        
  | 'marketing'   

export interface CanvasPageConfig {
  id: string
  title: string
  subtitle?: string
  category: PageCategory
  variant?: PageVariant
  maxWidth?: "4xl" | "5xl" | "6xl" | "7xl" | "full"
  showHeader?: boolean
  enablePullToRefresh?: boolean
  withBottomNav?: boolean
  showSeasonalBanner?: boolean
  showSeasonalEffects?: boolean
  heroGradient?: boolean
  requiresAuth?: boolean
  headerActions?: React.ReactNode
  backButton?: boolean
  onBack?: () => void
  onRefresh?: () => Promise<void> | void
  className?: string
  icon?: React.ReactNode
  description?: string
}

const DEFAULT_CONFIG: Partial<CanvasPageConfig> = {
  variant: 'standard',
  maxWidth: '7xl',
  showHeader: true,
  enablePullToRefresh: true,
  withBottomNav: true,
  showSeasonalBanner: true,
  showSeasonalEffects: true,
  heroGradient: false,
  requiresAuth: true,
}

const CATEGORY_DEFAULTS: Record<PageCategory, Partial<CanvasPageConfig>> = {
  public: {
    requiresAuth: false,
    showSeasonalBanner: true,
    withBottomNav: false,
  },
  auth: {
    requiresAuth: false,
    variant: 'centered',
    showHeader: false,
    withBottomNav: false,
    showSeasonalBanner: false,
  },
  dashboard: {
    variant: 'standard',
    maxWidth: '7xl',
    enablePullToRefresh: true,
  },
  operations: {
    variant: 'standard',
    maxWidth: '7xl',
    enablePullToRefresh: true,
  },
  communication: {
    variant: 'chat',
    maxWidth: 'full',
    withBottomNav: false,
    enablePullToRefresh: false,
  },
  admin: {
    variant: 'standard',
    maxWidth: '7xl',
    heroGradient: false,
  },
  settings: {
    variant: 'standard',
    maxWidth: '5xl',
  },
  error: {
    variant: 'centered',
    requiresAuth: false,
    showHeader: false,
    withBottomNav: false,
    showSeasonalBanner: false,
    showSeasonalEffects: false,
  },
  legal: {
    variant: 'standard',
    requiresAuth: false,
    maxWidth: '5xl',
    withBottomNav: false,
    showSeasonalBanner: false,
  },
}

function resolveConfig(config: CanvasPageConfig): Required<CanvasPageConfig> {
  const categoryDefaults = CATEGORY_DEFAULTS[config.category] || {}
  return {
    ...DEFAULT_CONFIG,
    ...categoryDefaults,
    ...config,
    id: config.id,
    title: config.title,
    category: config.category,
  } as Required<CanvasPageConfig>
}

interface CanvasHubRegistryContextValue {
  config: Required<CanvasPageConfig> | null
  updateConfig: (updates: Partial<CanvasPageConfig>) => void
}

const CanvasHubRegistryContext = createContext<CanvasHubRegistryContextValue>({
  config: null,
  updateConfig: () => {},
})

export function useCanvasHubRegistry() {
  return useContext(CanvasHubRegistryContext)
}

interface CanvasHubPageProps {
  config: CanvasPageConfig
  children: React.ReactNode
  className?: string
}

export function CanvasHubPage({ config, children, className }: CanvasHubPageProps) {
  const isMobile = useIsMobile()
  const { hasActiveLayers } = useLayerManager()
  const [resolvedConfig, setResolvedConfig] = React.useState(() => resolveConfig(config))
  
  React.useEffect(() => {
    setResolvedConfig(resolveConfig(config))
  }, [config])
  
  const updateConfig = React.useCallback((updates: Partial<CanvasPageConfig>) => {
    setResolvedConfig(prev => resolveConfig({ ...prev, ...updates }))
  }, [])
  
  const contextValue = useMemo(() => ({
    config: resolvedConfig,
    updateConfig,
  }), [resolvedConfig, updateConfig])
  
  if (resolvedConfig.variant === 'centered') {
    return (
      <CanvasHubRegistryContext.Provider value={contextValue}>
        <div className={cn(
          "min-h-screen flex items-center justify-center",
          "bg-background",
          className
        )}>
          <div className="w-full max-w-md mx-auto px-4 py-8">
            {children}
          </div>
        </div>
      </CanvasHubRegistryContext.Provider>
    )
  }
  
  if (resolvedConfig.variant === 'fullWidth') {
    return (
      <CanvasHubRegistryContext.Provider value={contextValue}>
        <div className={cn(
          "min-h-screen w-full",
          "bg-background",
          className
        )}>
          {resolvedConfig.showHeader && (
            <header className={cn(
              "flex items-center justify-between gap-4 px-4 py-3",
              "border-b border-border bg-background",
              "min-h-[56px]"
            )}>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground truncate">
                  {resolvedConfig.title}
                </h1>
                {resolvedConfig.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {resolvedConfig.subtitle}
                  </p>
                )}
              </div>
              {resolvedConfig.headerActions && (
                <div className="flex items-center gap-2 shrink-0">
                  {resolvedConfig.headerActions}
                </div>
              )}
            </header>
          )}
          {children}
        </div>
      </CanvasHubRegistryContext.Provider>
    )
  }
  
  if (resolvedConfig.variant === 'chat') {
    return (
      <CanvasHubRegistryContext.Provider value={contextValue}>
        <div className={cn(
          "flex flex-col h-full w-full overflow-hidden",
          "bg-background",
          className
        )}>
          {children}
        </div>
      </CanvasHubRegistryContext.Provider>
    )
  }
  
  if (resolvedConfig.variant === 'marketing') {
    return (
      <CanvasHubRegistryContext.Provider value={contextValue}>
        <div className={cn(
          "min-h-screen w-full",
          "bg-background",
          className
        )}>
          {children}
        </div>
      </CanvasHubRegistryContext.Provider>
    )
  }
  
  if (isMobile) {
    return (
      <CanvasHubRegistryContext.Provider value={contextValue}>
        <MobilePageWrapper
          onRefresh={resolvedConfig.onRefresh}
          enablePullToRefresh={resolvedConfig.enablePullToRefresh}
          withBottomNav={resolvedConfig.withBottomNav}
          showSeasonalBanner={resolvedConfig.showSeasonalBanner}
          showSeasonalEffects={resolvedConfig.showSeasonalEffects}
          className={className}
        >
          {resolvedConfig.showHeader && (
            <MobilePageHeader
              title={resolvedConfig.title}
              subtitle={resolvedConfig.subtitle}
              action={resolvedConfig.headerActions}
              backButton={resolvedConfig.backButton}
              onBack={resolvedConfig.onBack}
            />
          )}
          <div className={cn(
            resolvedConfig.showHeader && "px-3 py-3 sm:px-4 sm:py-4"
          )}>
            {children}
          </div>
        </MobilePageWrapper>
      </CanvasHubRegistryContext.Provider>
    )
  }
  
  return (
    <CanvasHubRegistryContext.Provider value={contextValue}>
      <WorkspaceLayout 
        maxWidth={resolvedConfig.maxWidth} 
        heroGradient={resolvedConfig.heroGradient} 
        className={className}
      >
        <div className="space-y-6">
          {resolvedConfig.showHeader && (
            <div className="flex items-center justify-between gap-4 flex-wrap min-w-0">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">
                  {resolvedConfig.title}
                </h1>
                {resolvedConfig.subtitle && (
                  <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1 truncate">
                    {resolvedConfig.subtitle}
                  </p>
                )}
              </div>
              {resolvedConfig.headerActions && (
                <div className="shrink-0">{resolvedConfig.headerActions}</div>
              )}
            </div>
          )}
          {children}
        </div>
      </WorkspaceLayout>
    </CanvasHubRegistryContext.Provider>
  )
}

export function withCanvasHub<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  configFactory: (props: P) => CanvasPageConfig
) {
  return function CanvasHubWrappedComponent(props: P) {
    const config = configFactory(props)
    return (
      <CanvasHubPage config={config}>
        <WrappedComponent {...props} />
      </CanvasHubPage>
    )
  }
}

export const PAGE_CONFIGS = {
  error403: {
    id: 'error-403',
    title: 'Access Denied',
    category: 'error' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  error404: {
    id: 'error-404', 
    title: 'Page Not Found',
    category: 'error' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  error500: {
    id: 'error-500',
    title: 'Server Error',
    category: 'error' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  login: {
    id: 'login',
    title: 'Sign In',
    category: 'auth' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  register: {
    id: 'register',
    title: 'Create Account',
    category: 'auth' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  forgotPassword: {
    id: 'forgot-password',
    title: 'Reset Password',
    category: 'auth' as PageCategory,
    variant: 'centered' as PageVariant,
  },
  homepage: {
    id: 'homepage',
    title: `${PLATFORM_NAME}`,
    category: 'public' as PageCategory,
    variant: 'marketing' as PageVariant,
    showHeader: false,
  },
  marketing: {
    id: 'marketing',
    title: 'Pricing & Features',
    category: 'public' as PageCategory,
    variant: 'marketing' as PageVariant,
    showHeader: false,
  },
  chatrooms: {
    id: 'chatrooms',
    title: 'Chat',
    category: 'communication' as PageCategory,
    variant: 'chat' as PageVariant,
  },
  termsOfService: {
    id: 'terms-of-service',
    title: 'Terms of Service',
    category: 'legal' as PageCategory,
    variant: 'standard' as PageVariant,
  },
  privacyPolicy: {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    category: 'legal' as PageCategory,
    variant: 'standard' as PageVariant,
  },
}
