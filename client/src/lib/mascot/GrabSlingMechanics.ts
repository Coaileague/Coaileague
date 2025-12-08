/**
 * GrabSlingMechanics - Enhanced Grab and Sling System
 * 
 * Provides polished grab/drag mechanics for desktop and mobile with:
 * - 10% catch chance when attempting to grab the mascot
 * - Velocity tracking for realistic sling physics
 * - Touch and mouse event normalization
 * - Visual feedback for grab attempts
 * - Momentum-based release trajectory
 */

export interface GrabState {
  isGrabbing: boolean;
  hasCaught: boolean;
  grabStartTime: number;
  grabStartX: number;
  grabStartY: number;
  currentX: number;
  currentY: number;
  velocityX: number;
  velocityY: number;
  velocityHistory: { x: number; y: number; time: number }[];
  attemptCount: number;
  catchCount: number;
}

export interface SlingResult {
  caught: boolean;
  velocityX: number;
  velocityY: number;
  speed: number;
  angle: number;
}

export interface GrabConfig {
  catchChance: number;           // 0.1 = 10%
  grabRadius: number;            // Pixels from center to count as grab attempt
  velocitySmoothing: number;     // Number of samples to average
  minSlingSpeed: number;         // Minimum speed to count as sling
  maxSlingSpeed: number;         // Maximum sling velocity cap
  dragDamping: number;           // Friction during drag
  releaseBoost: number;          // Multiplier on release velocity
}

const DEFAULT_CONFIG: GrabConfig = {
  catchChance: 0.10,             // 10% catch chance
  grabRadius: 35,                // 35px grab area (center model only)
  velocitySmoothing: 5,          // Average last 5 samples
  minSlingSpeed: 3,              // Minimum 3 units for sling
  maxSlingSpeed: 25,             // Cap at 25 units
  dragDamping: 0.92,             // 8% friction per frame
  releaseBoost: 1.5              // 1.5x velocity on release
};

export type GrabEventType = 
  | 'grab_attempt'
  | 'grab_success'
  | 'grab_fail'
  | 'drag_move'
  | 'sling_release'
  | 'gentle_release';

export interface GrabEvent {
  type: GrabEventType;
  x: number;
  y: number;
  velocityX?: number;
  velocityY?: number;
  speed?: number;
  caught?: boolean;
}

export class GrabSlingMechanics {
  private state: GrabState;
  private config: GrabConfig;
  private lastUpdateTime: number = 0;
  private eventListeners: Map<GrabEventType, ((event: GrabEvent) => void)[]> = new Map();
  
  constructor(config: Partial<GrabConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }
  
  private createInitialState(): GrabState {
    return {
      isGrabbing: false,
      hasCaught: false,
      grabStartTime: 0,
      grabStartX: 0,
      grabStartY: 0,
      currentX: 0,
      currentY: 0,
      velocityX: 0,
      velocityY: 0,
      velocityHistory: [],
      attemptCount: 0,
      catchCount: 0
    };
  }
  
  /**
   * Attempt to grab the mascot at given position
   * Returns true if caught (10% chance), false otherwise
   */
  attemptGrab(
    pointerX: number, 
    pointerY: number, 
    mascotX: number, 
    mascotY: number
  ): boolean {
    const dx = pointerX - mascotX;
    const dy = pointerY - mascotY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Check if within grab radius
    if (distance > this.config.grabRadius) {
      return false;
    }
    
    this.state.attemptCount++;
    
    // Roll for catch chance (10%)
    const roll = Math.random();
    const caught = roll < this.config.catchChance;
    
    if (caught) {
      this.state.catchCount++;
      this.state.isGrabbing = true;
      this.state.hasCaught = true;
      this.state.grabStartTime = performance.now();
      this.state.grabStartX = pointerX;
      this.state.grabStartY = pointerY;
      this.state.currentX = pointerX;
      this.state.currentY = pointerY;
      this.state.velocityX = 0;
      this.state.velocityY = 0;
      this.state.velocityHistory = [];
      this.lastUpdateTime = performance.now();
      
      this.emit({
        type: 'grab_success',
        x: pointerX,
        y: pointerY,
        caught: true
      });
    } else {
      this.emit({
        type: 'grab_fail',
        x: pointerX,
        y: pointerY,
        caught: false
      });
    }
    
    this.emit({
      type: 'grab_attempt',
      x: pointerX,
      y: pointerY,
      caught
    });
    
    return caught;
  }
  
