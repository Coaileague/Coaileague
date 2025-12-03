/**
 * UIAvoidanceSystem - Smart UI element detection and avoidance for mascot
 * 
 * Detects interactive UI elements and finds safe positions for the mascot:
 * - Buttons, links, form fields, navigation
 * - Modals, dialogs, popovers
 * - Fixed/sticky elements
 * - Keyboard focus areas
 * - ENHANCED: Heatmap-based danger zones for comprehensive coverage
 * - ENHANCED: White space detection for optimal mascot positioning
 */

export interface HeatmapCell {
  x: number;
  y: number;
  danger: number;
  types: Set<UIElementType>;
}

export interface HeatmapGrid {
  cells: HeatmapCell[][];
  cellSize: number;
  cols: number;
  rows: number;
}

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

// Detect mobile device for touch-friendly padding
const isMobile = typeof window !== 'undefined' && (
  window.matchMedia?.('(max-width: 768px)').matches || 
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0
);

// Mobile devices need larger touch target padding for accessibility
const MOBILE_PADDING_MULTIPLIER = 1.5;

const DEFAULT_CONFIG: AvoidanceConfig = {
  mascotSize: isMobile ? 60 : 80,
  scanInterval: 150, // Faster scanning for responsive UI avoidance
  minSafeDistance: isMobile ? 30 : 20, // Larger safe distance on mobile
  preferredEdge: 'any',
  avoidFixedElements: true,
  avoidFocusedElements: true,
  padding: {
    button: isMobile ? 25 : 15, // Touch targets need more space
    link: isMobile ? 20 : 12,
    input: isMobile ? 30 : 20,
    navigation: isMobile ? 35 : 25,
    modal: isMobile ? 50 : 40,
    default: isMobile ? 20 : 15
  }
};

