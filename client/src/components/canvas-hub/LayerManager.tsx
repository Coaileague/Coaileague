"use client"

import * as React from "react"
import { createContext, useContext, useCallback, useState, useRef, useEffect, useMemo } from "react"

export type LayerType = 'modal' | 'sheet' | 'dialog' | 'alert' | 'popover' | 'dropdown' | 'tooltip'

export interface LayerConfig {
  id: string
  type: LayerType
  priority: number
  component: React.ReactNode
  onClose?: () => void
}

export interface LayerManagerContextValue {
  registerLayer: (config: LayerConfig) => void
  unregisterLayer: (id: string) => void
  getZIndex: (id: string) => number
  topLayerId: string | null
  layers: LayerConfig[]
  closeTopLayer: () => void
  closeAllLayers: () => void
  hasActiveLayers: boolean
}

const BASE_Z_INDEX: Record<LayerType, number> = {
  modal: 9999,
  sheet: 9999,
  dialog: 9999,
  alert: 10000,
  popover: 9999,
  dropdown: 9999,
  tooltip: 10001,
}

const LayerManagerContext = createContext<LayerManagerContextValue | null>(null)

const DEFAULT_CONTEXT: LayerManagerContextValue = {
  registerLayer: () => {},
  unregisterLayer: () => {},
  getZIndex: () => 9999,
  topLayerId: null,
  layers: [],
  closeTopLayer: () => {},
  closeAllLayers: () => {},
  hasActiveLayers: false,
}

export function useLayerManager() {
  const context = useContext(LayerManagerContext)
  return context || DEFAULT_CONTEXT
}

interface LayerManagerProviderProps {
  children: React.ReactNode
}

export function LayerManagerProvider({ children }: LayerManagerProviderProps) {
  const [layers, setLayers] = useState<LayerConfig[]>([])
  const layersRef = useRef<LayerConfig[]>([])
  
  // Keep ref in sync for stable callbacks
  layersRef.current = layers

  const registerLayer = useCallback((config: LayerConfig) => {
    setLayers(prev => {
      const existing = prev.find(l => l.id === config.id)
      if (existing) {
        return prev.map(l => l.id === config.id ? config : l)
      }
      return [...prev, config]
    })
  }, [])

  const unregisterLayer = useCallback((id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id))
  }, [])

  // Memoize sorted layers for z-index calculation
  const sortedLayers = useMemo(() => {
    return [...layers].sort((a, b) => a.priority - b.priority)
  }, [layers])

  // Memoize z-index map for O(1) lookups
  const zIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    sortedLayers.forEach((layer, index) => {
      const baseZ = BASE_Z_INDEX[layer.type] || 50
      map.set(layer.id, baseZ + (index * 10) + (layer.priority * 5))
    })
    return map
  }, [sortedLayers])

  const getZIndex = useCallback((id: string): number => {
    return zIndexMap.get(id) ?? 50
  }, [zIndexMap])

  const topLayerId = layers.length > 0 ? layers[layers.length - 1].id : null
  const hasActiveLayers = layers.length > 0

  // Use ref-based callbacks for stability
  const closeTopLayer = useCallback(() => {
    setLayers(prev => {
      if (prev.length === 0) return prev
      const top = prev[prev.length - 1]
      if (top.onClose) {
        // Defer to avoid state update during render
        queueMicrotask(() => top.onClose?.())
      }
      return prev.slice(0, -1)
    })
  }, [])

  const closeAllLayers = useCallback(() => {
    setLayers(prev => {
      prev.forEach(l => {
        if (l.onClose) {
          queueMicrotask(() => l.onClose?.())
        }
      })
      return []
    })
  }, [])

  // Stable escape handler using ref
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layersRef.current.length > 0) {
        closeTopLayer()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closeTopLayer])

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<LayerManagerContextValue>(() => ({
    registerLayer,
    unregisterLayer,
    getZIndex,
    topLayerId,
    layers,
    closeTopLayer,
    closeAllLayers,
    hasActiveLayers,
  }), [registerLayer, unregisterLayer, getZIndex, topLayerId, layers, closeTopLayer, closeAllLayers, hasActiveLayers])

  return (
    <LayerManagerContext.Provider value={value}>
      {children}
    </LayerManagerContext.Provider>
  )
}

interface ManagedLayerProps {
  id: string
  type: LayerType
  priority?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function useManagedLayer({ id, type, priority = 0, open, onOpenChange }: Omit<ManagedLayerProps, 'children'>) {
  const { registerLayer, unregisterLayer, getZIndex } = useLayerManager()

  useEffect(() => {
    if (open) {
      registerLayer({
        id,
        type,
        priority,
        component: null,
        onClose: () => onOpenChange(false),
      })
    } else {
      unregisterLayer(id)
    }
    return () => {
      if (open) unregisterLayer(id)
    }
  }, [open, id, type, priority, registerLayer, unregisterLayer, onOpenChange])

  return {
    zIndex: getZIndex(id),
    isActive: open,
  }
}