  /**
   * Update drag position and calculate velocity
   */
  updateDrag(pointerX: number, pointerY: number): void {
    if (!this.state.isGrabbing || !this.state.hasCaught) return;
    
    const now = performance.now();
    const dt = Math.max(1, now - this.lastUpdateTime);
    
    // Calculate instantaneous velocity
    const dx = pointerX - this.state.currentX;
    const dy = pointerY - this.state.currentY;
    const instantVelX = (dx / dt) * 16.67; // Normalize to 60fps
    const instantVelY = (dy / dt) * 16.67;
    
    // Add to velocity history
    this.state.velocityHistory.push({
      x: instantVelX,
      y: instantVelY,
      time: now
    });
    
    // Keep only recent samples
    while (this.state.velocityHistory.length > this.config.velocitySmoothing) {
      this.state.velocityHistory.shift();
    }
    
    // Update position
    this.state.currentX = pointerX;
    this.state.currentY = pointerY;
    this.lastUpdateTime = now;
    
    this.emit({
      type: 'drag_move',
      x: pointerX,
      y: pointerY,
      velocityX: instantVelX,
      velocityY: instantVelY
    });
  }
  
  /**
   * Release the grab and calculate sling trajectory
   */
  release(): SlingResult {
    if (!this.state.hasCaught) {
      return {
        caught: false,
        velocityX: 0,
        velocityY: 0,
        speed: 0,
        angle: 0
      };
    }
    
    // Calculate smoothed velocity from history
    let avgVelX = 0;
    let avgVelY = 0;
    
    if (this.state.velocityHistory.length > 0) {
      // Weight more recent samples higher
      let totalWeight = 0;
      for (let i = 0; i < this.state.velocityHistory.length; i++) {
        const weight = (i + 1) / this.state.velocityHistory.length;
        avgVelX += this.state.velocityHistory[i].x * weight;
        avgVelY += this.state.velocityHistory[i].y * weight;
        totalWeight += weight;
      }
      avgVelX /= totalWeight;
      avgVelY /= totalWeight;
    }
    
    // Apply release boost
    avgVelX *= this.config.releaseBoost;
    avgVelY *= this.config.releaseBoost;
    
    // Calculate speed
    const speed = Math.sqrt(avgVelX * avgVelX + avgVelY * avgVelY);
    const angle = Math.atan2(avgVelY, avgVelX);
    
    // Cap maximum speed
    let finalVelX = avgVelX;
    let finalVelY = avgVelY;
    if (speed > this.config.maxSlingSpeed) {
      const scale = this.config.maxSlingSpeed / speed;
      finalVelX *= scale;
      finalVelY *= scale;
    }
    
    const finalSpeed = Math.sqrt(finalVelX * finalVelX + finalVelY * finalVelY);
    const isSling = finalSpeed >= this.config.minSlingSpeed;
    
    // Emit appropriate event
    if (isSling) {
      this.emit({
        type: 'sling_release',
        x: this.state.currentX,
        y: this.state.currentY,
        velocityX: finalVelX,
        velocityY: finalVelY,
        speed: finalSpeed
      });
    } else {
      this.emit({
        type: 'gentle_release',
        x: this.state.currentX,
        y: this.state.currentY,
        velocityX: finalVelX,
        velocityY: finalVelY,
        speed: finalSpeed
      });
    }
    
    // Reset state
    this.state.isGrabbing = false;
    this.state.hasCaught = false;
    this.state.velocityHistory = [];
    
    return {
      caught: true,
      velocityX: finalVelX,
      velocityY: finalVelY,
      speed: finalSpeed,
      angle
    };
  }
  
