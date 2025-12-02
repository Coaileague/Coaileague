/**
 * Status Emote Effects for Trinity Mascot
 * 
 * Dynamic visual effects based on user activity, system activity, and wait states.
 * Implements mutation effects for the 3 Trinity stars with:
 * - Shockwaves on status change
 * - Particle explosions for SUCCESS
 * - Screen shake for ERROR
 * - Mode-specific star behaviors (searching radar, thinking orbit, etc.)
 * - Trail effects and connection lines
 * - Data stream particles for UPLOADING
 * - Audio wave visualization for LISTENING
 */

import type { MascotMode } from '@/config/mascotConfig';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface StatusParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'spark' | 'data' | 'ping' | 'confetti' | 'error';
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
  lineWidth: number;
}

export interface StatusEffectsState {
  particles: StatusParticle[];
  shockwaves: Shockwave[];
  shake: number;
  shakeDecay: number;
  trailOpacity: number;
  connectionLineOpacity: number;
  glowIntensity: number;
  pulsePhase: number;
}

export interface StarBehavior {
  targetX: number;
  targetY: number;
  rotation: number;
  scale: number;
  glowMultiplier: number;
}

// ============================================================================
// STATUS COLORS
// ============================================================================

export const STATUS_COLORS: Record<MascotMode, string> = {
  IDLE: '#38bdf8',      // Sky Blue - Calm, ready
  SEARCHING: '#10b981', // Emerald - Scanning, exploring
  THINKING: '#a855f7',  // Purple - Processing, contemplating
  ANALYZING: '#6366f1', // Indigo - Deep analysis
  CODING: '#34d399',    // Green - Matrix, development
  LISTENING: '#fbbf24', // Amber - Audio, attention
  UPLOADING: '#06b6d4', // Cyan - Data streaming
  SUCCESS: '#f472b6',   // Pink - Celebration
  ERROR: '#ef4444',     // Red - Alert, problem
  CELEBRATING: '#fbbf24', // Gold - Achievement
  ADVISING: '#10b981',  // Emerald - Business advice
  HOLIDAY: '#f472b6',   // Pink - Festive
};

// ============================================================================
// STATUS EMOTE EFFECTS CLASS
// ============================================================================

export class StatusEmoteEffects {
  private state: StatusEffectsState;
  private time: number = 0;
  private lastMode: MascotMode = 'IDLE';
  
  constructor() {
    this.state = {
      particles: [],
      shockwaves: [],
      shake: 0,
      shakeDecay: 0.9,
      trailOpacity: 0.5,
      connectionLineOpacity: 0.3,
      glowIntensity: 1.0,
      pulsePhase: 0,
    };
  }
  
  // Get current shake offset for screen shake effect
  getShakeOffset(): { x: number; y: number } {
    if (this.state.shake < 0.5) return { x: 0, y: 0 };
    return {
      x: (Math.random() - 0.5) * this.state.shake,
      y: (Math.random() - 0.5) * this.state.shake,
    };
  }
  
  // Trigger mode change effects
  onModeChange(newMode: MascotMode, centerX: number, centerY: number): void {
    const color = STATUS_COLORS[newMode] || STATUS_COLORS.IDLE;
    
    // Spawn shockwave on any mode change
    this.spawnShockwave(centerX, centerY, color);
    
    // Mode-specific effects
    switch (newMode) {
      case 'SUCCESS':
      case 'CELEBRATING':
        this.spawnExplosion(centerX, centerY, 25, color);
        this.state.glowIntensity = 1.5;
        break;
      case 'ERROR':
        this.state.shake = 25;
        this.spawnErrorParticles(centerX, centerY, 15);
        break;
      case 'UPLOADING':
      case 'CODING':
        // Clear old particles for clean stream effect
        this.state.particles = this.state.particles.filter(p => p.type !== 'data');
        break;
      case 'SEARCHING':
        // Start with ping particles
        this.spawnPingParticle(centerX, centerY, color);
        break;
    }
    
    this.lastMode = newMode;
  }
  
