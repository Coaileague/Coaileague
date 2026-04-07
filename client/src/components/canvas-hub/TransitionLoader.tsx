"use client"

import * as React from "react"
import { createContext, useContext, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useLayerManager } from "./LayerManager"

export type TransitionStatus = 'loading' | 'success' | 'error' | 'syncing'

export interface TransitionLoaderConfig {
  minDuration: number
  maxDuration: number
  exitDelay: number
}

const DEFAULT_CONFIG: TransitionLoaderConfig = {
  minDuration: 1200,
  maxDuration: 5000,
  exitDelay: 150,
}

interface TransitionState {
  isActive: boolean
  status: TransitionStatus
  progress: number
  title: string
  subtitle: string
  isLocked: boolean
}

export interface TransitionLoaderContextValue {
  show: (options?: { title?: string; subtitle?: string; status?: TransitionStatus }) => void
  hide: () => void
  setProgress: (progress: number) => void
  updateTitle: (title: string, subtitle?: string) => void
  complete: () => Promise<void>
  cancel: () => void
  lock: () => void
  unlock: () => void
  state: TransitionState
  config: TransitionLoaderConfig
}

const TransitionLoaderContext = createContext<TransitionLoaderContextValue | null>(null)

export function useTransitionLoader(): TransitionLoaderContextValue {
  const context = useContext(TransitionLoaderContext)
  if (!context) {
    return {
      show: () => {},
      hide: () => {},
      setProgress: () => {},
      updateTitle: () => {},
      complete: () => Promise.resolve(),
      cancel: () => {},
      lock: () => {},
      unlock: () => {},
      state: { isActive: false, status: 'loading' as TransitionStatus, progress: 0, title: '', subtitle: '', isLocked: false },
      config: DEFAULT_CONFIG,
    }
  }
  return context
}

export function useTransitionLoaderIfMounted(): TransitionLoaderContextValue | null {
  return useContext(TransitionLoaderContext)
}

interface TransitionLoaderProviderProps {
  children: React.ReactNode
  config?: Partial<TransitionLoaderConfig>
}

