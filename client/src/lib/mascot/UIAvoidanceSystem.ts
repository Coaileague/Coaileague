/**
 * UIAvoidanceSystem - Smart UI element detection and avoidance for mascot
 * 
 * Detects interactive UI elements and finds safe positions for the mascot:
 * - Buttons, links, form fields, navigation
 * - Modals, dialogs, popovers
 * - Fixed/sticky elements
 * - Keyboard focus areas
 */

export interface UIElement {
  id: string;
  type: UIElementType;
  rect: DOMRect;
  priority: number;
  padding: number;
}

export type UIElementType = 
  | 'button'
  | 'link'
  | 'input'
  | 'select'
  | 'form'
  | 'navigation'
  | 'modal'
  | 'dialog'
  | 'popover'
  | 'menu'
  | 'sidebar'
  | 'header'
  | 'footer'
  | 'fixed'
  | 'sticky'
  | 'focusable';

export interface SafeZone {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

export interface MascotPosition {
  x: number;
  y: number;
}

export interface AvoidanceConfig {
  mascotSize: number;
  scanInterval: number;
  minSafeDistance: number;
  preferredEdge: 'any' | 'left' | 'right' | 'top' | 'bottom';
  avoidFixedElements: boolean;
  avoidFocusedElements: boolean;
  padding: {
    button: number;
    link: number;
    input: number;
    navigation: number;
    modal: number;
    default: number;
  };
}

const DEFAULT_CONFIG: AvoidanceConfig = {
  mascotSize: 80,
  scanInterval: 200,
  minSafeDistance: 20,
  preferredEdge: 'any',
  avoidFixedElements: true,
  avoidFocusedElements: true,
  padding: {
    button: 15,
    link: 12,
    input: 20,
    navigation: 25,
    modal: 40,
    default: 15
  }
};

const UI_SELECTORS: Record<UIElementType, string> = {
  button: 'button, [role="button"], input[type="submit"], input[type="button"]',
  link: 'a[href], [role="link"]',
  input: 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]',
  select: 'select, [role="listbox"], [role="combobox"]',
  form: 'form',
  navigation: 'nav, [role="navigation"], header nav, .sidebar-nav',
  modal: '[role="dialog"], [role="alertdialog"], .modal, .dialog',
  dialog: 'dialog, [role="dialog"]',
  popover: '[role="menu"], [role="tooltip"], .popover, .dropdown-menu',
  menu: '[role="menu"], [role="menubar"], .menu',
  sidebar: 'aside, [role="complementary"], .sidebar',
  header: 'header, [role="banner"]',
  footer: 'footer, [role="contentinfo"]',
  fixed: '[style*="position: fixed"], [style*="position:fixed"]',
  sticky: '[style*="position: sticky"], [style*="position:sticky"], .sticky',
  focusable: ':focus, :focus-within'
};

const PRIORITY_MAP: Record<UIElementType, number> = {
  modal: 100,
  dialog: 100,
  popover: 90,
  menu: 85,
  focusable: 80,
  input: 70,
  select: 70,
  form: 60,
  button: 50,
  link: 45,
  navigation: 40,
  header: 30,
  footer: 30,
  sidebar: 25,
  fixed: 20,
  sticky: 15
};

class UIAvoidanceSystem {
  private config: AvoidanceConfig;
  private elements: UIElement[] = [];
  private scanIntervalId: number | null = null;
  private observers: Set<MutationObserver> = new Set();
  private lastScanTime = 0;
  private currentPosition: MascotPosition = { x: 0, y: 0 };
  private listeners: Set<(position: MascotPosition) => void> = new Set();

  constructor(config: Partial<AvoidanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    this.scanElements();
    this.setupMutationObserver();
    
    this.scanIntervalId = window.setInterval(() => {
      this.scanElements();
    }, this.config.scanInterval);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    document.addEventListener('focusin', this.handleFocusChange);
    document.addEventListener('focusout', this.handleFocusChange);
  }

  stop(): void {
    if (this.scanIntervalId) {
      window.clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }
    
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('focusin', this.handleFocusChange);
    document.removeEventListener('focusout', this.handleFocusChange);
  }

