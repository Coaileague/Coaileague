/**
 * Emote Morphing Engine for Trinity Mascot
 * 
 * Handles visual transformation of the 3 Trinity stars (Co/cyan, AI/purple, LE/gold)
 * into expressive emote formations and back to normal standby mode.
 * 
 * Animation Phases:
 * - IDLE: Normal floating/standby
 * - ENTER: Stars begin morphing toward emote formation
 * - ACTIVE: Stars hold emote pose with dynamic effects
 * - PEAK: Maximum expression intensity
 * - EXIT: Stars return toward normal positions
 * - STANDBY: Smooth return to idle floating
 */

export type EmotePhase = 'IDLE' | 'ENTER' | 'ACTIVE' | 'PEAK' | 'EXIT' | 'STANDBY';

export type EmoteName = 
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'thinking'
  | 'curious'
  | 'surprised'
  | 'celebrating'
  | 'sleepy'
  | 'focused'
  | 'concerned'
  | 'proud'
  | 'waving'
  | 'nodding'
  | 'alert'
  | 'love';

export interface StarMorphTarget {
  offsetX: number;      // X offset from formation center
  offsetY: number;      // Y offset from formation center
  scale: number;        // Size multiplier
  rotation: number;     // Rotation in radians
  glowIntensity: number; // Glow strength 0-2
  wobbleSpeed: number;   // Animation speed multiplier
  wobbleAmount: number;  // How much the star wobbles
}

export interface EmoteFormation {
  name: EmoteName;
  duration: number;        // Total animation duration in ms
  phaseTiming: {          // Percentage of duration for each phase
    enter: number;
    active: number;
    peak: number;
    exit: number;
  };
  stars: {
    cyan: StarMorphTarget;   // Co star
    purple: StarMorphTarget; // AI star
    gold: StarMorphTarget;   // LE star
  };
  particleEffect?: string;
  shockwaveColor?: string;
  screenShake?: number;
}

export interface MorphState {
  phase: EmotePhase;
  emote: EmoteName;
  progress: number;       // 0-1 within current phase
  overallProgress: number; // 0-1 for entire animation
  startTime: number;
  isActive: boolean;
}

export interface StarRenderState {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  glowIntensity: number;
  wobbleSpeed: number;
  wobbleAmount: number;
}

const TRINITY_OFFSET = (Math.PI * 2) / 3; // 120° separation

const IDLE_FORMATION: EmoteFormation = {
  name: 'neutral',
  duration: 0,
  phaseTiming: { enter: 0, active: 0, peak: 0, exit: 0 },
  stars: {
    cyan: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, glowIntensity: 0.4, wobbleSpeed: 1, wobbleAmount: 0.5 },
    purple: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, glowIntensity: 0.4, wobbleSpeed: 1, wobbleAmount: 0.5 },
    gold: { offsetX: 0, offsetY: 0, scale: 1, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 1, wobbleAmount: 0.5 },
  }
};

