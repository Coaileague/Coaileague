/**
 * CoAITwinMascot - Interactive twin-star mascot visualization
 * 
 * A canvas-based animated mascot featuring two orbiting "twins" that represent
 * the AI (CoAI) and User interaction. The mascot responds to different states
 * with unique behavioral animations:
 * 
 * - IDLE: Gentle floating figure-8 pattern
 * - SEARCHING: One stationary, one orbiting wide (radar scan)
 * - THINKING: Fast orbital spin around center
 * - ANALYZING: Constellation formation with connection lines
 * - CODING: Grid-based step movement (matrix style)
 * - LISTENING: Audio waveform-reactive vertical bouncing
 * - UPLOADING: Spiral upward with particle stream
 * - SUCCESS: Twins merge to center with particle explosion
 * - ERROR: Erratic shaking with red tint
 * 
 * Features:
 * - Touch/mouse interactivity - twins follow touch position
 * - Shockwave transitions on mode change
 * - Particle effects for visual feedback
 * - Responsive scaling
 * - Dark theme optimized
 */

import { useEffect, useRef, useCallback, memo, useState } from 'react';
import { statusEmoteEffects, StatusEmoteEffects, STATUS_COLORS } from '@/lib/mascot/StatusEmoteEffects';
import { emoteMorphingEngine, EmoteMorphingEngine, EmoteName, EmotePhase, EMOTE_FORMATIONS } from '@/lib/mascot/EmoteMorphingEngine';
import { EmoteTransitionRenderer, WarpPhase, WarpColors } from '@/lib/mascot/EmoteTransitionRenderer';
import { GrabSlingMechanics, GrabEvent, SlingResult } from '@/lib/mascot/GrabSlingMechanics';
// REMOVED: WarpMutationOverlay and MutationFlashOverlay - caused visible borders and sickening glow effects
// Physical geometry morphing now handles all mutations through MODE_GEOMETRY_CONFIG

export type MascotMode = 
  | 'IDLE' 
  | 'SEARCHING' 
  | 'THINKING' 
  | 'ANALYZING' 
  | 'CODING' 
  | 'LISTENING' 
  | 'UPLOADING' 
  | 'SUCCESS' 
  | 'ERROR'
  | 'CELEBRATING'
  | 'ADVISING'
  | 'HOLIDAY'
  | 'GREETING';

// SIMPLIFIED: Flat geometry properties for clear, dramatic morphing
// No nested objects - just points/innerR with target-seek pattern

interface Twin {
  id: number;
  x: number;
  y: number;
  trail: { x: number; y: number; life: number }[];
  color: string;
  targetColor: string;      // Target color for smooth lerping during mutations
  angle: number;
  currentScale: number;     // Smoothly lerped scale to prevent size glitches
  // SIMPLIFIED geometry morphing - flat properties for dramatic visible changes
  points: number;           // Current point count (morphs toward targetPoints)
  targetPoints: number;     // Target point count for mode
  innerR: number;           // Current inner radius ratio (morphs toward targetInner)
  targetInner: number;      // Target inner radius for mode
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Shockwave {
  r: number;
  opacity: number;
  color: string;
}

type MascotVariant = 'mini' | 'expanded' | 'full';

interface EmoteBehavior {
  scale: number;
  wobble: number;
  glow: number;
  speed: number;
}

interface EmoteState {
  type: string;
  purpleBehavior: EmoteBehavior;
  cyanBehavior: EmoteBehavior;
  goldBehavior: EmoteBehavior;
  particleEffect?: 'sparkle' | 'hearts' | 'stars' | 'confetti' | 'zzz' | 'question' | 'exclaim';
}

interface CoAITwinMascotProps {
  mode?: MascotMode;
  className?: string;
  showControls?: boolean;
  onModeChange?: (mode: MascotMode) => void;
  size?: number; // Size in pixels (default 400)
  mini?: boolean; // Compact mode for bubble display - no overlays
  variant?: MascotVariant; // mini (80px bubble), expanded (180px), full (original)
  emote?: EmoteState; // Current emote state for visual expression
  triggerEmote?: EmoteName; // Trigger an emote morph animation
  onEmoteComplete?: (emote: EmoteName) => void; // Callback when emote animation finishes
  chromaticAberration?: boolean; // Enable chromatic aberration effect
  glitchEffect?: boolean; // Enable glitch/distortion effect
  warpIntensity?: number; // Warp mutation intensity (0-1)
}

const MODE_COLORS: Record<MascotMode, string> = {
  IDLE: '#38bdf8',      // Sky Blue
  SEARCHING: '#10b981', // Emerald
  THINKING: '#a855f7',  // Purple
  ANALYZING: '#6366f1', // Indigo
  CODING: '#34d399',    // Green
  LISTENING: '#fbbf24', // Amber
  UPLOADING: '#06b6d4', // Cyan
  SUCCESS: '#f472b6',   // Pink
  ERROR: '#ef4444',     // Red
  CELEBRATING: '#fbbf24', // Amber/Gold
  ADVISING: '#10b981',    // Emerald
  HOLIDAY: '#c41e3a',     // Christmas Red
  GREETING: '#f472b6'     // Pink for friendly greeting
};

const CHRISTMAS_COLORS = {
  red: '#c41e3a',      // Christmas red
  green: '#165b33',    // Christmas green
  gold: '#ffd700',     // Christmas gold
  white: '#ffffff',    // Snow white
  particles: ['#ff0000', '#00ff00', '#ffd700', '#ffffff', '#ff69b4', '#00bfff']
};

const MODE_LABELS: Record<MascotMode, string> = {
  IDLE: 'Ready',
  SEARCHING: 'Searching',
  THINKING: 'Thinking',
  ANALYZING: 'Analyzing',
  CODING: 'Coding',
  LISTENING: 'Listening',
  UPLOADING: 'Uploading',
  SUCCESS: 'Complete',
  ERROR: 'Error',
  CELEBRATING: 'Celebrating',
  ADVISING: 'Advising',
  HOLIDAY: 'Holiday',
  GREETING: 'Hello!'
};

// Visual morph config per mode - controls appearance during state transitions
interface ModeVisualConfig {
  scale: number;           // Star size multiplier (1.0 = normal)
  glow: number;            // Glow intensity (0-1)
  distortion: number;      // Warp distortion level (0-1)
  pulseSpeed: number;      // Pulsing animation speed
  trailLength: number;     // Trail persistence
  bubbleGradient: string;  // Gradient for thought bubble theming
}

// REDUCED GLOW VALUES - No more sickening light show! Focus on physical geometry morphing
export const MODE_VISUAL_CONFIG: Record<MascotMode, ModeVisualConfig> = {
  IDLE: { scale: 1.0, glow: 0.0, distortion: 0, pulseSpeed: 0.5, trailLength: 15, bubbleGradient: 'from-sky-500/20 to-purple-500/20' },
  SEARCHING: { scale: 1.4, glow: 0.0, distortion: 0, pulseSpeed: 1.5, trailLength: 25, bubbleGradient: 'from-emerald-500/30 to-teal-500/20' },
  THINKING: { scale: 1.6, glow: 0.0, distortion: 0, pulseSpeed: 2.0, trailLength: 30, bubbleGradient: 'from-purple-500/30 to-indigo-500/20' },
  ANALYZING: { scale: 1.35, glow: 0.0, distortion: 0, pulseSpeed: 1.3, trailLength: 20, bubbleGradient: 'from-indigo-500/30 to-blue-500/20' },
  CODING: { scale: 1.25, glow: 0.0, distortion: 0, pulseSpeed: 1.0, trailLength: 18, bubbleGradient: 'from-green-500/30 to-emerald-500/20' },
  LISTENING: { scale: 1.5, glow: 0.0, distortion: 0, pulseSpeed: 1.6, trailLength: 22, bubbleGradient: 'from-amber-500/30 to-yellow-500/20' },
  UPLOADING: { scale: 1.3, glow: 0.0, distortion: 0, pulseSpeed: 1.8, trailLength: 28, bubbleGradient: 'from-cyan-500/30 to-sky-500/20' },
  SUCCESS: { scale: 1.8, glow: 0.0, distortion: 0, pulseSpeed: 0.8, trailLength: 12, bubbleGradient: 'from-pink-500/30 to-rose-500/20' },
  ERROR: { scale: 0.7, glow: 0.0, distortion: 0, pulseSpeed: 3.0, trailLength: 10, bubbleGradient: 'from-red-500/40 to-rose-600/30' },
  CELEBRATING: { scale: 1.7, glow: 0.0, distortion: 0, pulseSpeed: 1.2, trailLength: 20, bubbleGradient: 'from-amber-500/30 to-yellow-400/20' },
  ADVISING: { scale: 1.3, glow: 0.0, distortion: 0, pulseSpeed: 0.9, trailLength: 18, bubbleGradient: 'from-emerald-500/25 to-green-500/15' },
  HOLIDAY: { scale: 1.5, glow: 0.0, distortion: 0, pulseSpeed: 1.1, trailLength: 22, bubbleGradient: 'from-red-500/30 to-green-500/20' },
  GREETING: { scale: 1.4, glow: 0.0, distortion: 0, pulseSpeed: 1.0, trailLength: 16, bubbleGradient: 'from-pink-500/25 to-purple-500/15' }
};

// SIMPLIFIED GEOMETRY MORPHING - just points and innerR for dramatic visible changes
// points: 3=triangle, 4=diamond/star, 8=spiky, 20=circle
// innerR: 0.2=very spiky, 0.5=medium, 0.95=nearly circular
interface ModeGeometryTarget {
  points: number;   // Target number of vertices
  innerR: number;   // Target inner radius ratio (0.15 = very spiky, 0.95 = round)
}

export const MODE_GEOMETRY_TARGETS: Record<MascotMode, ModeGeometryTarget> = {
  IDLE: { points: 4, innerR: 0.25 },        // Sharp 4-pointed star
  SEARCHING: { points: 3, innerR: 0.4 },    // Triangle - scanning/radar shape
  THINKING: { points: 20, innerR: 0.95 },   // Circle - contemplative/smooth
  ANALYZING: { points: 6, innerR: 0.5 },    // Hexagon-ish - analytical
  CODING: { points: 4, innerR: 0.71 },      // Square - structured/precise
  LISTENING: { points: 6, innerR: 0.3 },    // 6-pointed star - receptive
  UPLOADING: { points: 5, innerR: 0.35 },   // Pentagon star - streaming
  SUCCESS: { points: 6, innerR: 0.6 },      // Rounded hexagon - achievement
  ERROR: { points: 8, innerR: 0.15 },       // Spiky 8-point - danger/alert
  CELEBRATING: { points: 10, innerR: 0.3 }, // 10-point star - festive
  ADVISING: { points: 7, innerR: 0.55 },    // 7-point - wisdom
  HOLIDAY: { points: 6, innerR: 0.35 },     // 6-point star - decorative
  GREETING: { points: 4, innerR: 0.65 }     // Soft square - friendly
};

// Export helper to get bubble colors for current mode
export function getModeTheme(mode: MascotMode) {
  return {
    color: MODE_COLORS[mode],
    label: MODE_LABELS[mode],
    visual: MODE_VISUAL_CONFIG[mode],
  };
}

class CoAITwinEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  
  private state = {
    mode: 'IDLE' as MascotMode,
    w: 0,
    h: 0,
    scale: 1,
    time: 0,
    touchX: null as number | null,
    touchY: null as number | null,
    isTouching: false,
    shake: 0,
    mutation: 0  // Mutation intensity for warp/transition effects (0-1)
  };

