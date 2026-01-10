/**
 * UniversalAnimationEngine - Canvas-based visual effects system
 * 
 * Supports multiple animation modes:
 * - search: Radar sweep for scanning/searching
 * - analyze: Neural network visualization for AI processing
 * - voice: Waveform bars for audio processing
 * - warp: Tunnel effect for navigation transitions
 * - success: Checkmark lock for completion states
 * - error: Glitch effect for error states
 * - idle: Gentle pulse for standby
 * 
 * Features:
 * - AI Brain integration for dynamic control
 * - Support console control via WebSocket
 * - Seasonal/festive theme variations
 * - Progress-reactive intensity
 */

import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUniversalLoadingGate } from '@/contexts/universal-loading-gate';
import { ColorfulCelticKnot } from '@/components/ui/colorful-celtic-knot';

export type AnimationMode = 'idle' | 'search' | 'analyze' | 'voice' | 'warp' | 'success' | 'error';

export type SeasonalTheme = 'default' | 'winter' | 'spring' | 'summer' | 'autumn' | 'holiday' | 'halloween' | 'valentines';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life?: number;
}

export interface AnimationEngineState {
  mode: AnimationMode;
  progress: number;
  mainText: string;
  subText: string;
  seasonalTheme: SeasonalTheme;
  isActive: boolean;
}

interface UniversalAnimationEngineProps {
  isVisible: boolean;
  mode?: AnimationMode;
  mainText?: string;
  subText?: string;
  progress?: number;
  duration?: number;
  seasonalTheme?: SeasonalTheme;
  onComplete?: () => void;
  onClick?: () => void;
}

const SEASONAL_COLORS: Record<SeasonalTheme, Record<AnimationMode | 'idle', string>> = {
  default: {
    search: '#10b981',
    analyze: '#a855f7',
    voice: '#f43f5e',
    warp: '#3b82f6',
    success: '#eab308',
    error: '#ef4444',
    idle: '#64748b'
  },
  winter: {
    search: '#67e8f9',
    analyze: '#a5b4fc',
    voice: '#c4b5fd',
    warp: '#7dd3fc',
    success: '#a3e635',
    error: '#fb7185',
    idle: '#94a3b8'
  },
  spring: {
    search: '#4ade80',
    analyze: '#f472b6',
    voice: '#fb923c',
    warp: '#22d3ee',
    success: '#fbbf24',
    error: '#f87171',
    idle: '#a3e635'
  },
  summer: {
    search: '#facc15',
    analyze: '#fb923c',
    voice: '#f43f5e',
    warp: '#06b6d4',
    success: '#a3e635',
    error: '#ef4444',
    idle: '#fbbf24'
  },
  autumn: {
    search: '#f97316',
    analyze: '#dc2626',
    voice: '#b45309',
    warp: '#ca8a04',
    success: '#65a30d',
    error: '#b91c1c',
    idle: '#d97706'
  },
  holiday: {
    search: '#22c55e',
    analyze: '#ef4444',
    voice: '#fbbf24',
    warp: '#22c55e',
    success: '#fbbf24',
    error: '#ef4444',
    idle: '#22c55e'
  },
  halloween: {
    search: '#f97316',
    analyze: '#a855f7',
    voice: '#dc2626',
    warp: '#000000',
    success: '#84cc16',
    error: '#dc2626',
    idle: '#f97316'
  },
  valentines: {
    search: '#f472b6',
    analyze: '#ec4899',
    voice: '#be185d',
    warp: '#db2777',
    success: '#f43f5e',
    error: '#9f1239',
    idle: '#f9a8d4'
  }
};

class VisualEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private cx: number = 0;
  private cy: number = 0;
  private scale: number = 1;
  private time: number = 0;
  private particles: Particle[] = [];
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  
  public mode: AnimationMode = 'idle';
  public progress: number = 0;
  public seasonalTheme: SeasonalTheme = 'default';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
    this.resize();
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.scale = Math.min(this.width, this.height) / 200;
  }

  getColor(mode: AnimationMode): string {
    return SEASONAL_COLORS[this.seasonalTheme][mode] || SEASONAL_COLORS.default[mode];
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.loop();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  setProgress(pct: number) {
    this.progress = Math.max(0, Math.min(1, pct));
  }

  setMode(mode: AnimationMode) {
    this.mode = mode;
    this.particles = [];
    this.progress = 0;
    this.start();

    if (mode === 'analyze') {
      for (let i = 0; i < 15; i++) {
        this.particles.push({
          x: (Math.random() - 0.5) * 120,
          y: (Math.random() - 0.5) * 120,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5
        });
      }
    }
  }

  private loop = () => {
    if (!this.isRunning) return;
    
    this.time++;
    const s = this.scale;
    const color = this.getColor(this.mode);
    const intensity = 1 + (this.progress * 2);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();

    if (this.mode === 'error') {
      const shake = Math.random() * 5 * s;
      this.ctx.translate(shake, shake);
    }

    switch (this.mode) {
      case 'search':
        this.renderSearch(s, color, intensity);
        break;
      case 'analyze':
        this.renderAnalyze(s, color, intensity);
        break;
      case 'voice':
        this.renderVoice(s, color, intensity);
        break;
      case 'warp':
        this.renderWarp(s, color, intensity);
        break;
      case 'success':
        this.renderSuccess(s, color);
        break;
      case 'error':
        this.renderError(s, color);
        break;
      default:
        this.renderIdle(s, color);
    }

    this.ctx.restore();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private renderSearch(s: number, color: string, intensity: number) {
    const speed = 0.05 * intensity;
    const angle = (this.time * speed) % (Math.PI * 2);

    this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    this.ctx.lineWidth = 1;
    [30, 60, 90].forEach(r => {
      this.ctx.beginPath();
      this.ctx.arc(this.cx, this.cy, r * s, 0, Math.PI * 2);
      this.ctx.stroke();
    });

    const grad = this.ctx.createConicGradient(angle + Math.PI / 2, this.cx, this.cy);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, color);

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, 90 * s, 0, Math.PI * 2);
    this.ctx.fill();

    if (Math.random() > 0.95 - (this.progress * 0.1)) {
      const r = Math.random() * 80 * s;
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: 0,
        vy: 0,
        life: 1
      });
    }

    this.particles = this.particles.filter(p => {
      if (p.life === undefined) return true;
      p.life -= 0.03;
      if (p.life <= 0) return false;
      
      this.ctx.fillStyle = `rgba(255,255,255,${p.life})`;
      this.ctx.beginPath();
      this.ctx.arc(this.cx + p.x, this.cy + p.y, 2 * s, 0, Math.PI * 2);
      this.ctx.fill();
      return true;
    });
  }

  private renderAnalyze(s: number, color: string, intensity: number) {
    this.particles.forEach(p => {
      p.x += p.vx * intensity;
      p.y += p.vy * intensity;
      if (Math.abs(p.x) > 60) p.vx *= -1;
      if (Math.abs(p.y) > 60) p.vy *= -1;
    });

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;

    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const p1 = this.particles[i];
        const p2 = this.particles[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (dist < 50) {
          this.ctx.globalAlpha = 1 - (dist / 50);
          this.ctx.beginPath();
          this.ctx.moveTo(this.cx + p1.x * s, this.cy + p1.y * s);
          this.ctx.lineTo(this.cx + p2.x * s, this.cy + p2.y * s);
          this.ctx.stroke();
        }
      }
    }

    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#fff';
    this.particles.forEach(p => {
      this.ctx.beginPath();
      this.ctx.arc(this.cx + p.x * s, this.cy + p.y * s, 3 * s, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  private renderVoice(s: number, color: string, intensity: number) {
    const count = 7;
    const barWidth = 12 * s;
    const gap = 6 * s;
    const startX = this.cx - ((count * (barWidth + gap)) / 2) + (gap / 2);

    this.ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const freq = Math.sin(this.time * 0.2 + (i * 0.5));
      const h = (20 + Math.abs(freq) * 40 * intensity) * s;
      
      this.ctx.beginPath();
      this.ctx.roundRect(startX + i * (barWidth + gap), this.cy - h / 2, barWidth, h, 4);
      this.ctx.fill();
    }
  }

  private renderWarp(s: number, color: string, intensity: number) {
    this.ctx.fillStyle = '#fff';
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 20 * intensity;
    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, 10 * s, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + (this.time * 0.02 * intensity);
      const offset = Math.sin(this.time * 0.1 + i) * 20;
      const len = (40 * s + offset) * intensity;
      const startDist = 20 * s;

      const x1 = this.cx + Math.cos(angle) * startDist;
      const y1 = this.cy + Math.sin(angle) * startDist;
      const x2 = this.cx + Math.cos(angle) * (startDist + len);
      const y2 = this.cy + Math.sin(angle) * (startDist + len);

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3 * s;
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();
    }
  }

  private renderSuccess(s: number, color: string) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 4 * s;
    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, 40 * s, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 5 * s;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(this.cx - 15 * s, this.cy + 5 * s);
    this.ctx.lineTo(this.cx - 5 * s, this.cy + 15 * s);
    this.ctx.lineTo(this.cx + 15 * s, this.cy - 15 * s);
    this.ctx.stroke();
  }

  private renderError(s: number, color: string) {
    if (Math.random() > 0.8) {
      this.ctx.fillStyle = 'rgba(255,0,0,0.2)';
      const h = Math.random() * 10 * s;
      const y = (Math.random() * 100 - 50) * s;
      this.ctx.fillRect(this.cx - 50 * s, this.cy + y, 100 * s, h);
    }

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 5 * s;
    this.ctx.lineCap = 'round';

    const sz = 20 * s;
    this.ctx.beginPath();
    this.ctx.moveTo(this.cx - sz, this.cy - sz);
    this.ctx.lineTo(this.cx + sz, this.cy + sz);
    this.ctx.moveTo(this.cx + sz, this.cy - sz);
    this.ctx.lineTo(this.cx - sz, this.cy + sz);
    this.ctx.stroke();

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2 * s;
    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, 40 * s, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private renderIdle(s: number, color: string) {
    const pulse = Math.sin(this.time * 0.05) * 5 * s;
    this.ctx.fillStyle = '#fff';
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 20;
    this.ctx.beginPath();
    this.ctx.arc(this.cx, this.cy, 15 * s + pulse, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  destroy() {
    this.stop();
  }
}

const AnimationCanvas = memo(function AnimationCanvas({
  mode,
  progress,
  seasonalTheme
}: {
  mode: AnimationMode;
  progress: number;
  seasonalTheme: SeasonalTheme;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VisualEngine | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    engineRef.current = new VisualEngine(canvasRef.current);
    engineRef.current.seasonalTheme = seasonalTheme;
    engineRef.current.setMode(mode);

    const handleResize = () => {
      engineRef.current?.resize();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      engineRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setMode(mode);
    }
  }, [mode]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setProgress(progress);
    }
  }, [progress]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.seasonalTheme = seasonalTheme;
    }
  }, [seasonalTheme]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
});

