/**
 * GeminiAgentMascot - Interactive twin-star mascot visualization
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
  | 'ERROR';

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

interface GeminiAgentMascotProps {
  mode?: MascotMode;
  className?: string;
  showControls?: boolean;
  onModeChange?: (mode: MascotMode) => void;
  size?: number; // Size in pixels (default 400)
  mini?: boolean; // Compact mode for bubble display - no overlays
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
  ERROR: '#ef4444'      // Red
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
  ERROR: 'Error'
};

class GeminiAgentEngine {
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

  private twins: Twin[] = [
    { id: 0, x: 0, y: 0, trail: [], color: '#38bdf8', angle: 0 },
    { id: 1, x: 0, y: 0, trail: [], color: '#a855f7', angle: Math.PI }
  ];

  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private isRunning = false;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement) {
    this.container = container;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
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
    
    if (mode === 'SUCCESS') this.spawnExplosion(20);
    if (mode === 'ERROR') this.state.shake = 20;
    if (mode === 'CODING' || mode === 'UPLOADING') this.particles = [];
    
    if (mode === 'IDLE') {
      this.twins[0].color = '#38bdf8';
      this.twins[1].color = '#a855f7';
    } else if (mode === 'ERROR') {
      this.twins[0].color = '#ef4444';
      this.twins[1].color = '#ef4444';
    } else {
      this.twins[0].color = color;
      this.twins[1].color = '#fff';
    }
  }

  getMode(): MascotMode {
    return this.state.mode;
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

    if (this.state.shake > 0) {
      this.state.shake *= 0.9;
      if (this.state.shake < 0.5) this.state.shake = 0;
    }

    this.twins.forEach((t, i) => {
      let tx = 0, ty = 0;

      if (this.state.isTouching && this.state.touchX !== null && this.state.touchY !== null) {
        const mx = (this.state.touchX / window.devicePixelRatio) - cx;
        const my = (this.state.touchY / window.devicePixelRatio) - cy;
        tx = mx + Math.cos(this.state.time * 0.1 + i * Math.PI) * (30 * s * 0.002);
        ty = my + Math.sin(this.state.time * 0.1 + i * Math.PI) * (30 * s * 0.002);
      } else if (this.state.mode === 'IDLE') {
        const tOffset = this.state.time * 0.02 + (i * Math.PI);
        tx = Math.cos(tOffset) * (80 * s * 0.002);
        ty = Math.sin(tOffset * 2) * (30 * s * 0.002);
      } else if (this.state.mode === 'SEARCHING') {
        if (i === 0) {
          tx = 0;
          ty = 0;
        } else {
          const angle = this.state.time * 0.05;
          const rad = 100 * s * 0.002;
          tx = Math.cos(angle) * rad;
          ty = Math.sin(angle) * rad;
          if (this.state.time % 40 === 0) this.spawnParticle(tx, ty, t.color);
        }
      } else if (this.state.mode === 'ANALYZING') {
        const angle = i === 0 ? -Math.PI / 4 : Math.PI * 0.75;
        const dist = 60 * s * 0.002;
        tx = Math.cos(angle) * dist;
        ty = Math.sin(angle) * dist;
        tx += Math.sin(this.state.time * 0.1 + i) * 5;
      } else if (this.state.mode === 'THINKING') {
        t.angle += 0.15;
        const radius = 50 * s * 0.002;
        tx = Math.cos(t.angle + (i * Math.PI)) * radius;
        ty = Math.sin(t.angle + (i * Math.PI)) * radius;
      } else if (this.state.mode === 'CODING') {
        const step = 40 * s * 0.002;
        const speed = this.state.time * 0.05 + (i * 10);
        tx = Math.round(Math.cos(speed) * 3) * step;
        ty = Math.round(Math.sin(speed) * 3) * step;
      } else if (this.state.mode === 'UPLOADING') {
        const angle = this.state.time * 0.2 + (i * Math.PI);
        const radius = 40 * s * 0.002;
        tx = Math.cos(angle) * radius;
        ty = (Math.sin(this.state.time * 0.05) * 50) * s * 0.002;
        if (this.state.time % 5 === 0) {
          this.spawnParticle(tx, ty, t.color, 0, 2);
        }
      } else if (this.state.mode === 'LISTENING') {
        const audio = Math.sin(this.state.time * 0.2 + i) * Math.sin(this.state.time * 0.5);
        tx = (i === 0 ? -30 : 30) * s * 0.002;
        ty = audio * 60 * s * 0.002;
      } else if (this.state.mode === 'SUCCESS') {
        tx = 0;
        ty = 0;
      } else if (this.state.mode === 'ERROR') {
        tx = (Math.random() - 0.5) * 20;
        ty = (Math.random() - 0.5) * 20;
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
    this.ctx.fillStyle = '#020617';
    this.ctx.fillRect(0, 0, w, h);

    if (this.state.shake > 0) {
      this.ctx.translate(
        (Math.random() - 0.5) * this.state.shake,
        (Math.random() - 0.5) * this.state.shake
      );
    }

    this.ctx.translate(cx, cy);

    this.drawGrid(w, h, s);
    this.drawShockwaves();
    this.drawParticles();

    this.twins.forEach(t => {
      this.ctx.beginPath();
      for (let i = 0; i < t.trail.length - 1; i++) {
        const p1 = t.trail[i];
        const p2 = t.trail[i + 1];
        this.ctx.strokeStyle = t.color;
        this.ctx.globalAlpha = p1.life * 0.5;
        this.ctx.lineWidth = p1.life * 10 * s * 0.002;
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
      this.ctx.globalAlpha = 1.0;
      this.drawStar(t.x, t.y, 15 * s * 0.002, 4 * s * 0.002, t.color);
    });

    if (this.state.mode === 'ANALYZING') {
      this.ctx.strokeStyle = this.twins[0].color;
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = 0.3;
      const pts = 6;
      for (let i = 0; i < pts; i++) {
        const a = (Math.PI * 2 / pts) * i + this.state.time * 0.01;
        const r = 100 * s * 0.002;
        this.ctx.beginPath();
        this.ctx.moveTo(this.twins[0].x, this.twins[0].y);
        this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(this.twins[1].x, this.twins[1].y);
        this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        this.ctx.stroke();
      }
      this.ctx.globalAlpha = 1.0;
    }

    if (this.state.mode !== 'ERROR' && this.state.mode !== 'SEARCHING') {
      const t1 = this.twins[0];
      const t2 = this.twins[1];
      const dist = Math.hypot(t1.x - t2.x, t1.y - t2.y);
      if (dist < 150 * s * 0.002) {
        this.ctx.strokeStyle = `rgba(255,255,255,${1 - dist / (150 * s * 0.002)})`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(t1.x, t1.y);
        this.ctx.lineTo(t2.x, t2.y);
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  private drawStar(x: number, y: number, outerR: number, innerR: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.shadowBlur = 20;
    this.ctx.shadowColor = color;
    this.ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI / 2) - (this.state.time * 0.05);
      this.ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
      this.ctx.lineTo(x + Math.cos(angle + Math.PI / 4) * innerR, y + Math.sin(angle + Math.PI / 4) * innerR);
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    this.ctx.arc(x, y, innerR, 0, Math.PI * 2);
    this.ctx.fill();
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

export const GeminiAgentMascot = memo(function GeminiAgentMascot({
  mode = 'IDLE',
  className = '',
  showControls = false,
  onModeChange,
  size,
  mini = false
}: GeminiAgentMascotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GeminiAgentEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    engineRef.current = new GeminiAgentEngine(containerRef.current, canvasRef.current);
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

  const handleModeChange = useCallback((newMode: MascotMode) => {
    if (engineRef.current) {
      engineRef.current.setMode(newMode);
    }
    onModeChange?.(newMode);
  }, [onModeChange]);

  const color = MODE_COLORS[mode];
  const label = MODE_LABELS[mode];

  // Mini mode: Clean bubble display without overlays - zoomed in on animation
  if (mini) {
    const bubbleSize = size || 70;
    return (
      <div 
        className={`relative rounded-full overflow-hidden ${className}`}
        style={{ 
          width: bubbleSize, 
          height: bubbleSize,
          background: 'radial-gradient(circle at 35% 35%, #0f172a, #020617)'
        }}
      >
        <div 
          ref={containerRef} 
          className="w-full h-full"
          style={{ 
            width: bubbleSize, 
            height: bubbleSize,
            transform: 'scale(1.3)',
            transformOrigin: 'center',
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full touch-none"
            style={{ 
              width: bubbleSize, 
              height: bubbleSize
            }}
            data-testid="gemini-mascot-canvas-mini"
          />
        </div>
        <div 
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow: `inset 0 0 15px rgba(${hexToRgb(color)}, 0.4), 0 0 12px rgba(${hexToRgb(color)}, 0.3)`,
            border: `1.5px solid rgba(${hexToRgb(color)}, 0.5)`
          }}
        />
      </div>
    );
  }

  // Full mode: With status badge and optional controls
  return (
    <div className={`relative bg-[#020617] ${className}`}>
      <div ref={containerRef} className="w-full h-full">
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          data-testid="gemini-mascot-canvas"
        />
      </div>

      <div className="absolute bottom-0 left-0 w-full p-4 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(2, 6, 23, 1) 30%, rgba(2, 6, 23, 0.8) 70%, transparent)'
        }}
      >
        <div className="flex justify-center mb-3">
          <div
            className="text-[11px] font-bold tracking-[2px] uppercase px-5 py-2 rounded-full backdrop-blur-xl flex items-center gap-2.5"
            style={{
              color,
              background: `rgba(${hexToRgb(color)}, 0.1)`,
              border: `1px solid rgba(${hexToRgb(color)}, 0.2)`,
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              textShadow: `0 0 10px rgba(${hexToRgb(color)}, 0.5)`
            }}
            data-testid="mascot-status-badge"
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background: 'currentColor',
                boxShadow: '0 0 8px currentColor'
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
              className="w-full appearance-none bg-slate-800/60 border border-white/10 text-white px-5 py-3.5 rounded-xl text-sm font-semibold tracking-wide cursor-pointer backdrop-blur-xl transition-all focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              style={{ boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)' }}
              data-testid="mascot-mode-select"
            >
              <option value="IDLE">IDLE (Waiting)</option>
              <option value="SEARCHING">SEARCHING (Radar Scan)</option>
              <option value="THINKING">THINKING (Processing)</option>
              <option value="ANALYZING">ANALYZING (Neural Net)</option>
              <option value="CODING">CODING (Matrix)</option>
              <option value="LISTENING">LISTENING (Voice)</option>
              <option value="UPLOADING">UPLOADING (Data Stream)</option>
              <option value="SUCCESS">SUCCESS (Complete)</option>
              <option value="ERROR">ERROR (System Fault)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
});

export { MODE_COLORS, MODE_LABELS };