  // Update effects each frame
  update(mode: MascotMode, centerX: number, centerY: number, deltaTime: number = 1): void {
    this.time += deltaTime;
    
    // Update shake
    if (this.state.shake > 0) {
      this.state.shake *= this.state.shakeDecay;
      if (this.state.shake < 0.5) this.state.shake = 0;
    }
    
    // Update glow intensity back to normal
    if (this.state.glowIntensity > 1.0) {
      this.state.glowIntensity -= 0.02;
      if (this.state.glowIntensity < 1.0) this.state.glowIntensity = 1.0;
    }
    
    // Update pulse phase
    this.state.pulsePhase += 0.05;
    
    // Update particles
    this.updateParticles();
    
    // Update shockwaves
    this.updateShockwaves();
    
    // Mode-specific continuous effects
    this.updateModeEffects(mode, centerX, centerY);
  }
  
  // Get star behavior for each mode
  getStarBehaviors(
    mode: MascotMode, 
    starIndex: number, 
    centerX: number, 
    centerY: number,
    baseRadius: number
  ): StarBehavior {
    const t = this.time;
    const behavior: StarBehavior = {
      targetX: 0,
      targetY: 0,
      rotation: 0,
      scale: 1.0,
      glowMultiplier: this.state.glowIntensity,
    };
    
    // 120° offset for trinity formation
    const trinityOffset = (Math.PI * 2 / 3) * starIndex;
    
    switch (mode) {
      case 'IDLE':
        // Gentle floating orbit - each star at different phase
        const idleAngle = t * 0.02 + trinityOffset;
        behavior.targetX = Math.cos(idleAngle) * baseRadius;
        behavior.targetY = Math.sin(idleAngle * 2) * (baseRadius * 0.4);
        behavior.rotation = t * 0.01;
        break;
        
      case 'SEARCHING':
        // Radar scan - one stationary, others orbit wide
        if (starIndex === 0) {
          behavior.targetX = 0;
          behavior.targetY = 0;
          behavior.scale = 1.2; // Larger center star
        } else {
          const searchAngle = t * 0.05 + trinityOffset;
          const searchRadius = baseRadius * 1.5;
          behavior.targetX = Math.cos(searchAngle) * searchRadius;
          behavior.targetY = Math.sin(searchAngle) * searchRadius;
        }
        break;
        
      case 'THINKING':
        // Fast circular orbit - all stars chase each other
        const thinkAngle = t * 0.15 + trinityOffset;
        const thinkRadius = baseRadius * 0.8;
        behavior.targetX = Math.cos(thinkAngle) * thinkRadius;
        behavior.targetY = Math.sin(thinkAngle) * thinkRadius;
        behavior.rotation = t * 0.1;
        behavior.glowMultiplier = 1.0 + Math.sin(t * 0.3) * 0.3;
        break;
        
      case 'ANALYZING':
        // Constellation formation with jitter
        const analyzeAngle = trinityOffset - Math.PI / 6;
        const analyzeDist = baseRadius * 0.9;
        behavior.targetX = Math.cos(analyzeAngle) * analyzeDist + Math.sin(t * 0.1 + starIndex) * 3;
        behavior.targetY = Math.sin(analyzeAngle) * analyzeDist;
        behavior.glowMultiplier = 1.2;
        break;
        
      case 'CODING':
        // Matrix-style stepped movement
        const step = baseRadius * 0.5;
        const codeSpeed = t * 0.05 + starIndex * 3;
        behavior.targetX = Math.round(Math.cos(codeSpeed) * 2) * step;
        behavior.targetY = Math.round(Math.sin(codeSpeed) * 2) * step;
        behavior.rotation = Math.round(t * 0.02) * (Math.PI / 4);
        break;
        
      case 'UPLOADING':
        // Spiral upward with bob
        const uploadAngle = t * 0.2 + trinityOffset;
        const uploadRadius = baseRadius * 0.6;
        behavior.targetX = Math.cos(uploadAngle) * uploadRadius;
        behavior.targetY = Math.sin(t * 0.1) * baseRadius * 0.5;
        behavior.scale = 0.9 + Math.sin(t * 0.2 + starIndex) * 0.1;
        break;
        
      case 'LISTENING':
        // Audio wave - horizontal spread with vertical pulse
        const audioWave = Math.sin(t * 0.2 + starIndex) * Math.sin(t * 0.5);
        const spreadX = (starIndex - 1) * baseRadius * 0.6;
        behavior.targetX = spreadX;
        behavior.targetY = audioWave * baseRadius * 0.6;
        behavior.scale = 1.0 + audioWave * 0.15;
        break;
        
      case 'SUCCESS':
      case 'CELEBRATING':
        // Centered celebration - stars pulse outward
        const celebratePulse = Math.sin(t * 0.3) * 0.3;
        const celebrateAngle = t * 0.05 + trinityOffset;
        behavior.targetX = Math.cos(celebrateAngle) * baseRadius * (0.5 + celebratePulse);
        behavior.targetY = Math.sin(celebrateAngle) * baseRadius * (0.5 + celebratePulse);
        behavior.scale = 1.1 + celebratePulse * 0.2;
        behavior.glowMultiplier = 1.5;
        break;
        
      case 'ERROR':
        // Erratic shake - random jitter
        behavior.targetX = (Math.random() - 0.5) * baseRadius * 0.6;
        behavior.targetY = (Math.random() - 0.5) * baseRadius * 0.6;
        behavior.rotation = (Math.random() - 0.5) * 0.3;
        behavior.glowMultiplier = 1.0 + Math.random() * 0.5;
        break;
        
      case 'ADVISING':
        // Professional orbit - smooth, wider
        const adviseAngle = t * 0.025 + trinityOffset;
        behavior.targetX = Math.cos(adviseAngle) * baseRadius * 0.9;
        behavior.targetY = Math.sin(adviseAngle) * baseRadius * 0.7;
        behavior.glowMultiplier = 1.1;
        break;
        
      case 'HOLIDAY':
        // Festive bounce - playful movement
        const bouncePhase = t * 0.08 + trinityOffset;
        const bounceAmp = baseRadius * 0.7;
        behavior.targetX = Math.cos(bouncePhase) * bounceAmp;
        behavior.targetY = Math.sin(bouncePhase * 1.5) * bounceAmp * 0.6 + Math.abs(Math.sin(t * 0.15)) * 10;
        behavior.rotation = Math.sin(t * 0.1) * 0.2;
        break;
        
      default:
        // Fallback to idle
        behavior.targetX = Math.cos(t * 0.02 + trinityOffset) * baseRadius;
        behavior.targetY = Math.sin(t * 0.03 + trinityOffset) * baseRadius * 0.5;
    }
    
    return behavior;
  }
  
