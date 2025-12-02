/**
 * TrinityPhysics - Collision detection and physics for 3-star Trinity mascot
 * 
 * Provides soft-body spring physics so the three stars (Co, AI, NX) 
 * interact naturally without overlapping. Features:
 * - Collision detection with repulsion forces
 * - Spring forces to maintain formation
 * - Velocity-based movement with damping
 * - Boundary constraints
 */

export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  targetX: number;
  targetY: number;
}

export interface TrinityPhysicsConfig {
  repulsionStrength: number;    // How hard stars push each other apart
  springStrength: number;       // How strongly stars return to target positions
  dampening: number;            // Velocity dampening (friction)
  minDistance: number;          // Minimum distance between stars
  maxSpeed: number;             // Maximum velocity
  bounceElasticity: number;     // How bouncy collisions are
}

// FULLY INDEPENDENT STARS - Maximum separation, no visual overlap possible
// CONFIG SYNCED WITH TRINITY_STAR_CONFIG in mascotConfig.ts
const DEFAULT_CONFIG: TrinityPhysicsConfig = {
  repulsionStrength: 50.0,      // EXTREME repulsion - ALL 3 STARS ALWAYS VISIBLE
  springStrength: 0.08,         // Moderate spring - allows separation while keeping formation
  dampening: 0.7,               // Moderate damping
  minDistance: 100,             // MASSIVE minimum gap - ALL 3 STARS VISIBLE
  maxSpeed: 10,                 // Fast for quick separation
  bounceElasticity: 1.0         // Maximum bounce for immediate hard separation
};

export class TrinityPhysics {
  private bodies: PhysicsBody[] = [];
  private config: TrinityPhysicsConfig;
  private bounds: { width: number; height: number; centerX: number; centerY: number };

  constructor(config: Partial<TrinityPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bounds = { width: 100, height: 100, centerX: 50, centerY: 50 };
    
    // Initialize 3 Trinity bodies with 120° offset positions - MAXIMUM spread to prevent overlap
    // Use minDistance as guide for initial spread - ensures all 3 stars start FULLY separated
    const initRadius = Math.max(35, this.config.minDistance * 0.7);
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    this.bodies = angles.map((angle, i) => ({
      x: Math.cos(angle) * initRadius,
      y: Math.sin(angle) * initRadius,
      vx: 0,
      vy: 0,
      radius: 20,  // Default radius - will be updated by setBodyRadius() to match actual star size
      mass: 1,
      targetX: Math.cos(angle) * initRadius,
      targetY: Math.sin(angle) * initRadius
    }));
  }

  setBounds(width: number, height: number) {
    this.bounds.width = width;
    this.bounds.height = height;
    this.bounds.centerX = width / 2;
    this.bounds.centerY = height / 2;
  }
  
  // CRITICAL: Set body radius to match actual rendered star size
  // This ensures collision detection works properly and 3rd star doesn't hide
  setBodyRadius(starRadius: number) {
    const safeRadius = Math.max(starRadius, 10);
    for (const body of this.bodies) {
      body.radius = safeRadius;
    }
    // Also update minDistance to be at least 2x the star diameter
    this.config.minDistance = Math.max(this.config.minDistance, safeRadius * 3);
  }

  setTargetPositions(positions: { x: number; y: number }[]) {
    positions.forEach((pos, i) => {
      if (this.bodies[i]) {
        this.bodies[i].targetX = pos.x;
        this.bodies[i].targetY = pos.y;
      }
    });
  }

  getPositions(): { x: number; y: number }[] {
    return this.bodies.map(b => ({ x: b.x, y: b.y }));
  }

  update(deltaTime: number = 1): { x: number; y: number }[] {
    const dt = Math.min(deltaTime, 2); // Cap delta time for stability
    
    // 1. Apply spring forces toward target positions
    this.applySpringForces();
    
    // 2. Apply collision/repulsion forces between stars
    this.applyCollisionForces();
    
    // 3. Apply damping and integrate velocity
    this.integrateVelocity(dt);
    
    // 4. Clamp velocities
    this.clampVelocities();
    
    // 5. Apply boundary constraints
    this.applyBoundaryConstraints();
    
    return this.getPositions();
  }