  private emoteState: EmoteState = {
    type: 'neutral',
    purpleBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
    cyanBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
    goldBehavior: { scale: 1, wobble: 0.5, glow: 0.5, speed: 1 },
  };

  private emoteParticles: { x: number; y: number; vx: number; vy: number; life: number; type: string; char?: string }[] = [];

  // Trinity Stars: Co (cyan), AI (purple), L (gold) - 120° offset for triangular formation - spells "CoAIL"
  // Each star has currentScale initialized to BASE_STAR_SCALE (1.0) for smooth size transitions
  private static readonly BASE_STAR_SCALE = 1.0;
  private static readonly SCALE_LERP_SPEED = 0.12; // Smooth lerp factor for scale transitions
  private static readonly GEOMETRY_LERP_SPEED = 0.08; // 8% step per frame for visible morphing
  
  // SIMPLIFIED: Twins now use flat geometry properties for dramatic, visible morphing
  private twins: Twin[] = [
    { 
      id: 0, x: 0, y: 0, trail: [], color: '#38bdf8', targetColor: '#38bdf8', angle: 0, currentScale: 1.0,
      points: 4, targetPoints: 4, innerR: 0.25, targetInner: 0.25
    }, // Cyan - "Co"
    { 
      id: 1, x: 0, y: 0, trail: [], color: '#a855f7', targetColor: '#a855f7', angle: (Math.PI * 2) / 3, currentScale: 1.0,
      points: 4, targetPoints: 4, innerR: 0.25, targetInner: 0.25
    }, // Purple - "AI"  
    { 
      id: 2, x: 0, y: 0, trail: [], color: '#f4c15d', targetColor: '#f4c15d', angle: (Math.PI * 4) / 3, currentScale: 1.0,
      points: 4, targetPoints: 4, innerR: 0.25, targetInner: 0.25
    }  // Gold - "L"
  ];

  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private isRunning = false;
  private animationFrameId: number | null = null;
  
  private morphEngine: EmoteMorphingEngine;
  private transitionRenderer: EmoteTransitionRenderer;
  private grabMechanics: GrabSlingMechanics;
  private lastFrameTime: number = 0;
  private onEmoteComplete?: (emote: EmoteName) => void;
  private emoteQueue: EmoteName[] = [];
  private isTransitioningToIdle: boolean = false;
  private idleTransitionProgress: number = 0;
  
  // Grab/sling state
  private isBeingDragged: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private slingVelocityX: number = 0;
  private slingVelocityY: number = 0;
  private previousEmote: string = 'neutral';
  
  // Warp mutation state
  private warpPhase: WarpPhase = 'idle';
  private warpIntensity: number = 0;
  private warpColors: WarpColors = { primary: '#38bdf8', secondary: '#a855f7', accent: '#f4c15d' };
  private onWarpStateChange?: (phase: WarpPhase, intensity: number, colors: WarpColors) => void;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    
    this.morphEngine = new EmoteMorphingEngine();
    this.morphEngine.setCallbacks({
      onParticle: (effect) => this.spawnEmoteParticles(effect),
      onShockwave: (color) => this.spawnShockwave(color),
      onShake: (intensity) => { this.state.shake = intensity; },
      onComplete: (emote) => { 
        this.handleEmoteComplete(emote);
      },
      onPhaseChange: (phase, emote) => {
        this.handlePhaseChange(phase, emote);
      }
    });
    
    // Initialize transition renderer for polished emote transitions
    this.transitionRenderer = new EmoteTransitionRenderer();
    
    // Set up warp mutation callbacks for CSS overlay effects
    this.transitionRenderer.setWarpCallbacks({
      onPhaseChange: (phase, _fromEmote, _toEmote, colors) => {
        this.warpPhase = phase;
        this.warpColors = colors;
        if (this.onWarpStateChange) {
          this.onWarpStateChange(phase, this.warpIntensity, colors);
        }
      },
      onWarpIntensityChange: (intensity) => {
        this.warpIntensity = intensity;
        if (this.onWarpStateChange) {
          this.onWarpStateChange(this.warpPhase, intensity, this.warpColors);
        }
      }
    });
    
    // Initialize grab/sling mechanics with 10% catch chance
    this.grabMechanics = new GrabSlingMechanics({
      catchChance: 0.10,  // 10% chance to catch
      grabRadius: 80,     // Generous grab area
      releaseBoost: 1.8,  // Strong sling effect
      maxSlingSpeed: 30   // Higher max for dramatic flings
    });
    
    // Set up grab event listeners
    this.grabMechanics.on('grab_success', (event) => this.handleGrabSuccess(event));
    this.grabMechanics.on('grab_fail', (event) => this.handleGrabFail(event));
    this.grabMechanics.on('sling_release', (event) => this.handleSlingRelease(event));
    this.grabMechanics.on('gentle_release', (event) => this.handleGentleRelease(event));
    
    this.lastFrameTime = performance.now();
    
