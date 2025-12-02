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

import { useEffect, useRef, useCallback, memo } from 'react';

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
  | 'HOLIDAY';

interface Twin {
  id: number;
  x: number;
  y: number;
  trail: { x: number; y: number; life: number }[];
  color: string;
  angle: number;
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
  HOLIDAY: '#f472b6'      // Pink
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
  HOLIDAY: 'Holiday'
};

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
    shake: 0
  };

  private emoteState: EmoteState = {
    type: 'neutral',
    purpleBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
    cyanBehavior: { scale: 1, wobble: 0.5, glow: 0.4, speed: 1 },
    goldBehavior: { scale: 1, wobble: 0.5, glow: 0.5, speed: 1 },
  };

  private emoteParticles: { x: number; y: number; vx: number; vy: number; life: number; type: string; char?: string }[] = [];

  // Trinity Stars: Co (cyan), AI (purple), L (gold) - 120° offset for triangular formation - spells "CoAIL"
  private twins: Twin[] = [
    { id: 0, x: 0, y: 0, trail: [], color: '#38bdf8', angle: 0 },                    // Cyan - "Co"
    { id: 1, x: 0, y: 0, trail: [], color: '#a855f7', angle: (Math.PI * 2) / 3 },    // Purple - "AI"  
    { id: 2, x: 0, y: 0, trail: [], color: '#f4c15d', angle: (Math.PI * 4) / 3 }     // Gold - "L"
  ];

  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private isRunning = false;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    
    this.resize();
    this.setupTouch();
  }

  private setupTouch() {
    const handleTouch = (e: TouchEvent | MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const touch = 'touches' in e ? e.touches[0] : e;
      if (touch) {
        this.state.touchX = (touch.clientX - rect.left) * (this.canvas.width / rect.width);
        this.state.touchY = (touch.clientY - rect.top) * (this.canvas.height / rect.height);
        this.state.isTouching = true;
      }
    };
    
    const endTouch = () => {
      this.state.isTouching = false;
    };

    this.canvas.addEventListener('touchstart', handleTouch as EventListener, { passive: true });
    this.canvas.addEventListener('touchmove', handleTouch as EventListener, { passive: true });
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('mousedown', handleTouch as EventListener);
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      if (e.buttons === 1) handleTouch(e);
    });
    this.canvas.addEventListener('mouseup', endTouch);
    this.canvas.addEventListener('mouseleave', endTouch);
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

  setMode(mode: MascotMode) {
    this.state.mode = mode;
    const color = MODE_COLORS[mode];
    
    this.spawnShockwave(color);
    
    if (mode === 'SUCCESS') this.spawnExplosion(30);
    if (mode === 'ERROR') this.state.shake = 20;
    if (mode === 'CODING' || mode === 'UPLOADING') this.particles = [];
    
    // Trinity colors: Cyan (Co), Purple (AI), Gold (L) - spells "CoAIL"
    if (mode === 'IDLE') {
      this.twins[0].color = '#38bdf8';  // Cyan
      this.twins[1].color = '#a855f7';  // Purple
      this.twins[2].color = '#f4c15d';  // Gold
    } else if (mode === 'ERROR') {
      this.twins[0].color = '#ef4444';
      this.twins[1].color = '#ef4444';
      this.twins[2].color = '#ef4444';
    } else if (mode === 'CELEBRATING' || mode === 'SUCCESS') {
      this.twins[0].color = '#38bdf8';
      this.twins[1].color = '#a855f7';
      this.twins[2].color = '#fbbf24';  // Brighter gold for celebration
    } else {
      this.twins[0].color = color;
      this.twins[1].color = '#fff';
      this.twins[2].color = '#f4c15d';
    }
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

  private update() {
    this.state.time += 1;
    const s = this.state.scale;
    const cx = this.state.w / 2;
    const cy = this.state.h / 2;
    
    // TRINITY: 120° offset for 3 stars (Co, AI, L) - each star gets unique position
    const TRINITY_OFFSET = (2 * Math.PI) / 3;  // 120 degrees

    if (this.state.shake > 0) {
      this.state.shake *= 0.9;
      if (this.state.shake < 0.5) this.state.shake = 0;
    }

    this.twins.forEach((t, i) => {
      let tx = 0, ty = 0;
      const starAngle = i * TRINITY_OFFSET;  // 0°, 120°, 240° for each star

      if (this.state.isTouching && this.state.touchX !== null && this.state.touchY !== null) {
        const mx = (this.state.touchX / window.devicePixelRatio) - cx;
        const my = (this.state.touchY / window.devicePixelRatio) - cy;
        tx = mx * 0.4 + Math.cos(this.state.time * 0.1 + starAngle) * (22 * s * 0.003);
        ty = my * 0.4 + Math.sin(this.state.time * 0.1 + starAngle) * (22 * s * 0.003);
      } else if (this.state.mode === 'IDLE') {
        const tOffset = this.state.time * 0.02 + starAngle;
        tx = Math.cos(tOffset) * (32 * s * 0.003);
        ty = Math.sin(tOffset * 2) * (22 * s * 0.003);
      } else if (this.state.mode === 'SEARCHING') {
        // All 3 stars orbit at different phases
        const angle = this.state.time * 0.05 + starAngle;
        const rad = (20 + i * 10) * s * 0.003;  // Different radius per star
        tx = Math.cos(angle) * rad;
        ty = Math.sin(angle) * rad;
        if (this.state.time % 40 === 0) this.spawnParticle(tx, ty, t.color);
      } else if (this.state.mode === 'ANALYZING') {
        const angle = starAngle - Math.PI / 6;  // Offset from base position
        const dist = 30 * s * 0.003;
        tx = Math.cos(angle) * dist;
        ty = Math.sin(angle) * dist;
        tx += Math.sin(this.state.time * 0.1 + i) * 5;
      } else if (this.state.mode === 'THINKING') {
        t.angle += 0.15;
        const radius = 35 * s * 0.003;
        tx = Math.cos(t.angle + starAngle) * radius;
        ty = Math.sin(t.angle + starAngle) * radius;
      } else if (this.state.mode === 'CODING') {
        const step = 26 * s * 0.003;
        const speed = this.state.time * 0.05 + starAngle;
        tx = Math.round(Math.cos(speed) * 3) * step;
        ty = Math.round(Math.sin(speed) * 3) * step;
      } else if (this.state.mode === 'UPLOADING') {
        const angle = this.state.time * 0.2 + starAngle;
        const radius = 30 * s * 0.003;
        tx = Math.cos(angle) * radius;
        ty = (Math.sin(this.state.time * 0.05 + starAngle) * 30) * s * 0.003;
        if (this.state.time % 5 === 0) {
          this.spawnParticle(tx, ty, t.color, 0, 2);
        }
      } else if (this.state.mode === 'LISTENING') {
        const audio = Math.sin(this.state.time * 0.2 + starAngle) * Math.sin(this.state.time * 0.5);
        // Position at 120° intervals around center
        tx = Math.cos(starAngle) * 25 * s * 0.003;
        ty = audio * 30 * s * 0.003 + Math.sin(starAngle) * 15 * s * 0.003;
      } else if (this.state.mode === 'SUCCESS') {
        // Celebration: stars spiral outward at 120° intervals
        const celebRadius = 20 * s * 0.003;
        tx = Math.cos(starAngle + this.state.time * 0.05) * celebRadius;
        ty = Math.sin(starAngle + this.state.time * 0.05) * celebRadius;
      } else if (this.state.mode === 'ERROR') {
        // Shake but maintain 120° separation
        const baseX = Math.cos(starAngle) * 15 * s * 0.003;
        const baseY = Math.sin(starAngle) * 15 * s * 0.003;
        tx = baseX + (Math.random() - 0.5) * 10;
        ty = baseY + (Math.random() - 0.5) * 10;
      }

      t.x += (tx - t.x) * 0.1;
      t.y += (ty - t.y) * 0.1;

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
    this.drawShockwaves();
    this.drawParticles();

    this.twins.forEach((t, twinIndex) => {
      // REMOVED: Trail lines - Trinity stars should float independently with NO visual connections
      this.ctx.globalAlpha = 1.0;
      this.drawStar(t.x, t.y, 15 * s * 0.005, 4.5 * s * 0.005, t.color, twinIndex);
    });

    // Draw emote particles on top
    this.drawEmoteParticles();

    // REMOVED: ANALYZING mode connection lines - Trinity stars should be independent with NO visual connections

    // REMOVED: White connection line between stars - Trinity stars should be independent with NO visual connections

    this.ctx.restore();
  }

  private drawStar(x: number, y: number, outerR: number, innerR: number, color: string, twinIndex: number = 0) {
    // Apply emote behaviors - Trinity: cyan (0), purple (1), gold (2)
    const behaviors = [this.emoteState.cyanBehavior, this.emoteState.purpleBehavior, this.emoteState.goldBehavior];
    const behavior = behaviors[twinIndex] || behaviors[0];
    const scale = behavior.scale;
    const wobble = behavior.wobble;
    const glow = behavior.glow;
    const speed = behavior.speed;
    
    // Apply wobble offset with unique phase per star
    const wobbleX = Math.sin(this.state.time * 0.1 * speed + twinIndex * 2.1) * wobble * 3;
    const wobbleY = Math.cos(this.state.time * 0.12 * speed + twinIndex * 2.1) * wobble * 3;
    const drawX = x + wobbleX;
    const drawY = y + wobbleY;
    
    // Apply scaled sizes
    const scaledOuterR = outerR * scale;
    const scaledInnerR = innerR * scale;
    
    // Draw dark outline first for visibility on light backgrounds
    this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) - (this.state.time * 0.05 * speed);
      this.ctx.lineTo(drawX + Math.cos(angle) * (scaledOuterR + 2), drawY + Math.sin(angle) * (scaledOuterR + 2));
      this.ctx.lineTo(drawX + Math.cos(angle + Math.PI / 4) * (scaledInnerR + 1), drawY + Math.sin(angle + Math.PI / 4) * (scaledInnerR + 1));
    }
    this.ctx.closePath();
    this.ctx.stroke();
    
    // Draw colored fill with glow
    this.ctx.fillStyle = color;
    this.ctx.shadowBlur = 20 + (glow * 30);
    this.ctx.shadowColor = color;
    this.ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) - (this.state.time * 0.05 * speed);
      this.ctx.lineTo(drawX + Math.cos(angle) * scaledOuterR, drawY + Math.sin(angle) * scaledOuterR);
      this.ctx.lineTo(drawX + Math.cos(angle + Math.PI / 4) * scaledInnerR, drawY + Math.sin(angle + Math.PI / 4) * scaledInnerR);
    }
    this.ctx.closePath();
    this.ctx.fill();
    
    // Add darker stroke around star for contrast
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    
    // Draw center dot with dark ring
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, scaledInnerR + 1, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
    this.ctx.fill();
    
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(drawX, drawY, scaledInnerR, 0, Math.PI * 2);
    this.ctx.fill();
    
    // Trinity branded text: "Co" (cyan), "AI" (purple), "L" (gold) - spells "CoAIL"
    const brandLabels = ['Co', 'AI', 'L'];
    const brandColors = ['#a855f7', '#38bdf8', '#1e3a5f'];  // Purple on cyan, Cyan on purple, Navy on gold
    const label = brandLabels[twinIndex] || 'L';
    const labelColor = brandColors[twinIndex] || '#1e3a5f';
    
    // Scale font based on star size for readability
    const fontSize = Math.max(4, scaledOuterR * 0.55);
    this.ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    // Subtle shadow for depth
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    this.ctx.shadowBlur = 1;
    this.ctx.shadowOffsetY = 0.5;
    
    this.ctx.fillStyle = labelColor;
    this.ctx.fillText(label, drawX, drawY + 0.5);
    
    // Reset shadow
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetY = 0;
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

  private animate = () => {
    if (!this.isRunning) return;
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  destroy() {
    this.stop();
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
  emote
}: CoAITwinMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CoAITwinEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    engineRef.current = new CoAITwinEngine(containerRef.current, canvasRef.current);
    engineRef.current.setMode(mode);
    engineRef.current.start();

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

  // Apply emote state to engine
  useEffect(() => {
    if (engineRef.current && emote) {
      engineRef.current.setEmote(emote);
    }
  }, [emote]);

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
      >
        <div 
          ref={containerRef} 
          className="w-full h-full pointer-events-none"
          style={{ 
            width: bubbleSize, 
            height: bubbleSize,
            transform: 'scale(2.2)',
            transformOrigin: 'center',
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
      >
        <div 
          ref={containerRef} 
          className="w-full h-full pointer-events-none"
          style={{ 
            width: bubbleSize, 
            height: bubbleSize,
            transform: 'scale(1.4)',
            transformOrigin: 'center',
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
        </div>
      </div>
    );
  }

  // Full mode: With status badge and optional controls
  return (
    <div className={`relative ${className}`} style={{ background: 'transparent' }}>
      <div ref={containerRef} className="w-full h-full" style={{ background: 'transparent' }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ background: 'transparent' }}
          data-testid="coai-twin-mascot-canvas"
        />
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