  private handleResize = (): void => {
    this.scanElements();
  };

  private handleScroll = (): void => {
    const now = Date.now();
    if (now - this.lastScanTime > 100) {
      this.scanElements();
      this.lastScanTime = now;
    }
  };

  private handleFocusChange = (): void => {
    this.scanElements();
    const newPosition = this.findSafePosition(this.currentPosition);
    if (this.shouldMove(newPosition)) {
      this.currentPosition = newPosition;
      this.notifyListeners(newPosition);
    }
  };

  private setupMutationObserver(): void {
    const observer = new MutationObserver(() => {
      this.scanElements();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'disabled']
    });
    
    this.observers.add(observer);
  }

  scanElements(): void {
    this.elements = [];
    
    for (const [type, selector] of Object.entries(UI_SELECTORS)) {
      try {
        const nodeList = document.querySelectorAll(selector);
        nodeList.forEach((el) => {
          if (this.isElementVisible(el as HTMLElement)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              this.elements.push({
                id: this.getElementId(el as HTMLElement),
                type: type as UIElementType,
                rect,
                priority: PRIORITY_MAP[type as UIElementType],
                padding: this.getPadding(type as UIElementType)
              });
            }
          }
        });
      } catch {
        // Ignore invalid selectors
      }
    }

    this.addComputedFixedElements();
    this.elements.sort((a, b) => b.priority - a.priority);
  }

  private addComputedFixedElements(): void {
    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const type = style.position === 'fixed' ? 'fixed' : 'sticky';
          const exists = this.elements.some(e => 
            e.rect.left === rect.left && 
            e.rect.top === rect.top &&
            e.rect.width === rect.width
          );
          if (!exists) {
            this.elements.push({
              id: this.getElementId(el as HTMLElement),
              type,
              rect,
              priority: PRIORITY_MAP[type],
              padding: this.config.padding.default
            });
          }
        }
      }
    });
  }

  private isElementVisible(el: HTMLElement): boolean {
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
      return false;
    }
    
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
      return false;
    }
    
    return true;
  }

  private getElementId(el: HTMLElement): string {
    return el.id || el.getAttribute('data-testid') || 
           `${el.tagName.toLowerCase()}-${el.className.slice(0, 20)}`;
  }

  private getPadding(type: UIElementType): number {
    return this.config.padding[type as keyof typeof this.config.padding] || 
           this.config.padding.default;
  }

  isPositionSafe(pos: MascotPosition): boolean {
    const mascotRect = {
      left: pos.x,
      top: pos.y,
      right: pos.x + this.config.mascotSize,
      bottom: pos.y + this.config.mascotSize
    };

    for (const el of this.elements) {
      const elRect = {
        left: el.rect.left - el.padding,
        top: el.rect.top - el.padding,
        right: el.rect.right + el.padding,
        bottom: el.rect.bottom + el.padding
      };

      if (this.rectsOverlap(mascotRect, elRect)) {
        return false;
      }
    }

    return true;
  }

  private rectsOverlap(
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
  ): boolean {
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  findSafePosition(currentPos: MascotPosition): MascotPosition {
    if (this.isPositionSafe(currentPos)) {
      return currentPos;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const safeZones = this.findSafeZones();
    
    if (safeZones.length === 0) {
      return this.findEdgePosition(currentPos, viewportWidth, viewportHeight);
    }

    let bestZone = safeZones[0];
    let bestScore = -Infinity;

    for (const zone of safeZones) {
      const centerX = zone.x + zone.width / 2;
      const centerY = zone.y + zone.height / 2;
      const distance = Math.sqrt(
        Math.pow(centerX - currentPos.x, 2) + 
        Math.pow(centerY - currentPos.y, 2)
      );
      
      const score = zone.score * 100 - distance * 0.5 + 
                    (zone.width * zone.height) * 0.001;
      
      if (score > bestScore) {
        bestScore = score;
        bestZone = zone;
      }
    }

    return {
      x: Math.max(10, Math.min(bestZone.x + (bestZone.width - this.config.mascotSize) / 2, viewportWidth - this.config.mascotSize - 10)),
      y: Math.max(10, Math.min(bestZone.y + (bestZone.height - this.config.mascotSize) / 2, viewportHeight - this.config.mascotSize - 10))
    };
  }

  private findSafeZones(): SafeZone[] {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gridSize = 60;
    const zones: SafeZone[] = [];

    for (let y = 10; y < viewportHeight - this.config.mascotSize - 10; y += gridSize) {
      for (let x = 10; x < viewportWidth - this.config.mascotSize - 10; x += gridSize) {
        const testPos = { x, y };
        if (this.isPositionSafe(testPos)) {
          const nearestElement = this.findNearestElement(testPos);
          const edgeDistance = Math.min(x, y, viewportWidth - x, viewportHeight - y);
          
          zones.push({
            x,
            y,
            width: gridSize,
            height: gridSize,
            score: (nearestElement?.distance || 1000) * 0.5 + edgeDistance * 0.3
          });
        }
      }
    }

    return zones.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  private findNearestElement(pos: MascotPosition): { element: UIElement; distance: number } | null {
    let nearest: UIElement | null = null;
    let minDistance = Infinity;

    for (const el of this.elements) {
      const centerX = el.rect.left + el.rect.width / 2;
      const centerY = el.rect.top + el.rect.height / 2;
      const distance = Math.sqrt(
        Math.pow(centerX - pos.x, 2) + 
        Math.pow(centerY - pos.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = el;
      }
    }

    return nearest ? { element: nearest, distance: minDistance } : null;
  }

  private findEdgePosition(
    currentPos: MascotPosition,
    viewportWidth: number,
    viewportHeight: number
  ): MascotPosition {
    const margin = 20;
    const positions: MascotPosition[] = [
      { x: margin, y: currentPos.y },
      { x: viewportWidth - this.config.mascotSize - margin, y: currentPos.y },
      { x: currentPos.x, y: margin },
      { x: currentPos.x, y: viewportHeight - this.config.mascotSize - margin },
      { x: margin, y: margin },
      { x: viewportWidth - this.config.mascotSize - margin, y: margin },
      { x: margin, y: viewportHeight - this.config.mascotSize - margin },
      { x: viewportWidth - this.config.mascotSize - margin, y: viewportHeight - this.config.mascotSize - margin }
    ];

    for (const pos of positions) {
      if (this.isPositionSafe(pos)) {
        return pos;
      }
    }

    return { x: margin, y: viewportHeight - this.config.mascotSize - margin };
  }

  private shouldMove(newPos: MascotPosition): boolean {
    const dx = Math.abs(newPos.x - this.currentPosition.x);
    const dy = Math.abs(newPos.y - this.currentPosition.y);
    return dx > 10 || dy > 10;
  }

  getElements(): UIElement[] {
    return [...this.elements];
  }

  getZones(): SafeZone[] {
    return this.findSafeZones();
  }

  checkCollision(rect: DOMRect): boolean {
    const testRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };

    for (const el of this.elements) {
      if (el.priority < 40) continue;
      
      const elRect = {
        left: el.rect.left - el.padding,
        top: el.rect.top - el.padding,
        right: el.rect.right + el.padding,
        bottom: el.rect.bottom + el.padding
      };

      if (this.rectsOverlap(testRect, elRect)) {
        return true;
      }
    }

    return false;
  }

  getObstructingElements(pos: MascotPosition): UIElement[] {
    const mascotRect = {
      left: pos.x,
      top: pos.y,
      right: pos.x + this.config.mascotSize,
      bottom: pos.y + this.config.mascotSize
    };

    return this.elements.filter(el => {
      const elRect = {
        left: el.rect.left - el.padding,
        top: el.rect.top - el.padding,
        right: el.rect.right + el.padding,
        bottom: el.rect.bottom + el.padding
      };
      return this.rectsOverlap(mascotRect, elRect);
    });
  }

  subscribe(listener: (position: MascotPosition) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(position: MascotPosition): void {
    this.listeners.forEach(listener => listener(position));
  }

  setCurrentPosition(pos: MascotPosition): void {
    this.currentPosition = pos;
  }

  updateConfig(config: Partial<AvoidanceConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const uiAvoidanceSystem = new UIAvoidanceSystem();
export default uiAvoidanceSystem;