  private applySpringForces() {
    const { springStrength } = this.config;
    
    for (const body of this.bodies) {
      const dx = body.targetX - body.x;
      const dy = body.targetY - body.y;
      
      body.vx += dx * springStrength;
      body.vy += dy * springStrength;
    }
  }

  private applyCollisionForces() {
    const { repulsionStrength, minDistance, bounceElasticity } = this.config;
    
    // Check each pair of bodies
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i];
        const b = this.bodies[j];
        
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) || 0.001; // Prevent division by zero
        
        const combinedRadius = a.radius + b.radius;
        const minDist = Math.max(combinedRadius, minDistance);
        
        if (dist < minDist) {
          // Collision detected - apply repulsion force
          const overlap = minDist - dist;
          const nx = dx / dist; // Normal vector
          const ny = dy / dist;
          
          // Repulsion force proportional to overlap
          const force = repulsionStrength * overlap;
          
          // Apply equal and opposite forces
          a.vx -= nx * force * bounceElasticity;
          a.vy -= ny * force * bounceElasticity;
          b.vx += nx * force * bounceElasticity;
          b.vy += ny * force * bounceElasticity;
          
          // Also separate positions to prevent sticking
          const separation = overlap * 0.5;
          a.x -= nx * separation;
          a.y -= ny * separation;
          b.x += nx * separation;
          b.y += ny * separation;
        } else if (dist < minDist * 1.5) {
          // Soft repulsion zone - gentle push apart
          const softForce = repulsionStrength * 0.3 * (1 - dist / (minDist * 1.5));
          const nx = dx / dist;
          const ny = dy / dist;
          
          a.vx -= nx * softForce;
          a.vy -= ny * softForce;
          b.vx += nx * softForce;
          b.vy += ny * softForce;
        }
      }
    }
  }

  private integrateVelocity(dt: number) {
    const { dampening } = this.config;
    
    for (const body of this.bodies) {
      // Apply velocity damping
      body.vx *= dampening;
      body.vy *= dampening;
      
      // Integrate position
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    }
  }

  private clampVelocities() {
    const { maxSpeed } = this.config;
    
    for (const body of this.bodies) {
      const speed = Math.sqrt(body.vx * body.vx + body.vy * body.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        body.vx *= scale;
        body.vy *= scale;
      }
    }
  }

  private applyBoundaryConstraints() {
    const padding = 5;
    const halfWidth = this.bounds.width / 2 - padding;
    const halfHeight = this.bounds.height / 2 - padding;
    
    for (const body of this.bodies) {
      // Convert to center-relative coords for bounds check
      const relX = body.x;
      const relY = body.y;
      
      if (Math.abs(relX) > halfWidth) {
        body.x = Math.sign(relX) * halfWidth;
        body.vx *= -0.5; // Bounce
      }
      
      if (Math.abs(relY) > halfHeight) {
        body.y = Math.sign(relY) * halfHeight;
        body.vy *= -0.5; // Bounce
      }
    }
  }

  /**
   * Initialize body positions from current targets (useful on mode change)
   */
  resetToTargets() {
    for (const body of this.bodies) {
      body.x = body.targetX;
      body.y = body.targetY;
      body.vx = 0;
      body.vy = 0;
    }
  }

  /**
   * Add an impulse (external force) to all bodies
   */
  addImpulse(fx: number, fy: number) {
    for (const body of this.bodies) {
      body.vx += fx;
      body.vy += fy;
    }
  }

  /**
   * Add impulse to a specific body
   */
  addImpulseToBody(index: number, fx: number, fy: number) {
    if (this.bodies[index]) {
      this.bodies[index].vx += fx;
      this.bodies[index].vy += fy;
    }
  }

  /**
   * Create explosion effect - scatter stars outward then return
   */
  explode(strength: number = 5) {
    const { centerX, centerY } = this.bounds;
    
    for (const body of this.bodies) {
      const dx = body.x || 0.001;
      const dy = body.y || 0.001;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      body.vx += (dx / dist) * strength;
      body.vy += (dy / dist) * strength;
    }
  }

  /**
   * Create shake effect - random impulses
   */
  shake(intensity: number = 3) {
    for (const body of this.bodies) {
      body.vx += (Math.random() - 0.5) * intensity;
      body.vy += (Math.random() - 0.5) * intensity;
    }
  }

  /**
   * Apply a specific motion pattern to the Trinity stars
   * These patterns define unique, AI-switchable behaviors
   */
  applyMotionPattern(pattern: MotionPattern, time: number, params?: MotionParams) {
    const radius = Math.min(this.bounds.width, this.bounds.height) * 0.35;
    const trinityOffset = (Math.PI * 2) / 3; // 120° offset
    
    switch (pattern) {
      case 'TRIAD_SYNCHRONIZED':
        // All 3 stars rotate together in perfect formation
        this.applyTriadSynchronized(time, radius, trinityOffset, params);
        break;
      
      case 'DUAL_COUNTER_ROTATION':
        // Two stars orbit clockwise, one counter-clockwise
        this.applyDualCounterRotation(time, radius, params);
        break;
      
      case 'CENTRAL_ORBIT':
        // Two stars orbit around the third (gold NX as center)
        this.applyCentralOrbit(time, radius, params);
        break;
      
      case 'INDIVIDUAL_NOISE':
        // Each star moves independently with noise-based motion
        this.applyIndividualNoise(time, radius, params);
        break;
      
      case 'SEQUENCE_SCRIPTED':
        // Choreographed sequence that cycles through patterns
        this.applySequenceScripted(time, radius, trinityOffset, params);
        break;
    }
  }

  private applyTriadSynchronized(time: number, radius: number, offset: number, params?: MotionParams) {
    const speed = params?.speed ?? 0.015;
    const angle = time * speed;
    const orbitRadius = radius * (params?.orbitRadius ?? 0.6);
    
    for (let i = 0; i < 3; i++) {
      const starAngle = angle + offset * i;
      this.bodies[i].targetX = Math.cos(starAngle) * orbitRadius;
      this.bodies[i].targetY = Math.sin(starAngle) * orbitRadius * 0.8; // Slight vertical squash
    }
  }

  private applyDualCounterRotation(time: number, radius: number, params?: MotionParams) {
    const speed = params?.speed ?? 0.02;
    const orbitRadius = radius * (params?.orbitRadius ?? 0.6);
    
    // Stars 0 and 1 rotate clockwise
    const cwAngle = time * speed;
    this.bodies[0].targetX = Math.cos(cwAngle) * orbitRadius;
    this.bodies[0].targetY = Math.sin(cwAngle) * orbitRadius;
    
    this.bodies[1].targetX = Math.cos(cwAngle + Math.PI) * orbitRadius * 0.8;
    this.bodies[1].targetY = Math.sin(cwAngle + Math.PI) * orbitRadius * 0.8;
    
    // Star 2 rotates counter-clockwise at different speed
    const ccwAngle = -time * speed * 1.5;
    this.bodies[2].targetX = Math.cos(ccwAngle) * orbitRadius * 0.5;
    this.bodies[2].targetY = Math.sin(ccwAngle) * orbitRadius * 0.5;
  }

  private applyCentralOrbit(time: number, radius: number, params?: MotionParams) {
    const speed = params?.speed ?? 0.025;
    const centralStar = params?.centralStar ?? 2; // Gold NX as default center
    const orbitRadius = radius * (params?.orbitRadius ?? 0.7);
    
    // Central star stays mostly still with gentle pulse
    const pulse = Math.sin(time * 0.5) * 2;
    this.bodies[centralStar].targetX = pulse;
    this.bodies[centralStar].targetY = pulse * 0.5;
    
    // Other two stars orbit around central
    const orbiters = [0, 1, 2].filter(i => i !== centralStar);
    orbiters.forEach((starIdx, i) => {
      const orbitAngle = time * speed + i * Math.PI;
      this.bodies[starIdx].targetX = Math.cos(orbitAngle) * orbitRadius;
      this.bodies[starIdx].targetY = Math.sin(orbitAngle) * orbitRadius;
    });
  }

  private applyIndividualNoise(time: number, radius: number, params?: MotionParams) {
    const seed = params?.seed ?? 12345;
    const noiseScale = params?.noiseScale ?? 0.3;
    
    // Simple pseudo-random noise function
    const noise = (x: number, y: number) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
      return n - Math.floor(n);
    };
    
    for (let i = 0; i < 3; i++) {
      const offsetX = noise(time * 0.01 + i, i * 100) * 2 - 1;
      const offsetY = noise(i * 100, time * 0.01 + i) * 2 - 1;
      
      // Base positions with noise overlay
      const baseAngle = (Math.PI * 2 / 3) * i;
      const baseX = Math.cos(baseAngle) * radius * 0.4;
      const baseY = Math.sin(baseAngle) * radius * 0.4;
      
      this.bodies[i].targetX = baseX + offsetX * radius * noiseScale;
      this.bodies[i].targetY = baseY + offsetY * radius * noiseScale;
    }
  }

  private applySequenceScripted(time: number, radius: number, offset: number, params?: MotionParams) {
    // Cycle through different formations based on time
    const cycleDuration = params?.cycleDuration ?? 8; // seconds per phase
    const phase = Math.floor(time / cycleDuration) % 4;
    const phaseProgress = (time % cycleDuration) / cycleDuration;
    
    switch (phase) {
      case 0: // Triangle formation expanding
        for (let i = 0; i < 3; i++) {
          const angle = offset * i - Math.PI / 2;
          const r = radius * (0.3 + phaseProgress * 0.4);
          this.bodies[i].targetX = Math.cos(angle) * r;
          this.bodies[i].targetY = Math.sin(angle) * r;
        }
        break;
      
      case 1: // Vertical line formation
        for (let i = 0; i < 3; i++) {
          this.bodies[i].targetX = (i - 1) * radius * 0.3 * phaseProgress;
          this.bodies[i].targetY = (i - 1) * radius * 0.4 * (1 - phaseProgress);
        }
        break;
      
      case 2: // Horizontal wave
        for (let i = 0; i < 3; i++) {
          this.bodies[i].targetX = (i - 1) * radius * 0.5;
          this.bodies[i].targetY = Math.sin(time * 2 + i * 0.5) * radius * 0.3;
        }
        break;
      
      case 3: // Converge to center then expand
        const expandFactor = Math.sin(phaseProgress * Math.PI);
        for (let i = 0; i < 3; i++) {
          const angle = offset * i;
          this.bodies[i].targetX = Math.cos(angle) * radius * 0.3 * expandFactor;
          this.bodies[i].targetY = Math.sin(angle) * radius * 0.3 * expandFactor;
        }
        break;
    }
  }
}