export const EMOTE_FORMATIONS: Record<EmoteName, EmoteFormation> = {
  neutral: IDLE_FORMATION,
  
  happy: {
    name: 'happy',
    duration: 3000,
    phaseTiming: { enter: 0.15, active: 0.5, peak: 0.2, exit: 0.15 },
    stars: {
      cyan: { offsetX: -15, offsetY: -8, scale: 1.15, rotation: -0.2, glowIntensity: 0.7, wobbleSpeed: 1.4, wobbleAmount: 0.8 },
      purple: { offsetX: 15, offsetY: -8, scale: 1.15, rotation: 0.2, glowIntensity: 0.7, wobbleSpeed: 1.4, wobbleAmount: 0.8 },
      gold: { offsetX: 0, offsetY: 12, scale: 1.2, rotation: 0, glowIntensity: 0.8, wobbleSpeed: 1.5, wobbleAmount: 1 },
    },
    particleEffect: 'sparkle',
    shockwaveColor: '#fbbf24'
  },
  
  excited: {
    name: 'excited',
    duration: 4000,
    phaseTiming: { enter: 0.1, active: 0.5, peak: 0.25, exit: 0.15 },
    stars: {
      cyan: { offsetX: -20, offsetY: -15, scale: 1.3, rotation: -0.4, glowIntensity: 0.9, wobbleSpeed: 2.2, wobbleAmount: 1.8 },
      purple: { offsetX: 20, offsetY: -15, scale: 1.3, rotation: 0.4, glowIntensity: 0.9, wobbleSpeed: 2.2, wobbleAmount: 1.8 },
      gold: { offsetX: 0, offsetY: 18, scale: 1.4, rotation: 0, glowIntensity: 1, wobbleSpeed: 2.5, wobbleAmount: 2 },
    },
    particleEffect: 'confetti',
    shockwaveColor: '#a855f7',
    screenShake: 3
  },
  
  thinking: {
    name: 'thinking',
    duration: 5000,
    phaseTiming: { enter: 0.2, active: 0.6, peak: 0.1, exit: 0.1 },
    stars: {
      cyan: { offsetX: 18, offsetY: -5, scale: 0.9, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 0.4, wobbleAmount: 0.2 },
      purple: { offsetX: -5, offsetY: 0, scale: 1.1, rotation: 0.1, glowIntensity: 0.6, wobbleSpeed: 0.5, wobbleAmount: 0.3 },
      gold: { offsetX: 10, offsetY: 10, scale: 0.85, rotation: 0, glowIntensity: 0.4, wobbleSpeed: 0.3, wobbleAmount: 0.2 },
    },
    particleEffect: 'question'
  },
  
  curious: {
    name: 'curious',
    duration: 3000,
    phaseTiming: { enter: 0.2, active: 0.5, peak: 0.15, exit: 0.15 },
    stars: {
      cyan: { offsetX: 20, offsetY: -12, scale: 1.2, rotation: 0.3, glowIntensity: 0.7, wobbleSpeed: 1.2, wobbleAmount: 0.6 },
      purple: { offsetX: -8, offsetY: 5, scale: 0.9, rotation: -0.1, glowIntensity: 0.5, wobbleSpeed: 0.8, wobbleAmount: 0.4 },
      gold: { offsetX: -15, offsetY: -5, scale: 0.95, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 0.9, wobbleAmount: 0.5 },
    },
    particleEffect: 'question'
  },
  
  surprised: {
    name: 'surprised',
    duration: 2000,
    phaseTiming: { enter: 0.1, active: 0.4, peak: 0.3, exit: 0.2 },
    stars: {
      cyan: { offsetX: -25, offsetY: 0, scale: 1.4, rotation: -0.5, glowIntensity: 1, wobbleSpeed: 3, wobbleAmount: 2.5 },
      purple: { offsetX: 25, offsetY: 0, scale: 1.4, rotation: 0.5, glowIntensity: 1, wobbleSpeed: 3, wobbleAmount: 2.5 },
      gold: { offsetX: 0, offsetY: -20, scale: 1.5, rotation: 0, glowIntensity: 1.2, wobbleSpeed: 3.5, wobbleAmount: 3 },
    },
    particleEffect: 'exclaim',
    shockwaveColor: '#fbbf24',
    screenShake: 8
  },
  
  celebrating: {
    name: 'celebrating',
    duration: 5000,
    phaseTiming: { enter: 0.1, active: 0.55, peak: 0.25, exit: 0.1 },
    stars: {
      cyan: { offsetX: -18, offsetY: -20, scale: 1.35, rotation: -0.6, glowIntensity: 1.1, wobbleSpeed: 2.8, wobbleAmount: 2.2 },
      purple: { offsetX: 18, offsetY: -20, scale: 1.35, rotation: 0.6, glowIntensity: 1.1, wobbleSpeed: 2.8, wobbleAmount: 2.2 },
      gold: { offsetX: 0, offsetY: 15, scale: 1.5, rotation: 0, glowIntensity: 1.3, wobbleSpeed: 3, wobbleAmount: 2.5 },
    },
    particleEffect: 'confetti',
    shockwaveColor: '#f472b6',
    screenShake: 5
  },
  
  sleepy: {
    name: 'sleepy',
    duration: 6000,
    phaseTiming: { enter: 0.25, active: 0.5, peak: 0.1, exit: 0.15 },
    stars: {
      cyan: { offsetX: -8, offsetY: 5, scale: 0.8, rotation: -0.15, glowIntensity: 0.2, wobbleSpeed: 0.25, wobbleAmount: 0.15 },
      purple: { offsetX: 8, offsetY: 5, scale: 0.8, rotation: 0.15, glowIntensity: 0.2, wobbleSpeed: 0.25, wobbleAmount: 0.15 },
      gold: { offsetX: 0, offsetY: 10, scale: 0.75, rotation: 0, glowIntensity: 0.15, wobbleSpeed: 0.2, wobbleAmount: 0.1 },
    },
    particleEffect: 'zzz'
  },
  
  focused: {
    name: 'focused',
    duration: 4000,
    phaseTiming: { enter: 0.2, active: 0.6, peak: 0.1, exit: 0.1 },
    stars: {
      cyan: { offsetX: -12, offsetY: 0, scale: 1.05, rotation: 0, glowIntensity: 0.7, wobbleSpeed: 0.3, wobbleAmount: 0.1 },
      purple: { offsetX: 12, offsetY: 0, scale: 1.05, rotation: 0, glowIntensity: 0.7, wobbleSpeed: 0.3, wobbleAmount: 0.1 },
      gold: { offsetX: 0, offsetY: -8, scale: 1.1, rotation: 0, glowIntensity: 0.8, wobbleSpeed: 0.4, wobbleAmount: 0.15 },
    }
  },
  
  concerned: {
    name: 'concerned',
    duration: 3500,
    phaseTiming: { enter: 0.2, active: 0.5, peak: 0.15, exit: 0.15 },
    stars: {
      cyan: { offsetX: -10, offsetY: 8, scale: 0.9, rotation: 0.2, glowIntensity: 0.4, wobbleSpeed: 0.6, wobbleAmount: 0.4 },
      purple: { offsetX: 10, offsetY: 8, scale: 0.9, rotation: -0.2, glowIntensity: 0.4, wobbleSpeed: 0.6, wobbleAmount: 0.4 },
      gold: { offsetX: 0, offsetY: -5, scale: 0.95, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 0.5, wobbleAmount: 0.3 },
    }
  },
  
  proud: {
    name: 'proud',
    duration: 4000,
    phaseTiming: { enter: 0.15, active: 0.55, peak: 0.2, exit: 0.1 },
    stars: {
      cyan: { offsetX: -15, offsetY: -10, scale: 1.15, rotation: -0.15, glowIntensity: 0.8, wobbleSpeed: 0.8, wobbleAmount: 0.5 },
      purple: { offsetX: 15, offsetY: -10, scale: 1.15, rotation: 0.15, glowIntensity: 0.8, wobbleSpeed: 0.8, wobbleAmount: 0.5 },
      gold: { offsetX: 0, offsetY: 5, scale: 1.25, rotation: 0, glowIntensity: 1, wobbleSpeed: 1, wobbleAmount: 0.6 },
    },
    particleEffect: 'stars',
    shockwaveColor: '#f4c15d'
  },
  
  waving: {
    name: 'waving',
    duration: 2500,
    phaseTiming: { enter: 0.15, active: 0.55, peak: 0.15, exit: 0.15 },
    stars: {
      cyan: { offsetX: 25, offsetY: -15, scale: 1.2, rotation: 0.8, glowIntensity: 0.7, wobbleSpeed: 2.5, wobbleAmount: 1.5 },
      purple: { offsetX: -10, offsetY: 5, scale: 1, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 1, wobbleAmount: 0.5 },
      gold: { offsetX: -5, offsetY: 10, scale: 0.95, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 1, wobbleAmount: 0.5 },
    },
    particleEffect: 'sparkle'
  },
  
  nodding: {
    name: 'nodding',
    duration: 2000,
    phaseTiming: { enter: 0.1, active: 0.6, peak: 0.15, exit: 0.15 },
    stars: {
      cyan: { offsetX: -12, offsetY: 0, scale: 1, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 2.2, wobbleAmount: 0.3 },
      purple: { offsetX: 12, offsetY: 0, scale: 1, rotation: 0, glowIntensity: 0.5, wobbleSpeed: 2.2, wobbleAmount: 0.3 },
      gold: { offsetX: 0, offsetY: 8, scale: 1.1, rotation: 0, glowIntensity: 0.6, wobbleSpeed: 2.5, wobbleAmount: 0.8 },
    }
  },
  
  alert: {
    name: 'alert',
    duration: 2500,
    phaseTiming: { enter: 0.1, active: 0.5, peak: 0.25, exit: 0.15 },
    stars: {
      cyan: { offsetX: -20, offsetY: -5, scale: 1.25, rotation: -0.3, glowIntensity: 0.9, wobbleSpeed: 3, wobbleAmount: 1.8 },
      purple: { offsetX: 20, offsetY: -5, scale: 1.25, rotation: 0.3, glowIntensity: 0.9, wobbleSpeed: 3, wobbleAmount: 1.8 },
      gold: { offsetX: 0, offsetY: -15, scale: 1.35, rotation: 0, glowIntensity: 1.1, wobbleSpeed: 3.5, wobbleAmount: 2 },
    },
    particleEffect: 'exclaim',
    shockwaveColor: '#ef4444',
    screenShake: 6
  },
  
  love: {
    name: 'love',
    duration: 4000,
    phaseTiming: { enter: 0.15, active: 0.55, peak: 0.2, exit: 0.1 },
    stars: {
      cyan: { offsetX: -18, offsetY: 5, scale: 1.2, rotation: 0.4, glowIntensity: 0.8, wobbleSpeed: 1.2, wobbleAmount: 0.8 },
      purple: { offsetX: 18, offsetY: 5, scale: 1.2, rotation: -0.4, glowIntensity: 0.8, wobbleSpeed: 1.2, wobbleAmount: 0.8 },
      gold: { offsetX: 0, offsetY: -15, scale: 1.3, rotation: 0, glowIntensity: 1, wobbleSpeed: 1.5, wobbleAmount: 1 },
    },
    particleEffect: 'hearts',
    shockwaveColor: '#ec4899'
  }
};