export function TransitionLoaderProvider({ children, config: customConfig }: TransitionLoaderProviderProps) {
  const layerManager = useLayerManager()
  const config = { ...DEFAULT_CONFIG, ...customConfig }

  const [state, setState] = useState<TransitionState>({
    isActive: false,
    status: 'loading',
    progress: 0,
    title: 'Loading',
    subtitle: 'Please wait...',
    isLocked: false,
  })

  const startTimeRef = useRef<number>(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const maxTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resolveCompleteRef = useRef<(() => void) | null>(null)
  const progressRef = useRef<number>(0)

  progressRef.current = state.progress

  const cleanupTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current)
      maxTimeoutRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    cleanupTimers()
    layerManager.unregisterLayer('transition-loader')
    setState(prev => ({ ...prev, isActive: false, isLocked: false, progress: 0 }))
    if (resolveCompleteRef.current) {
      resolveCompleteRef.current()
      resolveCompleteRef.current = null
    }
  }, [cleanupTimers, layerManager])

  const complete = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      cleanupTimers()
      resolveCompleteRef.current = resolve

      const elapsed = Date.now() - startTimeRef.current
      const remainingMinTime = Math.max(0, config.minDuration - elapsed)

      setTimeout(() => {
        setState(prev => ({ ...prev, progress: 100, status: 'success' }))
        setTimeout(() => {
          layerManager.unregisterLayer('transition-loader')
          setState(prev => ({ ...prev, isActive: false, isLocked: false, progress: 0 }))
          resolve()
          resolveCompleteRef.current = null
        }, config.exitDelay)
      }, remainingMinTime)
    })
  }, [cleanupTimers, config, layerManager])

  const show = useCallback((options: { title?: string; subtitle?: string; status?: TransitionStatus } = {}) => {
    cleanupTimers()
    startTimeRef.current = Date.now()

    setState({
      isActive: true,
      status: options.status || 'loading',
      progress: 0,
      title: options.title || 'Loading',
      subtitle: options.subtitle || 'Please wait...',
      isLocked: true,
    })

    layerManager.registerLayer({
      id: 'transition-loader',
      type: 'alert',
      priority: 1000,
      component: null,
    })

    const targetProgress = 85
    progressIntervalRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.isActive) return prev
        const elapsed = Date.now() - startTimeRef.current
        const linearProgress = Math.min(elapsed / config.minDuration, 1)
        const easedProgress = (1 - Math.pow(1 - linearProgress, 3)) * targetProgress
        const newProgress = Math.min(easedProgress, targetProgress)
        return { ...prev, progress: newProgress }
      })
    }, 100)

    maxTimeoutRef.current = setTimeout(() => {
      cancel()
    }, config.maxDuration)
  }, [config, layerManager, cleanupTimers, cancel])

  const hide = useCallback(() => {
    if (state.isLocked) return
    cleanupTimers()
    layerManager.unregisterLayer('transition-loader')
    setState(prev => ({ ...prev, isActive: false, progress: 0, isLocked: false }))
  }, [state.isLocked, layerManager, cleanupTimers])

  const setProgress = useCallback((progress: number) => {
    setState(prev => ({ ...prev, progress: Math.max(prev.progress, progress) }))
  }, [])

  const updateTitle = useCallback((title: string, subtitle?: string) => {
    setState(prev => ({
      ...prev,
      title,
      subtitle: subtitle !== undefined ? subtitle : prev.subtitle
    }))
  }, [])

  const lock = useCallback(() => {
    setState(prev => ({ ...prev, isLocked: true }))
  }, [])

  const unlock = useCallback(() => {
    setState(prev => ({ ...prev, isLocked: false }))
  }, [])

  const value: TransitionLoaderContextValue = {
    show,
    hide,
    setProgress,
    updateTitle,
    complete,
    cancel,
    lock,
    unlock,
    state,
    config,
  }

  const transitionZIndex = state.isActive ? layerManager.getZIndex('transition-loader') : 9500

  return (
    <TransitionLoaderContext.Provider value={value}>
      {children}
      <TransitionOverlay state={state} zIndex={transitionZIndex} />
    </TransitionLoaderContext.Provider>
  )
}

interface TransitionOverlayProps {
  state: TransitionState
  zIndex: number
}

function TransitionOverlay({ state, zIndex }: TransitionOverlayProps) {
  return (
    <AnimatePresence>
      {state.isActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="overlay-blocking"
          style={{ zIndex }}
          data-testid="overlay-transition-loader"
        >
          <div className="flex flex-col items-center gap-8">
            <div className="css-spinner" style={{ width: 56, height: 56, borderWidth: 5 }} />

            <div className="text-center">
              <h2
                className="text-2xl font-bold text-foreground mb-2"
                data-testid="text-transition-title"
              >
                {state.title}
              </h2>
              {state.subtitle && (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-transition-subtitle"
                >
                  {state.subtitle}
                </p>
              )}
            </div>

            {state.progress > 0 && state.progress < 100 && (
              <div className="w-48 h-1 bg-primary/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: `${state.progress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function startLoginTransition(transitionLoader: TransitionLoaderContextValue | null) {
  if (!transitionLoader) return null

  transitionLoader.show({
    title: 'Signing In',
    subtitle: 'Verifying your credentials...',
    status: 'syncing',
  })

  return {
    setProgress: (progress: number) => transitionLoader.setProgress(progress),
    updateMessage: (title: string, subtitle?: string) => transitionLoader.updateTitle(title, subtitle),
    complete: () => transitionLoader.complete(),
    cancel: () => transitionLoader.cancel(),
  }
}

export function startLogoutTransition(transitionLoader: TransitionLoaderContextValue | null) {
  if (!transitionLoader) return null

  transitionLoader.show({
    title: 'Signing Out',
    subtitle: 'See you soon!',
    status: 'loading',
  })

  return {
    setProgress: (progress: number) => transitionLoader.setProgress(progress),
    updateMessage: (title: string, subtitle?: string) => transitionLoader.updateTitle(title, subtitle),
    complete: () => transitionLoader.complete(),
    cancel: () => transitionLoader.cancel(),
  }
}
