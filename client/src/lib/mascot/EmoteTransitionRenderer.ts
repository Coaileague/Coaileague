/**
 * EmoteTransitionRenderer - Advanced Canvas Graphics Engine
 * 
 * Creates polished, fluent visual transitions between emotes using:
 * - Morphing wave effects
 * - Particle trail systems
 * - Glow pulse animations
 * - Energy field transitions
 * - Color blend overlays
 * - Spiral emanation effects
 */

export interface TransitionParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'trail' | 'burst' | 'morph' | 'ring' | 'glow';
  rotation: number;
  rotationSpeed: number;
}

export interface EnergyWave {
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
  thickness: number;
  speed: number;
}

export interface MorphField {
  progress: number;
  fromColor: string;
  toColor: string;
  intensity: number;
  waveOffset: number;
}

export interface TransitionState {
  active: boolean;
  progress: number;
  phase: 'enter' | 'peak' | 'exit' | 'idle';
  fromEmote: string;
  toEmote: string;
  startTime: number;
}

const EMOTE_COLORS: Record<string, string> = {
  neutral: '#38bdf8',
  happy: '#fbbf24',
  excited: '#a855f7',
  thinking: '#6366f1',
  curious: '#14b8a6',
  surprised: '#f97316',
  celebrating: '#f472b6',
  sleepy: '#64748b',
  focused: '#3b82f6',
  concerned: '#f59e0b',
  proud: '#8b5cf6',
  waving: '#22c55e',
  nodding: '#06b6d4',
  alert: '#ef4444',
  love: '#ec4899'
};

export class EmoteTransitionRenderer {
  private particles: TransitionParticle[] = [];
  private waves: EnergyWave[] = [];
  private morphField: MorphField | null = null;
  private transitionState: TransitionState = {
    active: false,
    progress: 0,
    phase: 'idle',
    fromEmote: 'neutral',
    toEmote: 'neutral',
    startTime: 0
  };
  
  private glowPulse: number = 0;
  private spiralAngle: number = 0;
  private trailHistory: { x: number; y: number; time: number }[] = [];
  
  /**
   * Start a new emote transition with visual effects
   */
  startTransition(fromEmote: string, toEmote: string): void {
    this.transitionState = {
      active: true,
      progress: 0,
      phase: 'enter',
      fromEmote,
      toEmote,
      startTime: performance.now()
    };
    
    this.morphField = {
      progress: 0,
      fromColor: EMOTE_COLORS[fromEmote] || '#38bdf8',
      toColor: EMOTE_COLORS[toEmote] || '#38bdf8',
      intensity: 0,
      waveOffset: 0
    };
    
    // Spawn initial transition particles
    this.spawnTransitionBurst(toEmote);
  }
  
