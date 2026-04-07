/**
 * UIControlSubagent - Trinity's control layer for frontend UI components
 * 
 * Manages all frontend layers, effects, managers, and handlers through AI Brain orchestration:
 * - Floating Support Chat visibility
 * - Seasonal Effects Layer
 * - Animation contexts and effects
 * - Mobile handlers and responsive behavior
 * - Onboarding wizards and tours
 * - Notification overlays
 * 
 * Trinity can query state and issue commands to control any UI component.
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { platformEventBus } from '../platformEventBus';
import { log } from '../../vite';
import { createLogger } from '../../lib/logger';
const log = createLogger('uiControlSubagent');

interface UIComponentState {
  id: string;
  name: string;
  category: 'layer' | 'effect' | 'manager' | 'handler' | 'overlay';
  isVisible: boolean;
  isEnabled: boolean;
  config: Record<string, any>;
  lastUpdated: Date;
}

interface UIControlCommand {
  componentId: string;
  action: 'show' | 'hide' | 'enable' | 'disable' | 'configure' | 'reset';
  config?: Record<string, any>;
  reason?: string;
}

class UIControlSubagent {
  private componentRegistry: Map<string, UIComponentState> = new Map();
  private commandHistory: Array<{ command: UIControlCommand; timestamp: Date; success: boolean }> = [];

  constructor() {
    this.initializeDefaultComponents();
  }

  private initializeDefaultComponents() {
    const defaultComponents: UIComponentState[] = [
      {
        id: 'floating-support-chat',
        name: 'Floating Support Chat',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { showForGuests: true, showForAuthenticated: false },
        lastUpdated: new Date(),
      },
      {
        id: 'seasonal-effects-layer',
        name: 'Seasonal Effects Layer',
        category: 'layer',
        isVisible: true,
        isEnabled: true,
        config: { seasonId: 'default', effectsEnabled: true },
        lastUpdated: new Date(),
      },
      {
        id: 'animation-context',
        name: 'Universal Animation Context',
        category: 'manager',
        isVisible: true,
        isEnabled: true,
        config: { animationsEnabled: true, reducedMotion: false },
        lastUpdated: new Date(),
      },
      {
        id: 'mobile-handler',
        name: 'Universal Mobile Handler',
        category: 'handler',
        isVisible: true,
        isEnabled: true,
        config: { responsiveMode: 'auto', touchOptimized: true },
        lastUpdated: new Date(),
      },
      {
        id: 'onboarding-wizard',
        name: 'Onboarding Wizard',
        category: 'overlay',
        isVisible: false,
        isEnabled: true,
        config: { mobileResponsive: true, autoShow: true },
        lastUpdated: new Date(),
      },
      {
        id: 'trinity-mascot',
        name: 'Trinity Mascot',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { position: 'bottom-right', mood: 'idle' },
        lastUpdated: new Date(),
      },
      {
        id: 'notification-popover',
        name: 'Notification Popover',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { maxNotifications: 50, groupByType: true },
        lastUpdated: new Date(),
      },
      {
        id: 'command-palette',
        name: 'Command Palette',
        category: 'overlay',
        isVisible: false,
        isEnabled: true,
        config: { shortcut: 'Ctrl+K', fuzzySearch: true },
        lastUpdated: new Date(),
      },
      // Canvas Hub Architecture Components
      {
        id: 'canvas-hub-layer-manager',
        name: 'Canvas Hub Layer Manager',
        category: 'manager',
        isVisible: true,
        isEnabled: true,
        config: { 
          zIndexBase: 1000,
          stackingOrder: ['modal', 'sheet', 'dialog', 'popover', 'tooltip'],
          autoZIndex: true 
        },
        lastUpdated: new Date(),
      },
      {
        id: 'mobile-responsive-sheet',
        name: 'Mobile Responsive Sheet',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { 
          defaultSide: 'bottom',
          headerGradient: true,
          textOverflowHandling: 'truncate',
          useLayerManager: true
        },
        lastUpdated: new Date(),
      },
      {
        id: 'managed-dialog',
        name: 'Managed Dialog',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { 
          usesLayerManager: true,
          mobileFullscreen: true
        },
        lastUpdated: new Date(),
      },
      {
        id: 'responsive-dialog',
        name: 'Responsive Dialog',
        category: 'overlay',
        isVisible: true,
        isEnabled: true,
        config: { 
          sheetOnMobile: true,
          breakpoint: 768
        },
        lastUpdated: new Date(),
      },
      // Note: UniversalTransitionOverlay removed from registry - not needed for current phase
    ];

    defaultComponents.forEach(comp => this.componentRegistry.set(comp.id, comp));
    log.info(`[UIControlSubagent] Initialized with ${defaultComponents.length} UI components`);
  }

  /**
   * Get state of a specific UI component
   */
  getComponentState(componentId: string): UIComponentState | null {
    return this.componentRegistry.get(componentId) || null;
  }

  /**
   * Get all registered UI components
   */
  getAllComponents(): UIComponentState[] {
    return Array.from(this.componentRegistry.values());
  }

  /**
   * Get components by category
   */
  getComponentsByCategory(category: UIComponentState['category']): UIComponentState[] {
    return this.getAllComponents().filter(c => c.category === category);
  }

  /**
   * Execute a UI control command
   */
  async executeCommand(command: UIControlCommand): Promise<{ success: boolean; message: string; newState?: UIComponentState }> {
    const component = this.componentRegistry.get(command.componentId);
    
    if (!component) {
      return { success: false, message: `Component '${command.componentId}' not found` };
    }

    try {
      switch (command.action) {
        case 'show':
          component.isVisible = true;
          break;
        case 'hide':
          component.isVisible = false;
          break;
        case 'enable':
          component.isEnabled = true;
          break;
        case 'disable':
          component.isEnabled = false;
          break;
        case 'configure':
          if (command.config) {
            component.config = { ...component.config, ...command.config };
          }
          break;
        case 'reset':
          component.config = {};
          component.isVisible = true;
          component.isEnabled = true;
          break;
      }

      component.lastUpdated = new Date();
      this.componentRegistry.set(command.componentId, component);

      // Broadcast change to frontend via WebSocket
      platformEventBus.publish({
        type: 'ui_control_update',
        title: `UI Component ${command.action}: ${component.name}`,
        category: 'ai_brain',
        visibility: 'staff',
        data: {
          componentId: command.componentId,
          action: command.action,
          newState: component,
          reason: command.reason || 'Trinity AI command',
        },
      }).catch((err) => log.warn('[uiControlSubagent] Fire-and-forget failed:', err));

      this.commandHistory.push({
        command,
        timestamp: new Date(),
        success: true,
      });

      log.info(`[UIControlSubagent] Executed: ${command.action} on ${command.componentId}`);

      return {
        success: true,
        message: `Successfully executed '${command.action}' on '${component.name}'`,
        newState: component,
      };
    } catch (error) {
      this.commandHistory.push({
        command,
        timestamp: new Date(),
        success: false,
      });

      return {
        success: false,
        message: `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Batch execute multiple commands
   */
  async executeBatch(commands: UIControlCommand[]): Promise<{ results: Array<{ command: UIControlCommand; result: { success: boolean; message: string } }> }> {
    const results = await Promise.all(
      commands.map(async (command) => ({
        command,
        result: await this.executeCommand(command),
      }))
    );

    return { results };
  }

  /**
   * Get command history
   */
  getCommandHistory(limit: number = 50): typeof this.commandHistory {
    return this.commandHistory.slice(-limit);
  }

  /**
   * Register AI Brain actions for Trinity to control UI
   * DISABLED: Phase 2 cleanup - UI control not customer-facing MVP
   */
  registerActions() {
    // DISABLED: Phase 2 - All 11 UI control actions not MVP
    log.info('[UIControlSubagent] DISABLED: 11 UI control actions (Phase 2 cleanup - not MVP)');
    return; // Skip all UI action registrations
    
    /* DISABLED: Phase 2 - UI control not customer-facing MVP
    // List all UI components
    helpaiOrchestrator.registerAction({
      actionId: 'ui.list_components',
      name: 'List UI Components',
      category: 'system',
      description: 'List all registered UI components that Trinity can control',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async () => {
        const components = this.getAllComponents();
        return {
          success: true,
          components: components.map(c => ({
            id: c.id,
            name: c.name,
            category: c.category,
            isVisible: c.isVisible,
            isEnabled: c.isEnabled,
          })),
          count: components.length,
        };
      },
    });

    // Get component state
    helpaiOrchestrator.registerAction({
      actionId: 'ui.get_state',
      name: 'Get UI Component State',
      category: 'system',
      description: 'Get the current state of a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (params: { componentId: string }) => {
        const state = this.getComponentState(params.componentId);
        if (!state) {
          return { success: false, error: `Component '${params.componentId}' not found` };
        }
        return { success: true, state };
      },
    });

    // Show component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.show',
      name: 'Show UI Component',
      category: 'system',
      description: 'Show a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (params: { componentId: string; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'show',
          reason: params.reason,
        });
      },
    });

    // Hide component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.hide',
      name: 'Hide UI Component',
      category: 'system',
      description: 'Hide a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (params: { componentId: string; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'hide',
          reason: params.reason,
        });
      },
    });

    // Enable component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.enable',
      name: 'Enable UI Component',
      category: 'system',
      description: 'Enable a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (params: { componentId: string; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'enable',
          reason: params.reason,
        });
      },
    });

    // Disable component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.disable',
      name: 'Disable UI Component',
      category: 'system',
      description: 'Disable a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (params: { componentId: string; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'disable',
          reason: params.reason,
        });
      },
    });

    // Configure component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.configure',
      name: 'Configure UI Component',
      category: 'system',
      description: 'Update configuration of a UI component',
      requiredRoles: ['org_owner', 'co_owner', 'support_agent', 'sysop'],
      handler: async (params: { componentId: string; config: Record<string, any>; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'configure',
          config: params.config,
          reason: params.reason,
        });
      },
    });

    // Reset component
    helpaiOrchestrator.registerAction({
      actionId: 'ui.reset',
      name: 'Reset UI Component',
      category: 'system',
      description: 'Reset a UI component to default state',
      requiredRoles: ['org_owner', 'co_owner', 'support_agent', 'sysop'],
      handler: async (params: { componentId: string; reason?: string }) => {
        return this.executeCommand({
          componentId: params.componentId,
          action: 'reset',
          reason: params.reason,
        });
      },
    });

    // Batch command
    helpaiOrchestrator.registerAction({
      actionId: 'ui.batch',
      name: 'Batch UI Commands',
      category: 'system',
      description: 'Execute multiple UI commands at once',
      requiredRoles: ['org_owner', 'co_owner', 'support_agent', 'sysop'],
      handler: async (params: { commands: UIControlCommand[] }) => {
        return this.executeBatch(params.commands);
      },
    });

    // Get command history
    helpaiOrchestrator.registerAction({
      actionId: 'ui.history',
      name: 'UI Command History',
      category: 'system',
      description: 'Get recent UI control command history',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
      handler: async (params: { limit?: number }) => {
        return {
          success: true,
          history: this.getCommandHistory(params.limit || 50),
        };
      },
    });

    // Get components by category
    helpaiOrchestrator.registerAction({
      actionId: 'ui.by_category',
      name: 'Get UI Components by Category',
      category: 'system',
      description: 'Get UI components filtered by category (layer, effect, manager, handler, overlay)',
      requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
      handler: async (params: { category: UIComponentState['category'] }) => {
        const components = this.getComponentsByCategory(params.category);
        return {
          success: true,
          category: params.category,
          components,
          count: components.length,
        };
      },
    });

    log.info('[UIControlSubagent] Registered 11 UI control actions with AI Brain');
    */ // END DISABLED: Phase 2 - UI control actions
  }
}

export const uiControlSubagent = new UIControlSubagent();
