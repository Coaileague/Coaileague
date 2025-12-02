/**
 * InteractionController - Handles mascot interactions and coordinates responses
 * 
 * This module manages:
 * - Drag detection with velocity tracking
 * - Tap, double-tap, and long-press detection
 * - Float animation state
 * - Zoom effects on drag
 * - Device detection for responsive sizing
 */

import { MASCOT_CONFIG, InteractionType, getDeviceSizes } from '@/config/mascotConfig';
import { thoughtManager } from './ThoughtManager';

export interface Position {
  x: number;
  y: number;
}

export interface InteractionState {
  isDragging: boolean;
  isZoomed: boolean;
  position: Position;
  floatOffset: Position;
  velocity: number;
  lastTapTime: number;
  tapCount: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  currentSize: number;
}

type StateListener = (state: InteractionState) => void;

class InteractionController {
  private state: InteractionState;
  private listeners: Set<StateListener> = new Set();
  private floatAnimationId: number | null = null;
  private floatTime: number = 0;
  private lastPosition: Position = { x: 0, y: 0 };
  private lastMoveTime: number = 0;
  
  constructor() {
    const sizes = getDeviceSizes();
    this.state = {
      isDragging: false,
      isZoomed: false,
      position: { ...MASCOT_CONFIG.defaultPosition },
      floatOffset: { x: 0, y: 0 },
      velocity: 0,
      lastTapTime: 0,
      tapCount: 0,
      longPressTimer: null,
      deviceType: this.detectDeviceType(),
      currentSize: sizes.defaultSize,
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize);
    }
  }
  
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  
  private notify(): void {
    this.listeners.forEach(listener => listener(this.state));
  }
  
  private detectDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    if (typeof window === 'undefined') return 'desktop';
    const width = window.innerWidth;
    if (width < MASCOT_CONFIG.breakpoints.mobile) return 'mobile';
    if (width < MASCOT_CONFIG.breakpoints.tablet) return 'tablet';
    return 'desktop';
  }
  
  private handleResize = (): void => {
    const newDeviceType = this.detectDeviceType();
    if (newDeviceType !== this.state.deviceType) {
      this.state.deviceType = newDeviceType;
      const sizes = getDeviceSizes();
      this.state.currentSize = sizes.defaultSize;
      this.notify();
    }
  };
  
  startDrag(x: number, y: number): void {
    this.clearLongPressTimer();
    this.state.isDragging = true;
    this.state.isZoomed = true;
    this.lastPosition = { x, y };
    this.lastMoveTime = Date.now();
    this.state.velocity = 0;
    
    thoughtManager.triggerReaction('drag_start');
    this.notify();
  }
  
  updateDrag(x: number, y: number): void {
    if (!this.state.isDragging) return;
    
    const now = Date.now();
    const timeDelta = Math.max(now - this.lastMoveTime, 1);
    const dx = x - this.lastPosition.x;
    const dy = y - this.lastPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    this.state.velocity = distance / timeDelta * 16;
    this.state.position = this.constrainPosition({ x, y });
    this.lastPosition = { x, y };
    this.lastMoveTime = now;
    
    if (this.state.velocity > 5 && Math.random() > 0.9) {
      thoughtManager.triggerReaction('drag_move', this.state.velocity);
    }
    
    this.notify();
  }
  
  endDrag(): void {
    if (!this.state.isDragging) return;
    
    this.state.isDragging = false;
    
    setTimeout(() => {
      this.state.isZoomed = false;
      this.notify();
    }, MASCOT_CONFIG.floatMotion.dragZoomDuration);
    
    thoughtManager.triggerReaction('drag_end', this.state.velocity);
    this.state.velocity = 0;
    this.notify();
  }
  
  handleTap(): void {
    const now = Date.now();
    const timeSinceLastTap = now - this.state.lastTapTime;
    
    if (timeSinceLastTap < 300) {
      this.state.tapCount++;
      if (this.state.tapCount === 2) {
        thoughtManager.triggerReaction('double_tap');
        this.state.tapCount = 0;
      }
    } else {
      this.state.tapCount = 1;
      thoughtManager.triggerReaction('tap');
    }
    
    this.state.lastTapTime = now;
    this.notify();
  }
  
  startLongPress(): void {
    this.clearLongPressTimer();
    this.state.longPressTimer = setTimeout(() => {
      thoughtManager.triggerReaction('long_press');
      this.state.longPressTimer = null;
    }, 500);
  }
  
  clearLongPressTimer(): void {
    if (this.state.longPressTimer) {
      clearTimeout(this.state.longPressTimer);
      this.state.longPressTimer = null;
    }
  }
  
  private constrainPosition(pos: Position): Position {
    if (typeof window === 'undefined') return pos;
    
    const padding = MASCOT_CONFIG.floatMotion.boundsPadding;
    const size = this.state.currentSize;
    
    return {
      x: Math.max(padding, Math.min(window.innerWidth - size - padding, pos.x)),
      y: Math.max(padding, Math.min(window.innerHeight - size - padding, pos.y)),
    };
  }
  
  startFloatAnimation(): void {
    if (this.floatAnimationId !== null) return;
    if (!MASCOT_CONFIG.floatMotion.enabled) return;
    
    const animate = (): void => {
      this.floatTime += 16;
      
      const { amplitude, frequency } = MASCOT_CONFIG.floatMotion;
      this.state.floatOffset = {
        x: Math.sin(this.floatTime * frequency) * amplitude.x,
        y: Math.sin(this.floatTime * frequency * 1.3) * amplitude.y,
      };
      
      this.notify();
      this.floatAnimationId = requestAnimationFrame(animate);
    };
    
    this.floatAnimationId = requestAnimationFrame(animate);
  }
  
  stopFloatAnimation(): void {
    if (this.floatAnimationId !== null) {
      cancelAnimationFrame(this.floatAnimationId);
      this.floatAnimationId = null;
    }
  }
  
  setPosition(pos: Position): void {
    this.state.position = this.constrainPosition(pos);
    this.notify();
  }
  
  setSize(size: number): void {
    const sizes = getDeviceSizes();
    this.state.currentSize = Math.max(sizes.minSize, Math.min(sizes.maxSize, size));
    this.notify();
  }
  
  expand(): void {
    const sizes = getDeviceSizes();
    this.state.currentSize = sizes.expandedSize;
    this.notify();
  }
  
  collapse(): void {
    const sizes = getDeviceSizes();
    this.state.currentSize = sizes.defaultSize;
    this.notify();
  }
  
  getState(): InteractionState {
    return { ...this.state };
  }
  
  getEffectivePosition(): Position {
    if (this.state.isDragging) {
      return this.state.position;
    }
    return {
      x: this.state.position.x + this.state.floatOffset.x,
      y: this.state.position.y + this.state.floatOffset.y,
    };
  }
  
  getZoomScale(): number {
    return this.state.isZoomed ? MASCOT_CONFIG.floatMotion.dragZoomScale : 1;
  }
  
  destroy(): void {
    this.stopFloatAnimation();
    this.clearLongPressTimer();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
    }
  }
}

export const interactionController = new InteractionController();
export default interactionController;