    this.resize();
    this.setupTouch();
  }
  
  private handleGrabSuccess(event: GrabEvent): void {
    this.isBeingDragged = true;
    this.triggerEmote('surprised');
    this.transitionRenderer.spawnCatchEffect(event.x - this.state.w / 2, event.y - this.state.h / 2);
    this.spawnShockwave('#22c55e');
    this.state.shake = 3;
  }
  
  private handleGrabFail(event: GrabEvent): void {
    this.transitionRenderer.spawnMissEffect(event.x - this.state.w / 2, event.y - this.state.h / 2);
    // Brief startle effect
    this.state.shake = 1.5;
  }
  
  private handleSlingRelease(event: GrabEvent): void {
    this.isBeingDragged = false;
    this.slingVelocityX = event.velocityX || 0;
    this.slingVelocityY = event.velocityY || 0;
    this.triggerEmote('excited');
    
    // Spawn sling visual effect
    const cx = this.state.w / 2;
    const cy = this.state.h / 2;
    this.transitionRenderer.spawnSlingEffect(
      event.x - cx, 
      event.y - cy, 
      this.slingVelocityX, 
      this.slingVelocityY
    );
    this.spawnShockwave('#fbbf24');
    this.state.shake = 5;
  }
  
  private handleGentleRelease(event: GrabEvent): void {
    this.isBeingDragged = false;
    this.slingVelocityX = event.velocityX || 0;
    this.slingVelocityY = event.velocityY || 0;
    this.triggerEmote('happy');
  }
  
  private handleEmoteComplete(emote: EmoteName): void {
    this.onEmoteComplete?.(emote);
    this.isTransitioningToIdle = true;
    this.idleTransitionProgress = 0;
    
    if (this.emoteQueue.length > 0) {
      const nextEmote = this.emoteQueue.shift()!;
      setTimeout(() => {
        this.isTransitioningToIdle = false;
        this.morphEngine.triggerEmote(nextEmote);
      }, 200);
    }
  }
  
  private handlePhaseChange(phase: EmotePhase, emote: EmoteName): void {
    if (phase === 'IDLE' || phase === 'STANDBY') {
      this.isTransitioningToIdle = false;
      this.idleTransitionProgress = 1;
      
      this.emoteState = {
        type: 'neutral',
        purpleBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
        cyanBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
        goldBehavior: { scale: 1, wobble: 0.5, glow: 0.5, speed: 1 },
        particleEffect: undefined
      };
    }
  }
  
  triggerEmote(emote: EmoteName): void {
    if (this.morphEngine.isAnimating()) {
      if (!this.emoteQueue.includes(emote)) {
        this.emoteQueue.push(emote);
      }
      return;
    }
    
    // Start transition visual effects
    const currentEmote = this.morphEngine.getCurrentEmote();
    if (currentEmote !== emote) {
      this.transitionRenderer.startTransition(currentEmote, emote);
      this.previousEmote = currentEmote;
    }
    
    this.isTransitioningToIdle = false;
    this.morphEngine.triggerEmote(emote);
  }
  
  returnToIdle(): void {
    this.emoteQueue = [];
    this.morphEngine.returnToIdle();
    this.isTransitioningToIdle = true;
    this.idleTransitionProgress = 0;
  }
  
  forceIdle(): void {
    this.emoteQueue = [];
    this.morphEngine.forceIdle();
    this.isTransitioningToIdle = false;
    this.idleTransitionProgress = 1;
    
    this.emoteState = {
      type: 'neutral',
      purpleBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
      cyanBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
      goldBehavior: { scale: 1, wobble: 0.5, glow: 0.5, speed: 1 },
      particleEffect: undefined
    };
    
    // Reset all twin scales to base scale to prevent size glitches
    this.twins.forEach(twin => {
      twin.currentScale = CoAITwinEngine.BASE_STAR_SCALE;
    });
  }
  
  setEmoteCallback(callback: (emote: EmoteName) => void): void {
    this.onEmoteComplete = callback;
  }
  
  setWarpStateCallback(callback: (phase: WarpPhase, intensity: number, colors: WarpColors) => void): void {
    this.onWarpStateChange = callback;
  }
  
  getWarpState(): { phase: WarpPhase; intensity: number; colors: WarpColors } {
    return {
      phase: this.warpPhase,
      intensity: this.warpIntensity,
      colors: this.warpColors
    };
  }
  
  isEmoteAnimating(): boolean {
    return this.morphEngine.isAnimating();
  }
  
  getCurrentEmotePhase(): EmotePhase {
    return this.morphEngine.getCurrentPhase();
  }
  
  getEmoteQueueLength(): number {
    return this.emoteQueue.length;
  }

  private setupTouch() {
    const getPointerPos = (e: TouchEvent | MouseEvent): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio, 2);
      let clientX: number, clientY: number;
      
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        return { x: 0, y: 0 };
      }
      
      return {
        x: (clientX - rect.left) * dpr,
        y: (clientY - rect.top) * dpr
      };
    };
    
    const getMascotCenter = (): { x: number; y: number } => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      return {
        x: (this.state.w / 2) * dpr,
        y: (this.state.h / 2) * dpr
      };
    };
    
    const handleTouchStart = (e: TouchEvent | MouseEvent) => {
      const pos = getPointerPos(e);
      const mascotCenter = getMascotCenter();
      
      // Try to grab the mascot (10% chance)
      const caught = this.grabMechanics.attemptGrab(pos.x, pos.y, mascotCenter.x, mascotCenter.y);
      
      // Always update touch state for visual feedback
      this.state.touchX = pos.x;
      this.state.touchY = pos.y;
      this.state.isTouching = true;
      
      if (caught) {
        this.isBeingDragged = true;
      }
    };
    
    const handleTouchMove = (e: TouchEvent | MouseEvent) => {
      const pos = getPointerPos(e);
      
      this.state.touchX = pos.x;
      this.state.touchY = pos.y;
      
      if (this.grabMechanics.isGrabbing()) {
        this.grabMechanics.updateDrag(pos.x, pos.y);
        
        // Update drag offset for visual
        const mascotCenter = getMascotCenter();
        this.dragOffsetX = (pos.x - mascotCenter.x) * 0.5;
        this.dragOffsetY = (pos.y - mascotCenter.y) * 0.5;
        
        // Add trail particles during drag
        this.transitionRenderer.addTrailPoint(
          this.dragOffsetX, 
          this.dragOffsetY, 
          Math.floor(Math.random() * 3)
        );
      }
    };
    
    const handleTouchEnd = (e: TouchEvent | MouseEvent) => {
      this.state.isTouching = false;
      
      if (this.grabMechanics.isGrabbing()) {
        const result = this.grabMechanics.release();
        
        if (result.caught) {
          this.slingVelocityX = result.velocityX;
          this.slingVelocityY = result.velocityY;
        }
      }
      
      this.isBeingDragged = false;
    };

    // Touch events
    this.canvas.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    this.canvas.addEventListener('touchmove', handleTouchMove as EventListener, { passive: true });
    this.canvas.addEventListener('touchend', handleTouchEnd as EventListener);
    this.canvas.addEventListener('touchcancel', handleTouchEnd as EventListener);
    
    // Mouse events
    this.canvas.addEventListener('mousedown', handleTouchStart as EventListener);
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (e.buttons === 1) {
        handleTouchMove(e);
      }
    });
    this.canvas.addEventListener('mouseup', handleTouchEnd as EventListener);
    this.canvas.addEventListener('mouseleave', handleTouchEnd as EventListener);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.state.w = Math.max(rect.width, 1);
    this.state.h = Math.max(rect.height, 1);
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = this.state.w * dpr;
    this.canvas.height = this.state.h * dpr;
    this.ctx.scale(dpr, dpr);
    this.state.scale = this.state.w;
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // Warp phase timeout IDs for cleanup
  private warpTimeouts: number[] = [];
  
  setMode(mode: MascotMode) {
    // 1. DECONSTRUCT EFFECT: Explode particles at current twin positions with OLD colors
    this.twins.forEach(t => {
      this.spawnExplosionAt(t.x, t.y, t.color, 6);
    });
    
    this.state.mode = mode;
    const color = MODE_COLORS[mode];
    
    // 2. SET TARGET COLORS FIRST so warp uses correct colors
    // Trinity colors: Cyan (Co), Purple (AI), Gold (L) - spells "CoAIL"
    if (mode === 'IDLE') {
      this.twins[0].targetColor = '#38bdf8';  // Cyan
      this.twins[1].targetColor = '#a855f7';  // Purple
      this.twins[2].targetColor = '#f4c15d';  // Gold
      this.warpColors = { primary: '#38bdf8', secondary: '#a855f7', accent: '#f4c15d' };
    } else if (mode === 'ERROR') {
      this.twins[0].targetColor = '#ef4444';
      this.twins[1].targetColor = '#ef4444';
      this.twins[2].targetColor = '#ef4444';
      this.warpColors = { primary: '#ef4444', secondary: '#dc2626', accent: '#f87171' };
    } else if (mode === 'CELEBRATING' || mode === 'SUCCESS') {
      this.twins[0].targetColor = '#38bdf8';
      this.twins[1].targetColor = '#a855f7';
      this.twins[2].targetColor = '#fbbf24';
      this.warpColors = { primary: '#fbbf24', secondary: '#a855f7', accent: '#f472b6' };
    } else if (mode === 'HOLIDAY') {
      this.twins[0].targetColor = CHRISTMAS_COLORS.red;
      this.twins[1].targetColor = CHRISTMAS_COLORS.green;
      this.twins[2].targetColor = CHRISTMAS_COLORS.gold;
      this.warpColors = { 
        primary: CHRISTMAS_COLORS.red, 
        secondary: CHRISTMAS_COLORS.green, 
        accent: CHRISTMAS_COLORS.gold 
      };
    } else {
      this.twins[0].targetColor = color;
      this.twins[1].targetColor = '#fff';
      this.twins[2].targetColor = '#f4c15d';
      this.warpColors = { primary: color, secondary: '#ffffff', accent: '#f4c15d' };
    }
    
    // 3. SET TARGET GEOMETRY for physical shape morphing (SIMPLIFIED Target-Seek pattern)
    // Uses flat properties: targetPoints, targetInner - lerped each frame in update()
    const targetGeo = MODE_GEOMETRY_TARGETS[mode];
    this.twins.forEach(t => {
      t.targetPoints = targetGeo.points;
      t.targetInner = targetGeo.innerR;
    });
    
    // 4. TRIGGER MUTATION: Start mutation intensity for chaos phase
    this.state.mutation = 1.0;
    this.spawnShockwave(color);
    
    if (mode === 'SUCCESS') this.spawnExplosion(30);
    if (mode === 'ERROR') this.state.shake = 20;
    if (mode === 'CODING' || mode === 'UPLOADING') this.particles = [];
    
    // 4. TRIGGER WARP OVERLAY: Clear any previous warp timeouts to prevent overlap
    this.warpTimeouts.forEach(t => clearTimeout(t));
    this.warpTimeouts = [];
    
    // Start warp phases with correct colors
    this.warpPhase = 'enter';
    this.warpIntensity = 1.0;
    if (this.onWarpStateChange) {
      this.onWarpStateChange('enter', 1.0, this.warpColors);
    }
    
    // Auto-transition through warp phases
    this.warpTimeouts.push(window.setTimeout(() => {
      this.warpPhase = 'peak';
      if (this.onWarpStateChange) {
        this.onWarpStateChange('peak', 0.8, this.warpColors);
      }
    }, 150));
    
    this.warpTimeouts.push(window.setTimeout(() => {
      this.warpPhase = 'exit';
      this.warpIntensity = 0.4;
      if (this.onWarpStateChange) {
        this.onWarpStateChange('exit', 0.4, this.warpColors);
      }
    }, 350));
    
    this.warpTimeouts.push(window.setTimeout(() => {
      this.warpPhase = 'idle';
      this.warpIntensity = 0;
      if (this.onWarpStateChange) {
        this.onWarpStateChange('idle', 0, this.warpColors);
      }
    }, 600));
  }

  getMode(): MascotMode {
    return this.state.mode;
  }

  setEmote(emote: EmoteState) {
    const prevType = this.emoteState.type;
    this.emoteState = emote;
    
    // Spawn emote particles on change
    if (emote.type !== prevType && emote.particleEffect) {
      this.spawnEmoteParticles(emote.particleEffect);
    }
  }

  private spawnEmoteParticles(effect: string) {
    let count: number;
    let particleConfig: { angle: number; speed: number; char: string; vx: number; vy: number }[] = [];
    
    switch (effect) {
      case 'confetti':
      case 'confetti_shower':
        count = 25;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
          const speed = 2 + Math.random() * 3;
          particleConfig.push({
            angle,
            speed,
            char: ['*', '+', 'o', '.', '~'][Math.floor(Math.random() * 5)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1.5,
          });
        }
        break;
        
      case 'sparkle':
      case 'sparkle_burst':
        count = 16;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 2.5 + Math.random() * 2;
          particleConfig.push({
            angle,
            speed,
            char: '*',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        this.spawnShockwave('#fbbf24');
        break;
        
      case 'stars':
      case 'star_spiral':
        count = 12;
        for (let i = 0; i < count; i++) {
          const spiralAngle = (Math.PI * 2 / count) * i + (i * 0.2);
          const speed = 1.5 + (i * 0.15);
          particleConfig.push({
            angle: spiralAngle,
            speed,
            char: ['*', '+', 'x'][i % 3],
            vx: Math.cos(spiralAngle) * speed,
            vy: Math.sin(spiralAngle) * speed,
          });
        }
        break;
        
      case 'hearts':
      case 'heart_float':
        count = 10;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
          const speed = 1 + Math.random() * 1.5;
          particleConfig.push({
            angle,
            speed,
            char: '<3',
            vx: Math.cos(angle) * speed * 0.5,
            vy: -speed - Math.random() * 0.5,
          });
        }
        break;
        
      case 'wave_ripple':
        count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 1.2;
          particleConfig.push({
            angle,
            speed,
            char: '~',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        this.spawnShockwave('#38bdf8');
        break;
        
      case 'energy_pulse':
        count = 12;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 3 + Math.random() * 2;
          particleConfig.push({
            angle,
            speed,
            char: '^',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        this.spawnShockwave('#a855f7');
        break;
        
      case 'rainbow_arc':
        count = 7;
        for (let i = 0; i < count; i++) {
          const angle = (-Math.PI / 2) + (Math.PI / 8) * (i - 3);
          const speed = 2.5;
          particleConfig.push({
            angle,
            speed,
            char: ['R', 'O', 'Y', 'G', 'B', 'I', 'V'][i],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        break;
        
      case 'lightning_flash':
        count = 6;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 4 + Math.random() * 2;
          particleConfig.push({
            angle,
            speed,
            char: '/',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        this.spawnShockwave('#fbbf24');
        this.state.shake = 8;
        break;
        
      case 'bubble_pop':
        count = 12;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 2 + Math.random();
          particleConfig.push({
            angle,
            speed,
            char: 'o',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 0.5,
          });
        }
        this.spawnShockwave('#38bdf8');
        break;
        
      case 'fire_burst':
        count = 15;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 2.5 + Math.random() * 2;
          particleConfig.push({
            angle,
            speed,
            char: ['^', '*', '.'][Math.floor(Math.random() * 3)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
          });
        }
        this.spawnShockwave('#f97316');
        this.state.shake = 5;
        break;
        
      case 'ice_crystals':
        count = 10;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 1.5 + Math.random();
          particleConfig.push({
            angle,
            speed,
            char: ['+', 'x', '*'][Math.floor(Math.random() * 3)],
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        this.spawnShockwave('#67e8f9');
        break;
        
      case 'leaf_scatter':
        count = 10;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          const speed = 1.5 + Math.random();
          particleConfig.push({
            angle,
            speed,
            char: ['~', '-', '\\'][Math.floor(Math.random() * 3)],
            vx: Math.cos(angle) * speed + (Math.random() - 0.5),
            vy: Math.sin(angle) * speed + 0.5,
          });
        }
        break;
        
      case 'zzz':
        count = 3;
        for (let i = 0; i < count; i++) {
          particleConfig.push({
            angle: -Math.PI / 4 + (i * 0.2),
            speed: 0.5,
            char: 'Z',
            vx: 0.3 + i * 0.2,
            vy: -1 - i * 0.3,
          });
        }
        break;
        
      case 'question':
        count = 3;
        for (let i = 0; i < count; i++) {
          const angle = -Math.PI / 2 + (i - 1) * 0.3;
          particleConfig.push({
            angle,
            speed: 1.5,
            char: '?',
            vx: Math.cos(angle) * 1.5,
            vy: Math.sin(angle) * 1.5 - 1,
          });
        }
        break;
        
      case 'exclaim':
        count = 5;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i;
          particleConfig.push({
            angle,
            speed: 2,
            char: '!',
            vx: Math.cos(angle) * 2,
            vy: Math.sin(angle) * 2,
          });
        }
        break;
        
      default:
        count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
          const speed = 1.5 + Math.random() * 2;
          particleConfig.push({
            angle,
            speed,
            char: '*',
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
    }
    
    for (const config of particleConfig) {
      this.emoteParticles.push({
        x: 0,
        y: 0,
        vx: config.vx,
        vy: config.vy,
        life: 1.0,
        type: effect,
        char: config.char,
      });
    }
  }

  private spawnShockwave(color: string) {
    this.shockwaves.push({ r: 0, opacity: 1, color });
  }

  private spawnExplosion(count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 3;
      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1.0,
        color: MODE_COLORS.SUCCESS
      });
    }
  }

  private spawnParticle(x: number, y: number, color: string, vx = 0, vy = 0) {
    this.particles.push({
      x,
      y,
      vx: vx || (Math.random() - 0.5),
      vy: vy || (Math.random() - 0.5),
      life: 1.0,
      color
    });
  }

  // Spawn explosion particles at a specific position (for deconstruct effects)
  private spawnExplosionAt(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 1.0,
        color
      });
    }
  }

  // Linear interpolation for smooth numeric transitions (Target-Seek pattern)
  private lerp(start: number, end: number, amount: number): number {
    return (1 - amount) * start + amount * end;
  }

  // Linear interpolation for smooth color transitions during mutations
  // With validation to prevent corrupted color values
  private lerpColor(colorA: string, colorB: string, amount: number): string {
    const parseHex = (hex: string) => {
      // Validate hex format - must be 7 chars (#RRGGBB) or 4 chars (#RGB)
      if (!hex || typeof hex !== 'string') return { r: 128, g: 128, b: 128 };
      
      const clean = hex.replace('#', '');
      if (!/^[0-9a-fA-F]+$/.test(clean)) {
        // Invalid hex characters - return fallback gray
        return { r: 128, g: 128, b: 128 };
      }
      
      // Handle shorthand (#RGB) and full (#RRGGBB) formats
      if (clean.length === 3) {
        return {
          r: parseInt(clean[0] + clean[0], 16) || 0,
          g: parseInt(clean[1] + clean[1], 16) || 0,
          b: parseInt(clean[2] + clean[2], 16) || 0
        };
      }
      
      if (clean.length >= 6) {
        return {
          r: parseInt(clean.substring(0, 2), 16) || 0,
          g: parseInt(clean.substring(2, 4), 16) || 0,
          b: parseInt(clean.substring(4, 6), 16) || 0
        };
      }
      
      // Invalid length - return fallback
      return { r: 128, g: 128, b: 128 };
    };
    
    const ca = parseHex(colorA);
    const cb = parseHex(colorB);
    
    // Clamp amount to valid range
    const t = Math.max(0, Math.min(1, amount || 0));
    
    // Lerp and clamp to 0-255
    const rr = Math.max(0, Math.min(255, Math.round(ca.r + t * (cb.r - ca.r))));
    const gg = Math.max(0, Math.min(255, Math.round(ca.g + t * (cb.g - ca.g))));
    const bb = Math.max(0, Math.min(255, Math.round(ca.b + t * (cb.b - ca.b))));
    
    // Return properly formatted hex color
    return '#' + rr.toString(16).padStart(2, '0') + gg.toString(16).padStart(2, '0') + bb.toString(16).padStart(2, '0');
  }
  
  // Convert hex color to RGB object (with validation)
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    if (!hex || typeof hex !== 'string') return { r: 128, g: 128, b: 128 };
    
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      return { r: 128, g: 128, b: 128 };
    }
    
    if (clean.length === 3) {
      return {
        r: parseInt(clean[0] + clean[0], 16) || 0,
        g: parseInt(clean[1] + clean[1], 16) || 0,
        b: parseInt(clean[2] + clean[2], 16) || 0
      };
    }
    
    if (clean.length >= 6) {
      return {
        r: parseInt(clean.substring(0, 2), 16) || 0,
        g: parseInt(clean.substring(2, 4), 16) || 0,
        b: parseInt(clean.substring(4, 6), 16) || 0
      };
    }
    
    return { r: 128, g: 128, b: 128 };
  }

  private update() {
    this.state.time += 1;
    const s = this.state.scale;
    const cx = this.state.w / 2;
    const cy = this.state.h / 2;
    
    // Update morph engine
    const now = performance.now();
    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.morphEngine.update(deltaMs);
    
    // Update transition renderer for polished effects
    this.transitionRenderer.update(deltaMs);
    
    // Apply sling velocity physics (decays over time)
    if (Math.abs(this.slingVelocityX) > 0.1 || Math.abs(this.slingVelocityY) > 0.1) {
      this.dragOffsetX += this.slingVelocityX;
      this.dragOffsetY += this.slingVelocityY;
      
      // Decay velocity
      this.slingVelocityX *= 0.92;
      this.slingVelocityY *= 0.92;
      
      // Bounce off edges
      const maxOffset = Math.min(this.state.w, this.state.h) * 0.4;
      if (Math.abs(this.dragOffsetX) > maxOffset) {
        this.slingVelocityX *= -0.6;
        this.dragOffsetX = Math.sign(this.dragOffsetX) * maxOffset;
        this.spawnShockwave('#38bdf8');
        this.state.shake = 2;
      }
      if (Math.abs(this.dragOffsetY) > maxOffset) {
        this.slingVelocityY *= -0.6;
        this.dragOffsetY = Math.sign(this.dragOffsetY) * maxOffset;
        this.spawnShockwave('#a855f7');
        this.state.shake = 2;
      }
    } else {
      // Smoothly return to center when not being slung
      this.dragOffsetX *= 0.95;
      this.dragOffsetY *= 0.95;
      if (Math.abs(this.dragOffsetX) < 0.5) this.dragOffsetX = 0;
      if (Math.abs(this.dragOffsetY) < 0.5) this.dragOffsetY = 0;
    }
    
    // Smooth transition back to idle rotating mode
    if (this.isTransitioningToIdle) {
      this.idleTransitionProgress = Math.min(1, this.idleTransitionProgress + 0.02);
      if (this.idleTransitionProgress >= 1) {
        this.isTransitioningToIdle = false;
      }
    }
    
    // TRINITY: 120° offset for 3 stars (Co, AI, L) - each star gets unique position
    const TRINITY_OFFSET = (2 * Math.PI) / 3;  // 120 degrees

    // Physics decay for shake and mutation
    if (this.state.shake > 0) {
      this.state.shake *= 0.9;
      if (this.state.shake < 0.5) this.state.shake = 0;
    }
    
    // Mutation intensity decay (creates "rewriting" visual phase)
    if (this.state.mutation > 0) {
      this.state.mutation *= 0.94;
      if (this.state.mutation < 0.01) this.state.mutation = 0;
    }

    this.twins.forEach((t, i) => {
      // COLOR MORPHING: Smooth lerp toward target color during mutations
      t.color = this.lerpColor(t.color, t.targetColor, 0.05);
      
      // SIMPLIFIED GEOMETRY MORPHING: LERP flat properties (points, innerR) toward targets
      // Creates dramatic visible shape changes: 3=triangle, 4=star/square, 8=spiky, 20=circle
      const geoLerp = CoAITwinEngine.GEOMETRY_LERP_SPEED; // 8% per frame
      t.points = this.lerp(t.points, t.targetPoints, geoLerp);
      t.innerR = this.lerp(t.innerR, t.targetInner, geoLerp);
      
      let tx = 0, ty = 0;
      const starAngle = i * TRINITY_OFFSET;  // 0°, 120°, 240° for each star
      
      // MUTATION JITTER: Random scatter during the "rewriting" phase
      const mutationJitterX = (Math.random() - 0.5) * 50 * this.state.mutation;
      const mutationJitterY = (Math.random() - 0.5) * 50 * this.state.mutation;

      // Apply drag offset when being grabbed or slung
      if (this.isBeingDragged || Math.abs(this.dragOffsetX) > 1 || Math.abs(this.dragOffsetY) > 1) {
        // Stars cluster around the drag point with slight offset per star
        const clusterOffset = 12;
        tx = this.dragOffsetX + Math.cos(starAngle) * clusterOffset;
        ty = this.dragOffsetY + Math.sin(starAngle) * clusterOffset;
        
        // Add wobble during drag
        if (this.isBeingDragged) {
          tx += Math.sin(this.state.time * 0.2 + i) * 3;
          ty += Math.cos(this.state.time * 0.25 + i) * 3;
        }
      } else if (this.state.isTouching && this.state.touchX !== null && this.state.touchY !== null) {
        const mx = (this.state.touchX / window.devicePixelRatio) - cx;
        const my = (this.state.touchY / window.devicePixelRatio) - cy;
        tx = mx * 0.4 + Math.cos(this.state.time * 0.1 + starAngle) * (22 * s * 0.003);
        ty = my * 0.4 + Math.sin(this.state.time * 0.1 + starAngle) * (22 * s * 0.003);
      } else if (this.state.mode === 'IDLE') {
        // IDLE: Gentle spirograph pattern - stars stay close together
        const t1 = this.state.time * 0.015;
        const t2 = this.state.time * 0.04;
        const baseRadius = 22;  // Compact radius keeps stars close
        const phaseOffset = starAngle;
        tx = Math.cos(t1 + phaseOffset) * baseRadius + Math.sin(t2 + phaseOffset) * (baseRadius * 0.4);
        ty = Math.sin(t1 + phaseOffset) * (baseRadius * 0.6) + Math.cos(t2 + phaseOffset) * (baseRadius * 0.4);
      } else if (this.state.mode === 'SEARCHING') {
        // SEARCHING: Cyan at center, others orbit tightly
        if (i === 0) {
          tx = 0;
          ty = 0;
        } else {
          const searchAngle = this.state.time * 0.08 + starAngle;
          const searchRadius = 28;  // Tighter orbit
          tx = Math.cos(searchAngle) * searchRadius;
          ty = Math.sin(searchAngle) * searchRadius;
        }
        if (this.state.time % 30 === 0) this.spawnParticle(tx, ty, t.color);
      } else if (this.state.mode === 'ANALYZING') {
        // ANALYZING: Compact triangle with micro-jitter
        const cornerRadius = 25;
        const jitter = Math.sin(this.state.time * 0.15 + i) * 3;
        tx = Math.cos(starAngle) * cornerRadius + jitter;
        ty = Math.sin(starAngle) * cornerRadius;
      } else if (this.state.mode === 'THINKING') {
        // THINKING: Fast spin with pulsing - compact radius
        t.angle += 0.25;
        const thinkRadius = 20 + Math.sin(this.state.time * 0.3) * 8;
        tx = Math.cos(t.angle + starAngle) * thinkRadius;
        ty = Math.sin(t.angle + starAngle) * thinkRadius;
      } else if (this.state.mode === 'CODING') {
        // CODING: Compact grid movement
        const gridSize = 15;
        const speed = this.state.time * 0.08 + i * 2;
        tx = Math.round(Math.cos(speed) * 1.8) * gridSize;
        ty = Math.round(Math.sin(speed) * 1.8) * gridSize;
      } else if (this.state.mode === 'UPLOADING') {
        // UPLOADING: Compact helical wave
        const uploadAngle = this.state.time * 0.25 + starAngle;
        const helixRadius = 18;
        tx = Math.cos(uploadAngle) * helixRadius;
        ty = Math.sin(this.state.time * 0.08 + i) * 20;
        if (this.state.time % 4 === 0) {
          this.spawnParticle(tx, ty - 15, t.color, 0, -3);
        }
      } else if (this.state.mode === 'LISTENING') {
        // LISTENING: Compact waveform
        const waveAmp = Math.sin(this.state.time * 0.3 + i * 1.5) * Math.sin(this.state.time * 0.7);
        tx = (i - 1) * 22;  // Tighter spread: -22, 0, 22
        ty = waveAmp * 25;
      } else if (this.state.mode === 'SUCCESS') {
        // SUCCESS: Stars converge tightly, pulsing
        const convergeRadius = 12 + Math.sin(this.state.time * 0.4) * 6;
        tx = Math.cos(starAngle + this.state.time * 0.08) * convergeRadius;
        ty = Math.sin(starAngle + this.state.time * 0.08) * convergeRadius;
      } else if (this.state.mode === 'ERROR') {
        // ERROR: Compact chaotic shake
        tx = (Math.random() - 0.5) * 30;
        ty = (Math.random() - 0.5) * 30;
      } else if (this.state.mode === 'ADVISING') {
        // ADVISING: Compact professional orbit
        const adviseAngle = this.state.time * 0.04 + starAngle;
        const adviseRadius = 24;
        tx = Math.cos(adviseAngle) * adviseRadius;
        ty = Math.sin(adviseAngle) * adviseRadius * 0.6;
        if (this.state.time % 40 === 0 && i === 2) {
          this.spawnParticle(tx, ty, '#f4c15d');
        }
      } else if (this.state.mode === 'HOLIDAY') {
        // HOLIDAY: Compact festive figure-8
        const bouncePhase = this.state.time * 0.1 + starAngle;
        const bounceAmp = 25;
        tx = Math.cos(bouncePhase) * bounceAmp;
        ty = Math.sin(bouncePhase * 2) * bounceAmp * 0.5 + Math.abs(Math.sin(this.state.time * 0.2)) * 10;
        if (this.state.time % 20 === 0) {
          const xmasColors = CHRISTMAS_COLORS.particles;
          this.spawnParticle(tx, ty, xmasColors[Math.floor(Math.random() * xmasColors.length)]);
        }
      } else if (this.state.mode === 'CELEBRATING') {
        // CELEBRATING: Compact expanding bursts
        const celebAngle = this.state.time * 0.1 + starAngle;
        const pulse = 1 + Math.sin(this.state.time * 0.3) * 0.4;
        const celebRadius = 22 * pulse;
        tx = Math.cos(celebAngle) * celebRadius;
        ty = Math.sin(celebAngle) * celebRadius;
        if (this.state.time % 15 === 0) {
          this.spawnParticle(tx, ty, t.color, (Math.random() - 0.5) * 4, -3);
        }
      } else if (this.state.mode === 'GREETING') {
        // GREETING: Compact wave motion
        const waveOffset = Math.sin(this.state.time * 0.15 + i * 0.8) * 12;
        tx = Math.cos(starAngle) * 22;
        ty = Math.sin(starAngle) * 22 + waveOffset;
      }

      // Apply mutation jitter for "rewriting" visual scatter effect
      tx += mutationJitterX;
      ty += mutationJitterY;

      // Physics lerp - slower during mutation for floaty feel
      const lerpSpeed = this.state.mutation > 0 ? 0.05 : 0.1;
      t.x += (tx - t.x) * lerpSpeed;
      t.y += (ty - t.y) * lerpSpeed;

      t.trail.push({ x: t.x, y: t.y, life: 1.0 });
      if (t.trail.length > 20) t.trail.shift();
      t.trail.forEach(p => (p.life -= 0.05));
    });
  }

  private draw() {
    const { w, h, scale: s } = this.state;
    const cx = w / 2;
    const cy = h / 2;

    this.ctx.save();
    this.ctx.clearRect(0, 0, w, h);

    if (this.state.shake > 0) {
      this.ctx.translate(
        (Math.random() - 0.5) * this.state.shake,
        (Math.random() - 0.5) * this.state.shake
      );
    }

    this.ctx.translate(cx, cy);
    
    // CHROMATIC ABERRATION DISABLED - causes visual discomfort
    // Physical geometry morphing now handles mutations instead of light effects
    
    // Draw transition renderer effects (background layer)
    this.transitionRenderer.render(this.ctx, 0, 0);
    
    this.drawShockwaves();
    this.drawParticles();

    // Get visual config for current mode - applies scale/glow morph
    const visualConfig = MODE_VISUAL_CONFIG[this.state.mode];
    const modeScale = visualConfig.scale;
    const modeGlow = visualConfig.glow;
    const modePulseSpeed = visualConfig.pulseSpeed;
    
    // DRAMATIC pulse effect - higher amplitude for visible breathing
    const pulseAmplitude = 0.15 + (modeGlow * 0.1); // More glow = more pulse
    const modePulse = 1 + Math.sin(this.state.time * modePulseSpeed * 0.1) * pulseAmplitude;
    const finalScale = modeScale * modePulse;
    
    // MUTATION SCALE BOOST - during mode transition, scale up extra for emphasis
    const mutationBoost = 1 + (this.state.mutation * 0.4);
    const morphScale = finalScale * mutationBoost;
    
    this.twins.forEach((t, twinIndex) => {
      // Add trail points to transition renderer for polished motion trails
      if (this.isBeingDragged || Math.abs(this.slingVelocityX) > 2 || Math.abs(this.slingVelocityY) > 2) {
        this.transitionRenderer.addTrailPoint(t.x, t.y, twinIndex);
      }
      
      // NO GLOW LAYER - Physical geometry morphing handles visual changes
      // The star shape itself changes (point count, inner ratio, etc.)
      
      this.ctx.globalAlpha = 1.0;
      // Draw morphing star with physical geometry changes
      this.drawStar(t.x, t.y, 15 * s * 0.005 * morphScale, 4.5 * s * 0.005 * morphScale, t.color, twinIndex);
    });

    // Draw emote particles on top
    this.drawEmoteParticles();
    
    // Draw grab indicator when user is trying to catch
    if (this.grabMechanics.isGrabbing()) {
      this.drawGrabIndicator();
    }
    
    // GLITCH LINES DISABLED - Physical geometry morphing handles mutation visuals
    // No more sickening light effects - the stars actually change shape

    this.ctx.restore();
  }
  
  // Helper method for chromatic aberration ghost stars
  private drawMutationGhostStars(color: string): void {
    const s = this.state.scale;
    // Mutation scale pulse - stars pulse during mutation
    const mutationPulse = 1 + this.state.mutation * 0.3 * Math.sin(this.state.time * 0.3);
    
    this.twins.forEach((t) => {
      const outerR = 15 * s * 0.005 * mutationPulse;
      const innerR = 4.5 * s * 0.005 * mutationPulse;
      
      // Simple star shape for ghost effect
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI / 2) - (this.state.time * 0.05);
        this.ctx.lineTo(t.x + Math.cos(angle) * outerR, t.y + Math.sin(angle) * outerR);
        this.ctx.lineTo(t.x + Math.cos(angle + Math.PI / 4) * innerR, t.y + Math.sin(angle + Math.PI / 4) * innerR);
      }
      this.ctx.closePath();
      this.ctx.fill();
    });
  }
  
  private drawGrabIndicator(): void {
    const feedback = this.grabMechanics.getVisualFeedback();
    if (!feedback.isHolding) return;
    
    // Draw subtle grab ring around mascot - NO glow
    const pulse = Math.sin(this.state.time * 0.15) * 0.3 + 0.7;
    const radius = 40 * pulse;
    
    this.ctx.beginPath();
    this.ctx.arc(this.dragOffsetX, this.dragOffsetY, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = `rgba(34, 197, 94, ${0.4 * pulse})`;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // REMOVED inner glow gradient - no more sickening glow effects
  }

  private drawStar(x: number, y: number, outerR: number, _innerR: number, color: string, twinIndex: number = 0) {
    // Get morph state from morphing engine
    const morphState = this.morphEngine.getStarState(twinIndex, this.state.time);
    
    // Apply emote behaviors - Trinity: cyan (0), purple (1), gold (2)
    const behaviors = [this.emoteState.cyanBehavior, this.emoteState.purpleBehavior, this.emoteState.goldBehavior];
    const behavior = behaviors[twinIndex] || behaviors[0];
    
    // Calculate target scale from behavior and morph state
    const targetScale = behavior.scale * morphState.scale;
    
    // Get current twin
    const twin = this.twins[twinIndex];
    if (twin) {
      twin.currentScale = twin.currentScale + (targetScale - twin.currentScale) * CoAITwinEngine.SCALE_LERP_SPEED;
      twin.currentScale = Math.max(0.5, Math.min(twin.currentScale, 2.0));
    }
    
    // Mutation pulse for dramatic effect during mode transitions
    const mutationPulse = 1 + this.state.mutation * 0.15 * Math.sin(this.state.time * 0.4);
    const scale = (twin?.currentScale ?? targetScale) * mutationPulse;
    const wobble = behavior.wobble * morphState.wobbleAmount;
    const speed = behavior.speed * morphState.wobbleSpeed;
    
    // Apply wobble offset
    const wobbleX = Math.sin(this.state.time * 0.1 * speed + twinIndex * 2.1) * wobble * 3;
    const wobbleY = Math.cos(this.state.time * 0.12 * speed + twinIndex * 2.1) * wobble * 3;
    const drawX = x + wobbleX + morphState.offsetX;
    const drawY = y + wobbleY + morphState.offsetY;
    
    // ====== SIMPLIFIED PHYSICAL GEOMETRY MORPHING ======
    // Use twin.points and twin.innerR (which are lerped toward targets each frame)
    const numPoints = twin?.points ?? 4;
    const innerRatio = twin?.innerR ?? 0.25;
    
    // Calculate scaled radius
    const radius = outerR * scale;
    
    // Rotation animation
    const rotation = -(this.state.time * 0.05 * speed);
    
    // Draw the morphed polygon (star shape with variable points and inner ratio)
    this.drawPolygon(drawX, drawY, radius, numPoints, innerRatio, color, twinIndex);
  }
  
  // SIMPLIFIED polygon drawing - dramatic geometry morphing without complex effects
  private drawPolygon(x: number, y: number, radius: number, points: number, innerRatio: number, color: string, twinIndex: number = 0) {
    // Round points to integer but allow fractional for smooth transition
    const p = Math.max(3, Math.round(points));
    const step = Math.PI / p;
    const rotation = -(this.state.time * 0.05);
    
    // Draw dark outline first
    this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    for (let i = 0; i < 2 * p; i++) {
      const r = (i % 2 === 0) ? radius * 1.1 : radius * innerRatio * 1.1;
      const a = i * step + rotation;
      this.ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.ctx.closePath();
    this.ctx.stroke();
    
    // Draw colored fill with subtle shadow
    this.ctx.fillStyle = color;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = color;
    this.ctx.beginPath();
    for (let i = 0; i < 2 * p; i++) {
      const r = (i % 2 === 0) ? radius : radius * innerRatio;
      const a = i * step + rotation;
      this.ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    this.ctx.closePath();
    this.ctx.fill();
    
    // Reset shadow and add stroke
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    
    // Draw white center dot
    const centerRadius = radius * 0.25;
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, centerRadius, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Trinity branded text: "Co" (cyan), "AI" (purple), "LE" (gold)
    const brandLabels = ['Co', 'AI', 'LE'];
    const brandColors = ['#a855f7', '#38bdf8', '#1e3a5f'];
    const label = brandLabels[twinIndex] || 'LE';
    const labelColor = brandColors[twinIndex] || '#1e3a5f';
    
    const fontSize = Math.max(4, radius * 0.55);
    this.ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = labelColor;
    this.ctx.fillText(label, x, y + 0.5);
  }

  private drawEmoteParticles() {
    for (let i = this.emoteParticles.length - 1; i >= 0; i--) {
      const p = this.emoteParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.type === 'zzz' ? -0.02 : 0.05; // Gravity or float up for zzz
      p.life -= 0.02;
      
      if (p.life <= 0) {
        this.emoteParticles.splice(i, 1);
        continue;
      }
      
      const fontSize = 12 + p.life * 8;
      this.ctx.globalAlpha = p.life;
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      // Draw dark text shadow for visibility on light backgrounds
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      this.ctx.fillText(p.char || '', p.x + 1, p.y + 1);
      
      // Choose colorful fill based on particle type for visibility
      const colorMap: Record<string, string> = {
        'sparkle': '#fbbf24',    // Amber/gold
        'hearts': '#ec4899',     // Pink
        'stars': '#facc15',      // Yellow
        'confetti': '#a855f7',   // Purple
        'zzz': '#6366f1',        // Indigo
        'question': '#3b82f6',   // Blue  
        'exclaim': '#ef4444',    // Red
      };
      this.ctx.fillStyle = colorMap[p.type] || '#fff';
      this.ctx.fillText(p.char || '', p.x, p.y);
    }
    this.ctx.globalAlpha = 1.0;
  }

  private drawGrid(w: number, h: number, s: number) {
    this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    this.ctx.lineWidth = 1;
    const gridSize = 50 * s * 0.002;
    const offsetY = (this.state.time * 0.5) % gridSize;
    const countX = Math.ceil(w / 2 / gridSize) + 1;
    const countY = Math.ceil(h / 2 / gridSize) + 1;
    this.ctx.beginPath();
    for (let i = -countX; i <= countX; i++) {
      this.ctx.moveTo(i * gridSize, -h / 2);
      this.ctx.lineTo(i * gridSize, h / 2);
    }
    for (let i = -countY; i <= countY; i++) {
      this.ctx.moveTo(-w / 2, i * gridSize + offsetY);
      this.ctx.lineTo(w / 2, i * gridSize + offsetY);
    }
    this.ctx.stroke();
  }

  private drawShockwaves() {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.r += 5;
      sw.opacity -= 0.03;
      if (sw.opacity <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }
      
      // Draw dark outer ring for visibility on light backgrounds
      this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
      this.ctx.globalAlpha = sw.opacity * 0.6;
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, sw.r, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Draw colored shockwave
      this.ctx.strokeStyle = sw.color;
      this.ctx.globalAlpha = sw.opacity;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, sw.r, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1.0;
    }
  }

  private drawParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      
      // Draw dark outline for visibility on light backgrounds
      this.ctx.globalAlpha = p.life * 0.6;
      this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Draw colored particle
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
  }

  // Performance constants
  private static readonly MAX_PARTICLES = 100;
  private static readonly MAX_EMOTE_PARTICLES = 50;
  private static readonly MAX_TRAIL_LENGTH = 20;
  private static readonly TARGET_FRAME_TIME = 16.67; // 60fps
  
  private animate = () => {
    if (!this.isRunning) return;
    
    // Skip animation when tab is hidden to save CPU
    if (typeof document !== 'undefined' && document.hidden) {
      this.animationFrameId = requestAnimationFrame(this.animate);
      return;
    }
    
    // Delta-based frame limiting
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    
    // Skip frame if too soon (throttle to ~60fps)
    if (delta < CoAITwinEngine.TARGET_FRAME_TIME * 0.8) {
      this.animationFrameId = requestAnimationFrame(this.animate);
      return;
    }
    
    this.lastFrameTime = now;
    
    // Enforce particle caps to prevent memory bloat
    if (this.particles.length > CoAITwinEngine.MAX_PARTICLES) {
      this.particles = this.particles.slice(-CoAITwinEngine.MAX_PARTICLES);
    }
    if (this.emoteParticles.length > CoAITwinEngine.MAX_EMOTE_PARTICLES) {
      this.emoteParticles = this.emoteParticles.slice(-CoAITwinEngine.MAX_EMOTE_PARTICLES);
    }
    
    // Enforce trail caps
    for (const twin of this.twins) {
      if (twin.trail.length > CoAITwinEngine.MAX_TRAIL_LENGTH) {
        twin.trail = twin.trail.slice(-CoAITwinEngine.MAX_TRAIL_LENGTH);
      }
    }
    
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  destroy() {
    this.stop();
    this.warpTimeouts.forEach(t => clearTimeout(t));
    this.warpTimeouts = [];
  }
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255,255,255';
}

export const CoAITwinMascot = memo(function CoAITwinMascot({
  mode = 'IDLE',
  className = '',
  showControls = false,
  onModeChange,
  size,
  mini = false,
  variant,
  emote,
  triggerEmote,
  onEmoteComplete,
  chromaticAberration = false,
  glitchEffect = false,
  warpIntensity = 0
}: CoAITwinMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CoAITwinEngine | null>(null);
  const lastTriggeredEmote = useRef<EmoteName | undefined>(undefined);
  
  // Warp mutation overlay state
  const [warpState, setWarpState] = useState<{
    phase: WarpPhase;
    intensity: number;
    colors: WarpColors;
  }>({
    phase: 'idle',
    intensity: 0,
    colors: { primary: '#38bdf8', secondary: '#a855f7', accent: '#f4c15d' }
  });

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    engineRef.current = new CoAITwinEngine(containerRef.current, canvasRef.current);
    engineRef.current.setMode(mode);
    engineRef.current.start();
    
    // Set up emote complete callback
    if (onEmoteComplete) {
      engineRef.current.setEmoteCallback(onEmoteComplete);
    }
    
    // Set up warp state callback for CSS overlay effects
    engineRef.current.setWarpStateCallback((phase, intensity, colors) => {
      setWarpState({ phase, intensity, colors });
    });
    
    // Initialize warp state from engine
    const initialWarpState = engineRef.current.getWarpState();
    setWarpState(initialWarpState);

    const handleResize = () => {
      engineRef.current?.resize();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      engineRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current && engineRef.current.getMode() !== mode) {
      engineRef.current.setMode(mode);
    }
  }, [mode]);

  // Trigger emote animations when prop changes
  useEffect(() => {
    if (engineRef.current && triggerEmote && triggerEmote !== lastTriggeredEmote.current) {
      lastTriggeredEmote.current = triggerEmote;
      engineRef.current.triggerEmote(triggerEmote);
    }
  }, [triggerEmote]);

  // Apply emote state to engine
  useEffect(() => {
    if (engineRef.current && emote) {
      engineRef.current.setEmote(emote);
    }
  }, [emote]);
  
  // Update emote complete callback when it changes
  useEffect(() => {
    if (engineRef.current && onEmoteComplete) {
      engineRef.current.setEmoteCallback(onEmoteComplete);
    }
  }, [onEmoteComplete]);

  const handleModeChange = useCallback((newMode: MascotMode) => {
    if (engineRef.current) {
      engineRef.current.setMode(newMode);
    }
    onModeChange?.(newMode);
  }, [onModeChange]);

  const color = MODE_COLORS[mode];
  const label = MODE_LABELS[mode];

  // Determine which variant to render
  const effectiveVariant: MascotVariant = variant || (mini ? 'mini' : 'full');

  // Build CSS filter for showcase effects
  const showcaseFilter = [
    chromaticAberration ? 'url(#chromatic-aberration)' : '',
    glitchEffect ? 'url(#glitch-effect)' : '',
    warpIntensity > 0 ? `hue-rotate(${warpIntensity * 45}deg) saturate(${1 + warpIntensity * 0.5})` : ''
  ].filter(Boolean).join(' ') || undefined;
  
  // Glitch animation class
  const glitchClass = glitchEffect ? 'animate-glitch' : '';
  const chromaticClass = chromaticAberration ? 'animate-chromatic' : '';

  // Mini mode: Small 80px bubble for corner placement
  if (effectiveVariant === 'mini') {
    const bubbleSize = size || 80;
    return (
      <div 
        className={`relative overflow-visible pointer-events-none ${className}`}
        style={{ 
          width: bubbleSize, 
          height: bubbleSize,
          background: 'transparent'
        }}
        data-mascot-variant="mini"
        data-mascot-mode={mode}
        data-warp-active={warpState.phase !== 'idle'}
        data-chromatic={chromaticAberration}
        data-glitch={glitchEffect}
        data-warp-intensity={warpIntensity > 0 ? warpIntensity : undefined}
      >
        {/* SVG filters for visual effects */}
        <svg className="absolute w-0 h-0" aria-hidden="true">
          <defs>
            <filter id="chromatic-aberration" x="-20%" y="-20%" width="140%" height="140%">
              <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
              <feOffset in="red" dx="2" dy="0" result="red-shifted" />
              <feColorMatrix type="matrix" in="SourceGraphic" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
              <feColorMatrix type="matrix" in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
              <feOffset in="blue" dx="-2" dy="0" result="blue-shifted" />
              <feBlend mode="screen" in="red-shifted" in2="green" result="red-green" />
              <feBlend mode="screen" in="red-green" in2="blue-shifted" />
            </filter>
            <filter id="glitch-effect" x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="1" result="noise" seed="0">
                <animate attributeName="seed" from="0" to="100" dur="0.5s" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        
        <div 
          ref={containerRef} 
          className={`w-full h-full pointer-events-none relative ${glitchClass} ${chromaticClass}`}
          style={{ 
            width: bubbleSize, 
            height: bubbleSize,
            transform: `scale(2.2) ${warpIntensity > 0 ? `rotate(${warpIntensity * 5}deg)` : ''}`,
            transformOrigin: 'center',
            filter: showcaseFilter,
            transition: 'filter 0.3s ease-out, transform 0.3s ease-out',
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none"
            style={{ 
              width: bubbleSize, 
              height: bubbleSize,
              background: 'transparent'
            }}
            data-testid="coai-twin-mascot-canvas-mini"
          />
          {/* OVERLAYS REMOVED - Physical geometry morphing handles mutations */}
        </div>
      </div>
    );
  }

  // Expanded mode: Larger 180px bubble for detailed view
  if (effectiveVariant === 'expanded') {
    const bubbleSize = size || 180;
    return (
      <div 
        className={`relative overflow-visible pointer-events-none ${className}`}
        style={{ 
          width: bubbleSize, 
          height: bubbleSize,
          background: 'transparent'
        }}
        data-mascot-variant="expanded"
        data-mascot-mode={mode}
      >
        <div 
          ref={containerRef} 
          className="w-full h-full pointer-events-none relative"
          style={{ 
            width: bubbleSize, 
            height: bubbleSize,
            transform: 'scale(1.4)',
            transformOrigin: 'center',
            transition: 'transform 0.3s ease-out',
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none"
            style={{ 
              width: bubbleSize, 
              height: bubbleSize,
              background: 'transparent'
            }}
            data-testid="coai-twin-mascot-canvas-expanded"
          />
          {/* OVERLAYS REMOVED - Physical geometry morphing handles mutations */}
        </div>
      </div>
    );
  }

  // Full mode: With status badge and optional controls
  const fullSize = size || 400;
  return (
    <div 
      className={`relative ${className}`} 
      style={{ background: 'transparent' }}
      data-mascot-variant="full"
      data-mascot-mode={mode}
    >
      <div ref={containerRef} className="w-full h-full relative" style={{ background: 'transparent' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ background: 'transparent' }}
          data-testid="coai-twin-mascot-canvas"
        />
        {/* OVERLAYS REMOVED - Physical geometry morphing handles mutations */}
      </div>

      <div className="absolute bottom-0 left-0 w-full p-4 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(2, 6, 23, 0.4) 30%, rgba(2, 6, 23, 0.2) 70%, transparent)'
        }}
      >
        <div className="flex justify-center mb-3">
          <div
            className="text-[11px] font-bold tracking-[2px] uppercase px-5 py-2 rounded-full flex items-center gap-2.5"
            style={{
              color: '#ffffff',
              background: `rgba(${hexToRgb(color)}, 0.15)`,
              border: `1px solid rgba(${hexToRgb(color)}, 0.3)`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: `0 4px 20px rgba(0,0,0,0.2), 0 0 15px rgba(${hexToRgb(color)}, 0.2)`,
              textShadow: `0 0 10px rgba(${hexToRgb(color)}, 0.6), 0 1px 2px rgba(0,0,0,0.5)`
            }}
            data-testid="mascot-status-badge"
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background: color,
                boxShadow: `0 0 8px ${color}`
              }}
            />
            <span>CO-AI {label.toUpperCase()}</span>
          </div>
        </div>

        {showControls && (
          <div className="pointer-events-auto">
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as MascotMode)}
              className="w-full appearance-none border text-white px-5 py-3.5 rounded-xl text-sm font-semibold tracking-wide cursor-pointer transition-all focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              style={{ 
                background: 'rgba(30, 41, 59, 0.3)',
                borderColor: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' 
              }}
              data-testid="mascot-mode-select"
            >
              <option value="IDLE">IDLE (Waiting)</option>
              <option value="SEARCHING">SEARCHING (Radar Scan)</option>
              <option value="THINKING">THINKING (Processing)</option>
              <option value="ANALYZING">ANALYZING (Neural Net)</option>
              <option value="CODING">CODING (Matrix)</option>
              <option value="LISTENING">LISTENING (Voice)</option>
              <option value="UPLOADING">UPLOADING (Transfer)</option>
              <option value="SUCCESS">SUCCESS (Complete)</option>
              <option value="ERROR">ERROR (Alert)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
});

export { MODE_COLORS, MODE_LABELS };
export type { MascotVariant };