  // Draw all effects to canvas
  drawEffects(
    ctx: CanvasRenderingContext2D, 
    centerX: number, 
    centerY: number,
    mode: MascotMode
  ): void {
    ctx.save();
    
    // Apply shake offset
    const shake = this.getShakeOffset();
    ctx.translate(shake.x, shake.y);
    
    // Draw shockwaves first (behind everything)
    this.drawShockwaves(ctx, centerX, centerY);
    
    // Draw particles
    this.drawParticles(ctx, centerX, centerY);
    
    ctx.restore();
  }
  
  // Check if connection lines should be drawn
  shouldDrawConnections(mode: MascotMode): boolean {
    return mode !== 'ERROR' && mode !== 'SEARCHING' && mode !== 'UPLOADING';
  }
  
  // Get connection line style
  getConnectionStyle(mode: MascotMode): { color: string; opacity: number; width: number } {
    const baseColor = STATUS_COLORS[mode] || '#ffffff';
    let opacity = 0.2;
    let width = 1;
    
    if (mode === 'ANALYZING') {
      opacity = 0.4;
      width = 1.5;
    } else if (mode === 'THINKING') {
      opacity = 0.3;
    }
    
    return { color: baseColor, opacity, width };
  }
  
  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================
  
  private spawnShockwave(x: number, y: number, color: string): void {
    this.state.shockwaves.push({
      x,
      y,
      radius: 0,
      maxRadius: 150,
      opacity: 0.8,
      color,
      lineWidth: 3,
    });
  }
  
