/**
 * TransmutationEngine - State Mutation System for Trinity Mascot
 * 
 * Implements the "Trinity Morph" effect where the mascot physically shape-shifts
 * using procedural geometry drawn frame-by-frame with fractional point interpolation.
 * 
 * Core Principle: Do not use static images or SVGs. Use Procedural Geometry.
 * 
 * Architecture:
 * 1. Canvas Geometry Engine - drawPolygonFractional() handles fractional points
 * 2. CSS Overlay Layer - Mutation flash effects via class toggling
 * 3. State Machine - Separates update() logic from draw() rendering
 * 
 * Transmutation Codes (State Mutations):
 * - IDLE → Stars (4 points, 0.25 innerR)
 * - SEARCHING → Triangles (3 points, 0.4 innerR)
 * - THINKING → Circles (20 points, 0.95 innerR)
 * - ANALYZING → Hexagons (6 points, 0.5 innerR)
 * - CODING → Squares (4 points, 0.71 innerR)
 * - LISTENING → Stars-6 (6 points, 0.3 innerR)
 * - UPLOADING → Pentagons (5 points, 0.35 innerR)
 * - SUCCESS → Rounded Hex (6 points, 0.6 innerR)
 * - ERROR → Spikes (8 points, 0.15 innerR)
 */

export type TransmutationCode = 
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

export interface TransmutationTarget {
  points: number;      // Target vertex count (3 = triangle, 4 = star/square, 20 = circle)
  innerR: number;      // Inner radius ratio (0.15 = very spiky, 0.95 = nearly round)
  color: string;       // Target color
  scale: number;       // Target scale multiplier
}

export interface TransmutationState {
  currentPoints: number;   // Current fractional point count (e.g., 3.5 = between triangle/square)
  currentInnerR: number;   // Current inner radius ratio
  currentColor: string;    // Current color (lerped)
  currentScale: number;    // Current scale
  targetPoints: number;    // Target point count
  targetInnerR: number;    // Target inner radius
  targetColor: string;     // Target color
  targetScale: number;     // Target scale
  mutationIntensity: number; // 0-1, how much "in flux" the state is
  isTransmuting: boolean;  // Whether actively changing state
}

export const TRANSMUTATION_CODES: Record<TransmutationCode, TransmutationTarget> = {
  IDLE: { points: 4, innerR: 0.25, color: '#38bdf8', scale: 1.0 },
  SEARCHING: { points: 3, innerR: 0.4, color: '#10b981', scale: 1.4 },
  THINKING: { points: 20, innerR: 0.95, color: '#a855f7', scale: 1.6 },
  ANALYZING: { points: 6, innerR: 0.5, color: '#6366f1', scale: 1.35 },
  CODING: { points: 4, innerR: 0.71, color: '#34d399', scale: 1.25 },
  LISTENING: { points: 6, innerR: 0.3, color: '#fbbf24', scale: 1.5 },
  UPLOADING: { points: 5, innerR: 0.35, color: '#06b6d4', scale: 1.3 },
  SUCCESS: { points: 6, innerR: 0.6, color: '#f472b6', scale: 1.8 },
  ERROR: { points: 8, innerR: 0.15, color: '#ef4444', scale: 0.7 },
  CELEBRATING: { points: 10, innerR: 0.3, color: '#fbbf24', scale: 1.7 },
  ADVISING: { points: 7, innerR: 0.55, color: '#10b981', scale: 1.3 },
  HOLIDAY: { points: 6, innerR: 0.35, color: '#c41e3a', scale: 1.5 },
  GREETING: { points: 4, innerR: 0.65, color: '#f472b6', scale: 1.4 }
};

export const TRINITY_IDLE_COLORS = ['#38bdf8', '#a855f7', '#f4c15d']; // Cyan, Purple, Gold

export class TransmutationEngine {
  private states: TransmutationState[] = [];
  private lerpSpeed: number = 0.08;  // 8% per frame for visible morphing
  private mutationDecay: number = 0.94;  // How fast mutation intensity decays
  private onFlashTrigger?: () => void;
  