const UI_SELECTORS: Record<UIElementType, string> = {
  button: 'button, [role="button"], input[type="submit"], input[type="button"], [data-testid*="button"], [data-testid*="btn"]',
  link: 'a[href], [role="link"], [data-testid*="link"]',
  input: 'input:not([type="hidden"]), textarea, select, [contenteditable="true"], [data-testid*="input"]',
  select: 'select, [role="listbox"], [role="combobox"], [data-testid*="select"]',
  form: 'form, [data-testid*="form"]',
  navigation: 'nav, [role="navigation"], header nav, .sidebar-nav, [data-testid*="nav"]',
  modal: '[role="dialog"], [role="alertdialog"], .modal, .dialog, [data-testid*="modal"], [data-testid*="dialog"]',
  dialog: 'dialog, [role="dialog"]',
  popover: '[role="menu"], [role="tooltip"], .popover, .dropdown-menu, [data-testid*="popover"], [data-testid*="dropdown"]',
  menu: '[role="menu"], [role="menubar"], .menu, [data-testid*="menu"]',
  sidebar: 'aside, [role="complementary"], .sidebar, [data-testid*="sidebar"]',
  header: 'header, [role="banner"], [data-testid*="header"]',
  footer: 'footer, [role="contentinfo"], [data-testid*="footer"]',
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
  private heatmap: HeatmapGrid | null = null;
  private heatmapCellSize = 40;
  
  private mousePosition: MascotPosition = { x: -1000, y: -1000 };
  private mouseAvoidanceRadius = 120;
  private seasonalElements: UIElement[] = [];

  constructor(config: Partial<AvoidanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  updateMousePosition(x: number, y: number): void {
    this.mousePosition = { x, y };
  }
  
  getMousePosition(): MascotPosition {
    return this.mousePosition;
  }
  
  isNearMouse(position: MascotPosition, threshold?: number): boolean {
    const radius = threshold || this.mouseAvoidanceRadius;
    const dx = position.x - this.mousePosition.x;
    const dy = position.y - this.mousePosition.y;
    return Math.sqrt(dx * dx + dy * dy) < radius;
  }
  
  getAvoidanceVectorFromMouse(position: MascotPosition): { x: number, y: number } {
    const dx = position.x - this.mousePosition.x;
    const dy = position.y - this.mousePosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < this.mouseAvoidanceRadius && distance > 0) {
      const force = (this.mouseAvoidanceRadius - distance) / this.mouseAvoidanceRadius;
      return {
        x: (dx / distance) * force * 50,
        y: (dy / distance) * force * 50
      };
    }
    return { x: 0, y: 0 };
  }
  
  scanSeasonalDecorations(): void {
    this.seasonalElements = [];
    
    const seasonalSelectors = [
      '[data-seasonal]',
      '[data-testid*="santa"]',
      '[data-testid*="snowflake"]',
      '[data-testid*="christmas"]',
      '[data-testid*="seasonal"]',
      '.seasonal-decoration',
      '.santa-decoration',
      '.snowflake',
      '.christmas-decoration',
      'canvas[data-seasonal-effects]',
      '[class*="seasonal"]',
      '[class*="snowflake"]',
      '[class*="santa"]'
    ];
    
    for (const selector of seasonalSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el) => {
          if (this.isElementVisible(el as HTMLElement)) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              this.seasonalElements.push({
                id: `seasonal-${Date.now()}-${Math.random()}`,
                type: 'fixed',
                rect,
                priority: 75,
                padding: 40
              });
            }
          }
        });
      } catch (e) {
        // Ignore invalid selectors
      }
    }
  }
  
  isNearSeasonalDecoration(position: MascotPosition, padding = 50): boolean {
    const mascotSize = this.config.mascotSize;
    
    for (const el of this.seasonalElements) {
      const elLeft = el.rect.left - padding;
      const elRight = el.rect.right + padding;
      const elTop = el.rect.top - padding;
      const elBottom = el.rect.bottom + padding;
      
      if (
        position.x + mascotSize > elLeft &&
        position.x < elRight &&
        position.y + mascotSize > elTop &&
        position.y < elBottom
      ) {
        return true;
      }
    }
    return false;
  }
  
  getSeasonalElements(): UIElement[] {
    return this.seasonalElements;
  }

  generateHeatmap(): HeatmapGrid {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cellSize = this.heatmapCellSize;
    const cols = Math.ceil(viewportWidth / cellSize);
    const rows = Math.ceil(viewportHeight / cellSize);
    
    const cells: HeatmapCell[][] = [];
    
    for (let row = 0; row < rows; row++) {
      cells[row] = [];
      for (let col = 0; col < cols; col++) {
        cells[row][col] = {
          x: col * cellSize,
          y: row * cellSize,
          danger: 0,
          types: new Set()
        };
      }
    }
    
    for (const el of this.elements) {
      const startCol = Math.max(0, Math.floor((el.rect.left - el.padding) / cellSize));
      const endCol = Math.min(cols - 1, Math.ceil((el.rect.right + el.padding) / cellSize));
      const startRow = Math.max(0, Math.floor((el.rect.top - el.padding) / cellSize));
      const endRow = Math.min(rows - 1, Math.ceil((el.rect.bottom + el.padding) / cellSize));
      
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          if (cells[row] && cells[row][col]) {
            cells[row][col].danger = Math.max(cells[row][col].danger, el.priority / 100);
            cells[row][col].types.add(el.type);
          }
        }
      }
    }
    
    this.heatmap = { cells, cellSize, cols, rows };
    return this.heatmap;
  }

  getHeatmap(): HeatmapGrid | null {
    return this.heatmap;
  }

  getDangerAt(x: number, y: number): number {
    if (!this.heatmap) {
      this.generateHeatmap();
    }
    if (!this.heatmap) return 0;
    
    const col = Math.floor(x / this.heatmap.cellSize);
    const row = Math.floor(y / this.heatmap.cellSize);
    
    if (row >= 0 && row < this.heatmap.rows && col >= 0 && col < this.heatmap.cols) {
      return this.heatmap.cells[row][col].danger;
    }
    return 0;
  }

  findWhiteSpace(): SafeZone[] {
    if (!this.heatmap) {
      this.generateHeatmap();
    }
    if (!this.heatmap) return [];
    
    const safeZones: SafeZone[] = [];
    const visited = new Set<string>();
    
    for (let row = 0; row < this.heatmap.rows; row++) {
      for (let col = 0; col < this.heatmap.cols; col++) {
        const key = `${row},${col}`;
        if (visited.has(key)) continue;
        
        const cell = this.heatmap.cells[row][col];
        if (cell.danger < 0.2) {
          const zone = this.floodFillSafeZone(row, col, visited);
          if (zone.width >= this.config.mascotSize && zone.height >= this.config.mascotSize) {
            safeZones.push(zone);
          }
        } else {
          visited.add(key);
        }
      }
    }
    
    return safeZones.sort((a, b) => b.score - a.score);
  }

  private floodFillSafeZone(startRow: number, startCol: number, visited: Set<string>): SafeZone {
    if (!this.heatmap) {
      return { x: 0, y: 0, width: 0, height: 0, score: 0 };
    }
    
    let minCol = startCol, maxCol = startCol;
    let minRow = startRow, maxRow = startRow;
    const queue: [number, number][] = [[startRow, startCol]];
    let totalDanger = 0;
    let cellCount = 0;
    
    while (queue.length > 0) {
      const [row, col] = queue.shift()!;
      const key = `${row},${col}`;
      
      if (visited.has(key)) continue;
      if (row < 0 || row >= this.heatmap.rows || col < 0 || col >= this.heatmap.cols) continue;
      
      const cell = this.heatmap.cells[row][col];
      if (cell.danger >= 0.3) continue;
      
      visited.add(key);
      totalDanger += cell.danger;
      cellCount++;
      
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      
      queue.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]);
    }
    
    const x = minCol * this.heatmap.cellSize;
    const y = minRow * this.heatmap.cellSize;
    const width = (maxCol - minCol + 1) * this.heatmap.cellSize;
    const height = (maxRow - minRow + 1) * this.heatmap.cellSize;
    
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const edgeBonus = Math.min(centerX, centerY, viewportWidth - centerX, viewportHeight - centerY) / 100;
    const sizeBonus = (width * height) / 10000;
    const safetyScore = cellCount > 0 ? (1 - totalDanger / cellCount) : 0;
    
    return {
      x,
      y,
      width,
      height,
      score: safetyScore * 50 + sizeBonus * 30 + edgeBonus * 20
    };
  }

  findBestPositionInWhiteSpace(): MascotPosition | null {
    const whiteSpaces = this.findWhiteSpace();
    if (whiteSpaces.length === 0) return null;
    
    const bestZone = whiteSpaces[0];
    const mascotSize = this.config.mascotSize;
    
    const preferCorners = true;
    let x: number, y: number;
    
    if (preferCorners) {
      const corners = [
        { x: bestZone.x + 10, y: bestZone.y + 10 },
        { x: bestZone.x + bestZone.width - mascotSize - 10, y: bestZone.y + 10 },
        { x: bestZone.x + 10, y: bestZone.y + bestZone.height - mascotSize - 10 },
        { x: bestZone.x + bestZone.width - mascotSize - 10, y: bestZone.y + bestZone.height - mascotSize - 10 }
      ];
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      let bestCorner = corners[0];
      let bestDistance = Infinity;
      
      for (const corner of corners) {
        if (corner.x < 0 || corner.y < 0 || 
            corner.x > viewportWidth - mascotSize || 
            corner.y > viewportHeight - mascotSize) continue;
        
        const edgeDistance = Math.min(
          corner.x, corner.y,
          viewportWidth - corner.x - mascotSize,
          viewportHeight - corner.y - mascotSize
        );
        
        if (edgeDistance < bestDistance && this.isPositionSafe({ x: corner.x, y: corner.y })) {
          bestDistance = edgeDistance;
          bestCorner = corner;
        }
      }
      
      x = bestCorner.x;
      y = bestCorner.y;
    } else {
      x = bestZone.x + (bestZone.width - mascotSize) / 2;
      y = bestZone.y + (bestZone.height - mascotSize) / 2;
    }
    
    return {
      x: Math.max(10, Math.min(x, window.innerWidth - mascotSize - 10)),
      y: Math.max(10, Math.min(y, window.innerHeight - mascotSize - 10))
    };
  }

  start(): void {
    this.scanElements();
    this.scanSeasonalDecorations();
    this.setupMutationObserver();
    
    this.scanIntervalId = window.setInterval(() => {
      this.scanElements();
      this.scanSeasonalDecorations();
    }, this.config.scanInterval);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    document.addEventListener('focusin', this.handleFocusChange);
    document.addEventListener('focusout', this.handleFocusChange);
    document.addEventListener('mousemove', this.handleMouseMove, { passive: true });
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
    document.removeEventListener('mousemove', this.handleMouseMove);
  }
  
  private handleMouseMove = (e: MouseEvent): void => {
    this.mousePosition = { x: e.clientX, y: e.clientY };
  };

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
    
    this.generateHeatmap();
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
    if (this.isNearMouse(pos)) {
      return false;
    }
    
    if (this.isNearSeasonalDecoration(pos)) {
      return false;
    }
    
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