export class EmoteMorphingEngine {
  private state: MorphState = {
    phase: 'IDLE',
    emote: 'neutral',
    progress: 0,
    overallProgress: 0,
    startTime: 0,
    isActive: false
  };
  
  private currentFormation: EmoteFormation = IDLE_FORMATION;
  private targetFormation: EmoteFormation = IDLE_FORMATION;
  private callbacks: {
    onPhaseChange?: (phase: EmotePhase, emote: EmoteName) => void;
    onParticle?: (effect: string) => void;
    onShockwave?: (color: string) => void;
    onShake?: (intensity: number) => void;
    onComplete?: (emote: EmoteName) => void;
  } = {};
  
  private peakTriggered = false;
  
  constructor() {
    this.reset();
  }
  
  setCallbacks(callbacks: typeof this.callbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  triggerEmote(emote: EmoteName): void {
    if (emote === 'neutral') {
      this.returnToIdle();
      return;
    }
    
    const formation = EMOTE_FORMATIONS[emote];
    if (!formation) return;
    
    this.targetFormation = formation;
    this.state = {
      phase: 'ENTER',
      emote,
      progress: 0,
      overallProgress: 0,
      startTime: performance.now(),
      isActive: true
    };
    this.peakTriggered = false;
    
    this.callbacks.onPhaseChange?.('ENTER', emote);
    
    if (formation.shockwaveColor) {
      this.callbacks.onShockwave?.(formation.shockwaveColor);
    }
  }
  
  returnToIdle(): void {
    if (this.state.phase === 'IDLE' || this.state.phase === 'STANDBY') return;
    
    this.state.phase = 'EXIT';
    this.state.progress = 0;
    this.callbacks.onPhaseChange?.('EXIT', this.state.emote);
  }
  
  forceIdle(): void {
    this.state = {
      phase: 'IDLE',
      emote: 'neutral',
      progress: 0,
      overallProgress: 0,
      startTime: 0,
      isActive: false
    };
    this.currentFormation = IDLE_FORMATION;
    this.targetFormation = IDLE_FORMATION;
    this.peakTriggered = false;
  }
  
  update(deltaMs: number): void {
    if (!this.state.isActive) return;
    
    const formation = this.targetFormation;
    const elapsed = performance.now() - this.state.startTime;
    const duration = formation.duration;
    
    this.state.overallProgress = Math.min(elapsed / duration, 1);
    
    const timing = formation.phaseTiming;
    const enterEnd = timing.enter;
    const activeEnd = enterEnd + timing.active;
    const peakEnd = activeEnd + timing.peak;
    
    const p = this.state.overallProgress;
    let newPhase = this.state.phase;
    let phaseProgress = 0;
    
    if (p < enterEnd) {
      newPhase = 'ENTER';
      phaseProgress = p / enterEnd;
    } else if (p < activeEnd) {
      newPhase = 'ACTIVE';
      phaseProgress = (p - enterEnd) / timing.active;
      
      if (formation.particleEffect && !this.peakTriggered && phaseProgress > 0.3) {
        this.callbacks.onParticle?.(formation.particleEffect);
      }
    } else if (p < peakEnd) {
      newPhase = 'PEAK';
      phaseProgress = (p - activeEnd) / timing.peak;
      
      if (!this.peakTriggered) {
        this.peakTriggered = true;
        if (formation.screenShake) {
          this.callbacks.onShake?.(formation.screenShake);
        }
        if (formation.particleEffect) {
          this.callbacks.onParticle?.(formation.particleEffect);
        }
      }
    } else if (p < 1) {
      newPhase = 'EXIT';
      phaseProgress = (p - peakEnd) / timing.exit;
    } else {
      newPhase = 'STANDBY';
      phaseProgress = 1;
    }
    
    if (newPhase !== this.state.phase) {
      this.state.phase = newPhase;
      this.callbacks.onPhaseChange?.(newPhase, this.state.emote);
    }
    
    this.state.progress = phaseProgress;
    
    if (newPhase === 'STANDBY' && this.state.isActive) {
      this.state.isActive = false;
      this.callbacks.onComplete?.(this.state.emote);
      
      setTimeout(() => {
        if (this.state.phase === 'STANDBY') {
          this.state.phase = 'IDLE';
          this.state.emote = 'neutral';
          this.currentFormation = IDLE_FORMATION;
          this.targetFormation = IDLE_FORMATION;
        }
      }, 300);
    }
  }
  
  getStarState(starIndex: number, time: number): StarRenderState {
    const starKey = ['cyan', 'purple', 'gold'][starIndex] as 'cyan' | 'purple' | 'gold';
    
    const idleTarget = IDLE_FORMATION.stars[starKey];
    const emoteTarget = this.targetFormation.stars[starKey];
    
    let morphProgress = 0;
    
    switch (this.state.phase) {
      case 'IDLE':
        morphProgress = 0;
        break;
      case 'ENTER':
        morphProgress = this.easeOutCubic(this.state.progress);
        break;
      case 'ACTIVE':
        morphProgress = 1;
        break;
      case 'PEAK':
        const peakPulse = Math.sin(this.state.progress * Math.PI);
        morphProgress = 1 + peakPulse * 0.15;
        break;
      case 'EXIT':
        morphProgress = 1 - this.easeInCubic(this.state.progress);
        break;
      case 'STANDBY':
        morphProgress = 0;
        break;
    }
    
    morphProgress = Math.max(0, Math.min(morphProgress, 1.15));
    
    const clampedMorph = Math.min(morphProgress, 1);
    
    return {
      offsetX: this.lerp(idleTarget.offsetX, emoteTarget.offsetX, clampedMorph),
      offsetY: this.lerp(idleTarget.offsetY, emoteTarget.offsetY, clampedMorph),
      scale: this.lerp(idleTarget.scale, emoteTarget.scale, clampedMorph) * 
             (morphProgress > 1 ? morphProgress : 1),
      rotation: this.lerp(idleTarget.rotation, emoteTarget.rotation, clampedMorph),
      glowIntensity: this.lerp(idleTarget.glowIntensity, emoteTarget.glowIntensity, clampedMorph) *
                     (morphProgress > 1 ? morphProgress : 1),
      wobbleSpeed: this.lerp(idleTarget.wobbleSpeed, emoteTarget.wobbleSpeed, clampedMorph),
      wobbleAmount: this.lerp(idleTarget.wobbleAmount, emoteTarget.wobbleAmount, clampedMorph)
    };
  }
  
  getCurrentEmote(): EmoteName {
    return this.state.emote;
  }
  
  getCurrentPhase(): EmotePhase {
    return this.state.phase;
  }
  
  isAnimating(): boolean {
    return this.state.isActive;
  }
  
  getProgress(): { phase: number; overall: number } {
    return {
      phase: this.state.progress,
      overall: this.state.overallProgress
    };
  }
  
  reset(): void {
    this.forceIdle();
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }
  
  private easeInCubic(t: number): number {
    return t * t * t;
  }
}

export const emoteMorphingEngine = new EmoteMorphingEngine();