  constructor(starCount: number = 3) {
    for (let i = 0; i < starCount; i++) {
      this.states.push({
        currentPoints: 4,
        currentInnerR: 0.25,
        currentColor: TRINITY_IDLE_COLORS[i] || '#38bdf8',
        currentScale: 1.0,
        targetPoints: 4,
        targetInnerR: 0.25,
        targetColor: TRINITY_IDLE_COLORS[i] || '#38bdf8',
        targetScale: 1.0,
        mutationIntensity: 0,
        isTransmuting: false
      });
    }
  }
  
  setFlashCallback(callback: () => void): void {
    this.onFlashTrigger = callback;
  }
  
  setLerpSpeed(speed: number): void {
    this.lerpSpeed = Math.max(0.01, Math.min(0.3, speed));
  }
  
  transmute(code: TransmutationCode): void {
    const target = TRANSMUTATION_CODES[code];
    if (!target) return;
    
    this.states.forEach((state, i) => {
      state.targetPoints = target.points;
      state.targetInnerR = target.innerR;
      state.targetScale = target.scale;
      
      if (code === 'IDLE') {
        state.targetColor = TRINITY_IDLE_COLORS[i] || target.color;
      } else if (code === 'ERROR') {
        state.targetColor = '#ef4444';
      } else {
        state.targetColor = i === 0 ? target.color : 
                            i === 1 ? '#ffffff' : 
                            '#f4c15d';
      }
      
      state.mutationIntensity = 1.0;
      state.isTransmuting = true;
    });
    
    this.onFlashTrigger?.();
  }
  
  transmuteIndividual(starIndex: number, target: Partial<TransmutationTarget>): void {
    const state = this.states[starIndex];
    if (!state) return;
    
    if (target.points !== undefined) state.targetPoints = target.points;
    if (target.innerR !== undefined) state.targetInnerR = target.innerR;
    if (target.color !== undefined) state.targetColor = target.color;
    if (target.scale !== undefined) state.targetScale = target.scale;
    
    state.mutationIntensity = 1.0;
    state.isTransmuting = true;
    
    this.onFlashTrigger?.();
  }
  
  update(): void {
    this.states.forEach(state => {
      state.currentPoints = this.lerp(state.currentPoints, state.targetPoints, this.lerpSpeed);
      state.currentInnerR = this.lerp(state.currentInnerR, state.targetInnerR, this.lerpSpeed);
      state.currentScale = this.lerp(state.currentScale, state.targetScale, this.lerpSpeed);
      state.currentColor = this.lerpColor(state.currentColor, state.targetColor, this.lerpSpeed);
      
      if (state.mutationIntensity > 0) {
        state.mutationIntensity *= this.mutationDecay;
        if (state.mutationIntensity < 0.01) {
          state.mutationIntensity = 0;
          state.isTransmuting = false;
        }
      }
    });
  }
  
  getState(starIndex: number): TransmutationState | null {
    return this.states[starIndex] || null;
  }
  
  getAllStates(): TransmutationState[] {
    return this.states;
  }
  
  getMutationIntensity(): number {
    return Math.max(...this.states.map(s => s.mutationIntensity));
  }
  
  isAnyTransmuting(): boolean {
    return this.states.some(s => s.isTransmuting);
  }
  