  /**
   * Spawn burst of particles for transition
   */
  private spawnTransitionBurst(emote: string): void {
    const color = EMOTE_COLORS[emote] || '#38bdf8';
    const count = 24;
    
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i;
      const speed = 1.5 + Math.random() * 2;
      const size = 2 + Math.random() * 4;
      
      this.particles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size,
        color,
        type: 'burst',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2
      });
    }
    
    // Add energy wave
    this.waves.push({
      radius: 0,
      maxRadius: 80,
      opacity: 0.8,
      color,
      thickness: 3,
      speed: 2.5
    });
    
    // Add morph ring particles
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 / 12) * i;
      this.particles.push({
        x: Math.cos(angle) * 20,
        y: Math.sin(angle) * 20,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5,
        life: 1,
        maxLife: 1,
        size: 3,
        color,
        type: 'ring',
        rotation: angle,
        rotationSpeed: 0.05
      });
    }
  }
  
  /**
   * Add trail particle following star movement
   */
  addTrailPoint(x: number, y: number, starIndex: number): void {
    const colors = ['#38bdf8', '#a855f7', '#f4c15d'];
    const color = colors[starIndex] || colors[0];
    
    if (Math.random() < 0.3) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: 1,
        maxLife: 1,
        size: 2 + Math.random() * 2,
        color,
        type: 'trail',
        rotation: 0,
        rotationSpeed: 0
      });
    }
    
    this.trailHistory.push({ x, y, time: performance.now() });
    
    // Keep only recent trail points
    const now = performance.now();
    this.trailHistory = this.trailHistory.filter(p => now - p.time < 500);
  }
  
  /**
   * Spawn glow particles around a point
   */
  spawnGlowParticles(x: number, y: number, color: string, count: number = 8): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const dist = 5 + Math.random() * 15;
      
      this.particles.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: Math.cos(angle) * 0.3,
        vy: Math.sin(angle) * 0.3 - 0.5,
        life: 1,
        maxLife: 1,
        size: 1.5 + Math.random() * 2,
        color,
        type: 'glow',
        rotation: 0,
        rotationSpeed: 0
      });
    }
  }
  
  /**
   * Update all transition effects
   */
  update(deltaMs: number): void {
    const dt = deltaMs / 16.67; // Normalize to 60fps
    
    // Update transition state
    if (this.transitionState.active) {
      const elapsed = performance.now() - this.transitionState.startTime;
      const duration = 800; // ms for full transition
      this.transitionState.progress = Math.min(elapsed / duration, 1);
      
      if (this.transitionState.progress < 0.3) {
        this.transitionState.phase = 'enter';
      } else if (this.transitionState.progress < 0.7) {
        this.transitionState.phase = 'peak';
      } else if (this.transitionState.progress < 1) {
        this.transitionState.phase = 'exit';
      } else {
        this.transitionState.active = false;
        this.transitionState.phase = 'idle';
      }
      
      // Update morph field
      if (this.morphField) {
        this.morphField.progress = this.transitionState.progress;
        this.morphField.intensity = Math.sin(this.transitionState.progress * Math.PI);
        this.morphField.waveOffset += 0.1 * dt;
      }
    }
    
    // Update glow pulse
    this.glowPulse += 0.05 * dt;
    this.spiralAngle += 0.02 * dt;
    
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      
      // Apply physics based on type
      switch (p.type) {
        case 'burst':
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life -= 0.025 * dt;
          break;
        case 'trail':
          p.vy -= 0.02 * dt; // Float up
          p.life -= 0.04 * dt;
          break;
        case 'morph':
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.life -= 0.02 * dt;
          break;
        case 'ring':
          // Orbit around center
          const ringDist = Math.sqrt(p.x * p.x + p.y * p.y);
          const ringAngle = Math.atan2(p.y, p.x) + 0.05 * dt;
          p.x = Math.cos(ringAngle) * ringDist * 1.02;
          p.y = Math.sin(ringAngle) * ringDist * 1.02;
          p.life -= 0.02 * dt;
          break;
        case 'glow':
          p.vy -= 0.01 * dt;
          p.life -= 0.03 * dt;
          break;
        case 'spark':
          p.vy += 0.02 * dt; // Gravity
          p.life -= 0.03 * dt;
          break;
      }
      
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    
    // Update waves
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.radius += w.speed * dt;
      w.opacity = Math.max(0, 1 - (w.radius / w.maxRadius));
      w.thickness = Math.max(0.5, w.thickness * 0.98);
      
      if (w.opacity <= 0) {
        this.waves.splice(i, 1);
      }
    }
  }
  
  /**
   * Render all transition effects to canvas
   */
  render(ctx: CanvasRenderingContext2D, centerX: number, centerY: number): void {
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Draw morph field (background effect)
    this.renderMorphField(ctx);
    
    // Draw energy waves
    this.renderWaves(ctx);
    
    // Draw trail history
    this.renderTrailHistory(ctx);
    
    // Draw particles
    this.renderParticles(ctx);
    
    // Draw glow overlay during transition
    if (this.transitionState.active && this.morphField) {
      this.renderGlowOverlay(ctx);
    }
    
    ctx.restore();
  }
  
  private renderMorphField(ctx: CanvasRenderingContext2D): void {
    if (!this.morphField || this.morphField.intensity < 0.01) return;
    
    const { fromColor, toColor, intensity, waveOffset } = this.morphField;
    
    // Create radial waves
    for (let r = 0; r < 3; r++) {
      const radius = 30 + r * 15 + Math.sin(waveOffset + r) * 5;
      const alpha = intensity * 0.15 * (1 - r * 0.3);
      
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, this.colorWithAlpha(fromColor, alpha * 0.5));
      gradient.addColorStop(0.5, this.colorWithAlpha(toColor, alpha));
      gradient.addColorStop(1, this.colorWithAlpha(toColor, 0));
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  private renderWaves(ctx: CanvasRenderingContext2D): void {
    for (const wave of this.waves) {
      ctx.beginPath();
      ctx.arc(0, 0, wave.radius, 0, Math.PI * 2);
      ctx.strokeStyle = this.colorWithAlpha(wave.color, wave.opacity);
      ctx.lineWidth = wave.thickness;
      ctx.stroke();
      
      // Inner glow
      const gradient = ctx.createRadialGradient(0, 0, wave.radius - 2, 0, 0, wave.radius + 2);
      gradient.addColorStop(0, this.colorWithAlpha(wave.color, 0));
      gradient.addColorStop(0.5, this.colorWithAlpha(wave.color, wave.opacity * 0.3));
      gradient.addColorStop(1, this.colorWithAlpha(wave.color, 0));
      
      ctx.beginPath();
      ctx.arc(0, 0, wave.radius, 0, Math.PI * 2);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
  }
  
  private renderTrailHistory(ctx: CanvasRenderingContext2D): void {
    if (this.trailHistory.length < 2) return;
    
    const now = performance.now();
    
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    
    for (let i = 1; i < this.trailHistory.length; i++) {
      const prev = this.trailHistory[i - 1];
      const curr = this.trailHistory[i];
      const age = now - curr.time;
      const alpha = Math.max(0, 1 - age / 500) * 0.3;
      
      if (alpha > 0.01) {
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2 * alpha;
        ctx.stroke();
      }
    }
    
    ctx.restore();
  }
  
  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      
      switch (p.type) {
        case 'burst':
          // Star burst particle
          ctx.fillStyle = this.colorWithAlpha(p.color, alpha);
          ctx.shadowBlur = p.size * 2;
          ctx.shadowColor = p.color;
          this.drawStarShape(ctx, 0, 0, p.size, p.size * 0.4, 4);
          break;
          
        case 'trail':
          // Soft trail dot
          const trailGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
          trailGradient.addColorStop(0, this.colorWithAlpha(p.color, alpha));
          trailGradient.addColorStop(1, this.colorWithAlpha(p.color, 0));
          ctx.fillStyle = trailGradient;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
          
        case 'morph':
          // Morphing diamond
          ctx.fillStyle = this.colorWithAlpha(p.color, alpha * 0.8);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.6, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.6, 0);
          ctx.closePath();
          ctx.fill();
          break;
          
        case 'ring':
          // Ring particle
          ctx.strokeStyle = this.colorWithAlpha(p.color, alpha);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.stroke();
          break;
          
        case 'glow':
          // Soft glow orb
          const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
          glowGradient.addColorStop(0, this.colorWithAlpha(p.color, alpha * 0.8));
          glowGradient.addColorStop(0.5, this.colorWithAlpha(p.color, alpha * 0.3));
          glowGradient.addColorStop(1, this.colorWithAlpha(p.color, 0));
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
          ctx.fill();
          break;
          
        case 'spark':
          // Bright spark
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 4;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      
      ctx.restore();
    }
  }
  
  private renderGlowOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.morphField) return;
    
    const { toColor, intensity } = this.morphField;
    const pulseScale = 1 + Math.sin(this.glowPulse) * 0.1;
    const radius = 50 * pulseScale;
    
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, this.colorWithAlpha(toColor, intensity * 0.2));
    gradient.addColorStop(0.6, this.colorWithAlpha(toColor, intensity * 0.08));
    gradient.addColorStop(1, this.colorWithAlpha(toColor, 0));
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  private drawStarShape(ctx: CanvasRenderingContext2D, x: number, y: number, outerR: number, innerR: number, points: number): void {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
  
  private colorWithAlpha(hex: string, alpha: number): string {
    // Convert hex to rgba
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
  }
  
  /**
   * Spawn special effect for sling/throw action
   */
  spawnSlingEffect(x: number, y: number, vx: number, vy: number): void {
    const speed = Math.sqrt(vx * vx + vy * vy);
    const angle = Math.atan2(vy, vx);
    const color = '#fbbf24';
    
    // Motion blur trail
    for (let i = 0; i < 15; i++) {
      const trailAngle = angle + Math.PI + (Math.random() - 0.5) * 0.5;
      const trailSpeed = speed * 0.5 * (1 - i / 15);
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(trailAngle) * trailSpeed,
        vy: Math.sin(trailAngle) * trailSpeed,
        life: 1,
        maxLife: 1,
        size: 3 - i * 0.15,
        color,
        type: 'spark',
        rotation: 0,
        rotationSpeed: 0
      });
    }
    
    // Impact wave
    this.waves.push({
      radius: 0,
      maxRadius: 60,
      opacity: 1,
      color,
      thickness: 4,
      speed: 4
    });
  }
  
  /**
   * Spawn catch miss effect (when user misses the 10% catch)
   */
  spawnMissEffect(x: number, y: number): void {
    const color = '#ef4444';
    
    // X mark particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI / 4) + (Math.floor(i / 2) * Math.PI / 2);
      const speed = 2 + (i % 2) * 1.5;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size: 3,
        color,
        type: 'spark',
        rotation: 0,
        rotationSpeed: 0.1
      });
    }
    
    // Quick fade wave
    this.waves.push({
      radius: 0,
      maxRadius: 30,
      opacity: 0.5,
      color,
      thickness: 2,
      speed: 3
    });
  }
  
  /**
   * Spawn catch success effect (when user catches with 10% chance)
   */
  spawnCatchEffect(x: number, y: number): void {
    const colors = ['#22c55e', '#10b981', '#34d399'];
    
    // Success burst
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i;
      const speed = 2 + Math.random() * 2;
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        size: 4 + Math.random() * 2,
        color,
        type: 'burst',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3
      });
    }
    
    // Victory wave
    this.waves.push({
      radius: 0,
      maxRadius: 80,
      opacity: 1,
      color: '#22c55e',
      thickness: 4,
      speed: 2
    });
    
    // Ring of stars
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i;
      this.particles.push({
        x: x + Math.cos(angle) * 25,
        y: y + Math.sin(angle) * 25,
        vx: Math.cos(angle) * 0.3,
        vy: Math.sin(angle) * 0.3,
        life: 1,
        maxLife: 1,
        size: 5,
        color: '#fbbf24',
        type: 'ring',
        rotation: angle,
        rotationSpeed: 0.02
      });
    }
  }
  
  /**
   * Check if currently transitioning
   */
  isTransitioning(): boolean {
    return this.transitionState.active;
  }
  
  /**
   * Get transition progress (0-1)
   */
  getProgress(): number {
    return this.transitionState.progress;
  }
  
  /**
   * Clear all effects
   */
  clear(): void {
    this.particles = [];
    this.waves = [];
    this.morphField = null;
    this.transitionState = {
      active: false,
      progress: 0,
      phase: 'idle',
      fromEmote: 'neutral',
      toEmote: 'neutral',
      startTime: 0
    };
    this.trailHistory = [];
  }
}

export const emoteTransitionRenderer = new EmoteTransitionRenderer();