// Motion pattern types
export type MotionPattern = 
  | 'TRIAD_SYNCHRONIZED'    // All 3 stars rotate together in formation
  | 'DUAL_COUNTER_ROTATION' // Two stars orbit opposite directions
  | 'CENTRAL_ORBIT'         // Two stars orbit around the third
  | 'INDIVIDUAL_NOISE'      // Each star moves independently with noise
  | 'SEQUENCE_SCRIPTED';    // Choreographed sequence of movements

// Motion pattern parameters
export interface MotionParams {
  speed?: number;           // Angular velocity multiplier
  orbitRadius?: number;     // Orbit radius as fraction of bounds (0-1)
  centralStar?: number;     // Index of central star for CENTRAL_ORBIT
  seed?: number;            // Random seed for INDIVIDUAL_NOISE
  noiseScale?: number;      // Noise amplitude for INDIVIDUAL_NOISE
  cycleDuration?: number;   // Seconds per phase for SEQUENCE_SCRIPTED
}

export const createTrinityPhysics = (config?: Partial<TrinityPhysicsConfig>) => {
  return new TrinityPhysics(config);
};

// Available motion patterns for AI Brain to choose from
export const MOTION_PATTERNS: MotionPattern[] = [
  'TRIAD_SYNCHRONIZED',
  'DUAL_COUNTER_ROTATION',
  'CENTRAL_ORBIT',
  'INDIVIDUAL_NOISE',
  'SEQUENCE_SCRIPTED'
];