  /**
   * Draw a polygon with FRACTIONAL point count for smooth morphing
   * 
   * Key Innovation: When points is 3.5, we draw a shape halfway between
   * a triangle (3) and a square (4). This creates fluid "morphing" illusion.
   * 
   * Algorithm:
   * 1. Calculate floor (lower shape) and ceil (upper shape) point counts
   * 2. Draw a hybrid polygon that interpolates between them
   * 3. The fractional part (0.5 in 3.5) controls the blend
   */
  drawPolygonFractional(
    ctx: CanvasRenderingContext2D,
    x: number, 
    y: number, 
    radius: number, 
    points: number, 
    innerRatio: number, 
    color: string,
    rotation: number = 0
  ): void {
    const minPoints = 3;
    const clampedPoints = Math.max(minPoints, points);
    
    const floorPoints = Math.floor(clampedPoints);
    const ceilPoints = Math.ceil(clampedPoints);
    const fraction = clampedPoints - floorPoints;
    
    ctx.save();
    
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 2;
    this.drawStarPath(ctx, x, y, radius * 1.05, floorPoints, ceilPoints, fraction, innerRatio, rotation);
    ctx.stroke();
    
    ctx.fillStyle = color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    this.drawStarPath(ctx, x, y, radius, floorPoints, ceilPoints, fraction, innerRatio, rotation);
    ctx.fill();
    
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    
    const centerRadius = radius * 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, centerRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  /**
   * Draw the actual star path with fractional point interpolation
   * 
   * For fractional points like 3.5:
   * - Draw 3 complete star segments (floor)
   * - Add a partial 4th segment (proportional to fraction)
   * - Smoothly blend the last segment to create morphing effect
   */
  private drawStarPath(
    ctx: CanvasRenderingContext2D,
    x: number, 
    y: number, 
    radius: number,
    floorPoints: number,
    ceilPoints: number,
    fraction: number,
    innerRatio: number,
    rotation: number
  ): void {
    ctx.beginPath();
    
    const usePoints = fraction > 0.5 ? ceilPoints : floorPoints;
    const morphAmount = fraction > 0.5 ? fraction : (1 - fraction);
    
    const effectivePoints = this.lerp(floorPoints, ceilPoints, fraction);
    const totalVertices = Math.round(effectivePoints) * 2;
    const step = (Math.PI * 2) / totalVertices;
    
    for (let i = 0; i < totalVertices; i++) {
      const isOuter = (i % 2 === 0);
      
      let segmentRadius: number;
      if (isOuter) {
        segmentRadius = radius;
      } else {
        const morphedInnerRatio = innerRatio + (1 - innerRatio) * 0.1 * Math.sin(fraction * Math.PI);
        segmentRadius = radius * morphedInnerRatio;
      }
      
      const angle = i * step + rotation;
      const px = x + Math.cos(angle) * segmentRadius;
      const py = y + Math.sin(angle) * segmentRadius;
      
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    
    ctx.closePath();
  }
  
  /**
   * Draw a polygon with branded label (for Trinity stars)
   */
  drawBrandedPolygon(
    ctx: CanvasRenderingContext2D,
    x: number, 
    y: number, 
    radius: number, 
    points: number, 
    innerRatio: number, 
    color: string,
    label: string,
    labelColor: string,
    rotation: number = 0
  ): void {
    this.drawPolygonFractional(ctx, x, y, radius, points, innerRatio, color, rotation);
    
    const fontSize = Math.max(4, radius * 0.5);
    ctx.save();
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = labelColor;
    ctx.fillText(label, x, y + 0.5);
    ctx.restore();
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
  
  private lerpColor(colorA: string, colorB: string, t: number): string {
    const parseHex = (hex: string) => {
      if (!hex || typeof hex !== 'string') return { r: 128, g: 128, b: 128 };
      const clean = hex.replace('#', '');
      if (!/^[0-9a-fA-F]+$/.test(clean)) return { r: 128, g: 128, b: 128 };
      
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
    };
    
    const ca = parseHex(colorA);
    const cb = parseHex(colorB);
    const clampedT = Math.max(0, Math.min(1, t));
    
    const r = Math.round(ca.r + (cb.r - ca.r) * clampedT);
    const g = Math.round(ca.g + (cb.g - ca.g) * clampedT);
    const b = Math.round(ca.b + (cb.b - ca.b) * clampedT);
    
    return '#' + 
      r.toString(16).padStart(2, '0') + 
      g.toString(16).padStart(2, '0') + 
      b.toString(16).padStart(2, '0');
  }
}

export const transmutationEngine = new TransmutationEngine(3);