export function UniversalAnimationEngine({
  isVisible,
  mode = 'warp',
  mainText = 'Loading',
  subText = 'Please wait...',
  progress = 0,
  duration,
  seasonalTheme = 'default',
  onComplete,
  onClick
}: UniversalAnimationEngineProps) {
  const { isLoadingBlocked } = useUniversalLoadingGate();
  const [localProgress, setLocalProgress] = useState(0);
  const [localSubText, setLocalSubText] = useState(subText);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const getColor = useCallback(() => {
    return SEASONAL_COLORS[seasonalTheme][mode] || SEASONAL_COLORS.default[mode];
  }, [seasonalTheme, mode]);

  useEffect(() => {
    if (!isVisible || !duration) return;

    const startTime = Date.now();
    const steps = [
      { p: 0.2, msg: 'Initializing Agents...' },
      { p: 0.5, msg: 'Processing Context...' },
      { p: 0.8, msg: 'Finalizing Output...' }
    ];

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / duration, 1);

      setLocalProgress(pct);

      const step = [...steps].reverse().find(s => pct >= s.p);
      if (step) {
        setLocalSubText(step.msg);
      }

      if (pct >= 1) {
        setLocalSubText('Complete');
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
        setTimeout(() => {
          onComplete?.();
        }, 300);
      }
    };

    timerRef.current = setInterval(updateProgress, 50);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isVisible, duration, onComplete]);

  useEffect(() => {
    if (progress !== undefined && !duration) {
      setLocalProgress(progress);
    }
  }, [progress, duration]);

  useEffect(() => {
    if (!duration) {
      setLocalSubText(subText);
    }
  }, [subText, duration]);

  if (isLoadingBlocked) {
    return null;
  }

  const displayProgress = duration ? localProgress : progress;
  const displaySubText = duration ? localSubText : subText;
  const color = getColor();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center cursor-pointer"
          style={{
            background: 'radial-gradient(circle, rgba(15, 17, 21, 0.95) 0%, rgba(10, 10, 15, 0.98) 100%)',
            backdropFilter: 'blur(10px)'
          }}
          onClick={onClick}
          data-testid="universal-animation-overlay"
        >
          {/* Trinity Celtic Knot Logo - Brand centerpiece */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="flex items-center justify-center"
          >
            <ColorfulCelticKnot 
              size={120} 
              animated 
              animationSpeed="slow"
              state="thinking"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-5 text-center w-[80%] max-w-[400px]"
          >
            <div
              className="text-base sm:text-xl md:text-2xl font-bold tracking-wider uppercase"
              style={{ color, textShadow: `0 0 20px ${color}` }}
            >
              {mainText}
            </div>
            <div className="text-slate-400 font-mono mt-2 text-xs sm:text-sm min-h-[20px]">
              {displaySubText}
            </div>

            <div className="mt-5 relative">
              <div className="absolute right-0 -top-5 text-xs font-mono" style={{ color }}>
                {Math.floor(displayProgress * 100)}%
              </div>
              <div className="w-full h-1 bg-white/10 rounded-sm overflow-hidden">
                <motion.div
                  className="h-full rounded-sm"
                  style={{ 
                    backgroundColor: color,
                    boxShadow: `0 0 10px ${color}`
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${displayProgress * 100}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { SEASONAL_COLORS };