  private spawnExplosion(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 2 + Math.random() * 4;
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1.0,
        maxLife: 1.0,
        color,
        size: 2 + Math.random() * 3,
        type: 'spark',
      });
    }
  }
  
  private spawnErrorParticles(x: number, y: number, count: number): void {
    const color = STATUS_COLORS.ERROR;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 1 + Math.random() * 2;
      this.state.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 1.0,
        maxLife: 1.0,
        color,
        size: 2 + Math.random() * 2,
        type: 'error',
      });
    }
  }
  
  private spawnPingParticle(x: number, y: number, color: string): void {
    this.state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 1.0,
      maxLife: 1.0,
      color,
      size: 4,
      type: 'ping',
    });
  }
  
  private spawnDataParticle(x: number, y: number, color: string): void {
    this.state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 1 + Math.random() * 1.5, // Fall downward
      life: 1.0,
      maxLife: 1.0,
      color,
      size: 2,
      type: 'data',
    });
  }
  
  private updateParticles(): void {
    for (let i = this.state.particles.length - 1; i >= 0; i--) {
      const p = this.state.particles[i];
      
      // Update position
      p.x += p.vx;
      p.y += p.vy;
      
      // Decay life
      p.life -= 0.025;
      
      // Apply gravity for certain types
      if (p.type === 'spark' || p.type === 'confetti') {
        p.vy += 0.05;
      }
      
      // Remove dead particles
      if (p.life <= 0) {
        this.state.particles.splice(i, 1);
      }
    }
    
    // Limit particle count
    if (this.state.particles.length > 100) {
      this.state.particles = this.state.particles.slice(-100);
    }
  }
  
  private updateShockwaves(): void {
    for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.state.shockwaves[i];
      
      sw.radius += 6;
      sw.opacity -= 0.025;
      sw.lineWidth *= 0.98;
      
      if (sw.opacity <= 0 || sw.radius > sw.maxRadius) {
        this.state.shockwaves.splice(i, 1);
      }
    }
  }
  
  private updateModeEffects(mode: MascotMode, centerX: number, centerY: number): void {
    const color = STATUS_COLORS[mode] || STATUS_COLORS.IDLE;
    
    // Mode-specific particle spawning
    switch (mode) {
      case 'SEARCHING':
        // Spawn ping particles occasionally
        if (Math.floor(this.time) % 40 === 0) {
          const angle = this.time * 0.05;
          const radius = 50;
          this.spawnPingParticle(
            centerX + Math.cos(angle) * radius,
            centerY + Math.sin(angle) * radius,
            color
          );
        }
        break;
        
      case 'UPLOADING':
        // Spawn data stream particles
        if (Math.floor(this.time) % 5 === 0) {
          this.spawnDataParticle(
            centerX + (Math.random() - 0.5) * 30,
            centerY - 20,
            color
          );
        }
        break;
        
      case 'CODING':
        // Spawn matrix-style particles
        if (Math.floor(this.time) % 8 === 0) {
          this.spawnDataParticle(
            centerX + (Math.random() - 0.5) * 40,
            centerY - 30,
            color
          );
        }
        break;
    }
  }
  
  private drawShockwaves(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    for (const sw of this.state.shockwaves) {
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.opacity;
      ctx.lineWidth = sw.lineWidth;
      ctx.beginPath();
      ctx.arc(centerX + sw.x, centerY + sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  
  private drawParticles(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    for (const p of this.state.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      
      // Different shapes for different particle types
      if (p.type === 'ping') {
        // Ping is a ring that expands
        const pingRadius = (1 - p.life) * 20 + 2;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 * p.life;
        ctx.beginPath();
        ctx.arc(centerX + p.x, centerY + p.y, pingRadius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.type === 'data') {
        // Data particles are small squares
        const size = p.size * p.life;
        ctx.fillRect(
          centerX + p.x - size / 2, 
          centerY + p.y - size / 2, 
          size, 
          size
        );
      } else {
        // Default circle particles
        ctx.beginPath();
        ctx.arc(centerX + p.x, centerY + p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }
  }
  
  // Utility: Get state for external access
  getState(): StatusEffectsState {
    return this.state;
  }
  
  // Reset effects
  reset(): void {
    this.state.particles = [];
    this.state.shockwaves = [];
    this.state.shake = 0;
    this.state.glowIntensity = 1.0;
    this.time = 0;
  }
}

// Export singleton instance
export const statusEmoteEffects = new StatusEmoteEffects();
