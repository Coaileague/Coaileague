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

const DEFAULT_CONFIG: TrinityPhysicsConfig = {
  repulsionStrength: 2.5,
  springStrength: 0.08,
  dampening: 0.85,
  minDistance: 12,
  maxSpeed: 8,
  bounceElasticity: 0.6
};

export class TrinityPhysics {
  private bodies: PhysicsBody[] = [];
  private config: TrinityPhysicsConfig;
  private bounds: { width: number; height: number; centerX: number; centerY: number };

  constructor(config: Partial<TrinityPhysicsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bounds = { width: 100, height: 100, centerX: 50, centerY: 50 };
    
    // Initialize 3 Trinity bodies with 120° offset positions (spread out initially)
    const initRadius = 15;
    const angles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
    this.bodies = angles.map((angle, i) => ({
      x: Math.cos(angle) * initRadius,
      y: Math.sin(angle) * initRadius,
      vx: 0,
      vy: 0,
      radius: 8,
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
}

export const createTrinityPhysics = (config?: Partial<TrinityPhysicsConfig>) => {
  return new TrinityPhysics(config);
};