  /**
   * Cancel grab without releasing (e.g., pointer left area)
   */
  cancel(): void {
    this.state.isGrabbing = false;
    this.state.hasCaught = false;
    this.state.velocityHistory = [];
  }
  
  /**
   * Get current grab state
   */
  getState(): Readonly<GrabState> {
    return { ...this.state };
  }
  
  /**
   * Check if currently grabbing
   */
  isGrabbing(): boolean {
    return this.state.isGrabbing && this.state.hasCaught;
  }
  
  /**
   * Get grab position offset from start
   */
  getDragOffset(): { x: number; y: number } {
    return {
      x: this.state.currentX - this.state.grabStartX,
      y: this.state.currentY - this.state.grabStartY
    };
  }
  
  /**
   * Get current velocity
   */
  getVelocity(): { x: number; y: number } {
    if (this.state.velocityHistory.length === 0) {
      return { x: 0, y: 0 };
    }
    
    const last = this.state.velocityHistory[this.state.velocityHistory.length - 1];
    return { x: last.x, y: last.y };
  }
  
  /**
   * Get grab statistics
   */
  getStats(): { attempts: number; catches: number; catchRate: number } {
    const attempts = this.state.attemptCount;
    const catches = this.state.catchCount;
    const catchRate = attempts > 0 ? catches / attempts : 0;
    
    return { attempts, catches, catchRate };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.state.attemptCount = 0;
    this.state.catchCount = 0;
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<GrabConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Subscribe to grab events
   */
  on(eventType: GrabEventType, callback: (event: GrabEvent) => void): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    };
  }
  
  private emit(event: GrabEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }
  
  /**
   * Handle pointer down event (unified for touch/mouse)
   */
  handlePointerDown(
    event: PointerEvent | TouchEvent | MouseEvent,
    canvasRect: DOMRect,
    mascotX: number,
    mascotY: number
  ): boolean {
    const pointer = this.getPointerPosition(event, canvasRect);
    return this.attemptGrab(pointer.x, pointer.y, mascotX, mascotY);
  }
  
  /**
   * Handle pointer move event
   */
  handlePointerMove(
    event: PointerEvent | TouchEvent | MouseEvent,
    canvasRect: DOMRect
  ): void {
    const pointer = this.getPointerPosition(event, canvasRect);
    this.updateDrag(pointer.x, pointer.y);
  }
  
  /**
   * Handle pointer up event
   */
  handlePointerUp(): SlingResult {
    return this.release();
  }
  
  /**
   * Normalize pointer position from various event types
   */
  private getPointerPosition(
    event: PointerEvent | TouchEvent | MouseEvent,
    canvasRect: DOMRect
  ): { x: number; y: number } {
    let clientX: number;
    let clientY: number;
    
    if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if ('changedTouches' in event && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else if ('clientX' in event) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      return { x: 0, y: 0 };
    }
    
    // Convert to canvas coordinates
    const scaleX = canvasRect.width / canvasRect.width; // In case of CSS scaling
    const scaleY = canvasRect.height / canvasRect.height;
    
    return {
      x: (clientX - canvasRect.left) * scaleX,
      y: (clientY - canvasRect.top) * scaleY
    };
  }
  
  /**
   * Create visual feedback data for grab attempt
   */
  getVisualFeedback(): {
    showAttempt: boolean;
    isHolding: boolean;
    dragTrail: { x: number; y: number }[];
    currentPos: { x: number; y: number };
  } {
    return {
      showAttempt: this.state.attemptCount > 0,
      isHolding: this.state.hasCaught && this.state.isGrabbing,
      dragTrail: this.state.velocityHistory.map(v => ({ x: v.x, y: v.y })),
      currentPos: { x: this.state.currentX, y: this.state.currentY }
    };
  }
}

// Export singleton for global use
export const grabSlingMechanics = new GrabSlingMechanics();
