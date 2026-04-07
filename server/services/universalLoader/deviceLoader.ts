/**
 * Universal Device Loader
 * 
 * Detects device capabilities and loads optimized settings for:
 * - Desktop (full animations, high quality graphics)
 * - Tablet (balanced performance)
 * - Mobile (optimized for touch, reduced animations)
 */

import { db } from '../../db';
import { userDeviceProfiles, type UserDeviceProfile, type InsertUserDeviceProfile } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('deviceLoader');


export interface DeviceCapabilities {
  deviceType: 'desktop' | 'tablet' | 'mobile';
  platform: string;
  browser: string;
  browserVersion: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  touchSupport: boolean;
  cpuCores?: number;
  memoryGb?: number;
  connectionType?: string;
}

export interface OptimizedSettings {
  // Animation settings
  animationDensity: 'full' | 'reduced' | 'minimal' | 'none';
  animationFps: number;
  enableParticles: boolean;
  enableTransitions: boolean;
  
  // Graphics settings
  imageQuality: 'high' | 'medium' | 'low';
  enableBlur: boolean;
  enableShadows: boolean;
  
  // Layout settings
  compactMode: boolean;
  touchOptimized: boolean;
  minTapTargetSize: number;
  
  // Performance settings
  prefetchEnabled: boolean;
  lazyLoadThreshold: number;
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
  
  // Trinity mascot settings
  trinitySize: number;
  trinityAnimationLevel: 'full' | 'reduced' | 'static';
  trinityIdleDelay: number;
  
  // Quick Fix Console settings
  quickFixCompactCards: boolean;
  quickFixShowDescriptions: boolean;
  quickFixAutoRefresh: boolean;
}

export interface LoaderResult {
  capabilities: DeviceCapabilities;
  settings: OptimizedSettings;
  profileId?: string;
  cached: boolean;
}

class UniversalDeviceLoader {
  private settingsCache: Map<string, { settings: OptimizedSettings; expiresAt: Date }> = new Map();
  
  /**
   * Parse user agent to detect device capabilities
   */
  parseUserAgent(userAgent: string): Partial<DeviceCapabilities> {
    const ua = userAgent.toLowerCase();
    
    // Detect platform
    let platform = 'unknown';
    if (ua.includes('windows')) platform = 'windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) platform = 'macos';
    else if (ua.includes('iphone') || ua.includes('ipad')) platform = 'ios';
    else if (ua.includes('android')) platform = 'android';
    else if (ua.includes('linux')) platform = 'linux';
    
    // Detect browser
    let browser = 'unknown';
    let browserVersion = '';
    
    if (ua.includes('chrome/')) {
      browser = 'chrome';
      const match = ua.match(/chrome\/(\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('firefox/')) {
      browser = 'firefox';
      const match = ua.match(/firefox\/(\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('safari/') && !ua.includes('chrome')) {
      browser = 'safari';
      const match = ua.match(/version\/(\d+)/);
      if (match) browserVersion = match[1];
    } else if (ua.includes('edg/')) {
      browser = 'edge';
      const match = ua.match(/edg\/(\d+)/);
      if (match) browserVersion = match[1];
    }
    
    // Detect device type
    let deviceType: 'desktop' | 'tablet' | 'mobile' = 'desktop';
    if (ua.includes('mobile') || ua.includes('iphone')) {
      deviceType = 'mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      deviceType = 'tablet';
    }
    
    // Touch support detection
    const touchSupport = deviceType !== 'desktop' || 
                         ua.includes('touch') || 
                         platform === 'ios' || 
                         platform === 'android';
    
    return {
      platform,
      browser,
      browserVersion,
      deviceType,
      touchSupport,
    };
  }
  
  /**
   * Get optimized settings for device capabilities
   */
  getOptimizedSettings(capabilities: DeviceCapabilities): OptimizedSettings {
    const { deviceType, cpuCores, memoryGb, connectionType } = capabilities;
    
    // Base settings by device type
    const baseSettings: Record<string, OptimizedSettings> = {
      desktop: {
        animationDensity: 'full',
        animationFps: 60,
        enableParticles: true,
        enableTransitions: true,
        imageQuality: 'high',
        enableBlur: true,
        enableShadows: true,
        compactMode: false,
        touchOptimized: false,
        minTapTargetSize: 24,
        prefetchEnabled: true,
        lazyLoadThreshold: 500,
        cacheStrategy: 'aggressive',
        trinitySize: 100,
        trinityAnimationLevel: 'full',
        trinityIdleDelay: 3000,
        quickFixCompactCards: false,
        quickFixShowDescriptions: true,
        quickFixAutoRefresh: true,
      },
      tablet: {
        animationDensity: 'reduced',
        animationFps: 30,
        enableParticles: true,
        enableTransitions: true,
        imageQuality: 'medium',
        enableBlur: true,
        enableShadows: true,
        compactMode: false,
        touchOptimized: true,
        minTapTargetSize: 44,
        prefetchEnabled: true,
        lazyLoadThreshold: 300,
        cacheStrategy: 'moderate',
        trinitySize: 80,
        trinityAnimationLevel: 'reduced',
        trinityIdleDelay: 4000,
        quickFixCompactCards: false,
        quickFixShowDescriptions: true,
        quickFixAutoRefresh: true,
      },
      mobile: {
        animationDensity: 'minimal',
        animationFps: 12,
        enableParticles: false,
        enableTransitions: true,
        imageQuality: 'medium',
        enableBlur: false,
        enableShadows: false,
        compactMode: true,
        touchOptimized: true,
        minTapTargetSize: 48,
        prefetchEnabled: false,
        lazyLoadThreshold: 200,
        cacheStrategy: 'minimal',
        trinitySize: 60,
        trinityAnimationLevel: 'reduced',
        trinityIdleDelay: 5000,
        quickFixCompactCards: true,
        quickFixShowDescriptions: false,
        quickFixAutoRefresh: false,
      },
    };
    
    const settings = { ...baseSettings[deviceType] };
    
    // Adjust based on hardware if available
    if (cpuCores && cpuCores < 4) {
      settings.animationDensity = 'reduced';
      settings.enableParticles = false;
    }
    
    if (memoryGb && memoryGb < 4) {
      settings.cacheStrategy = 'minimal';
      settings.prefetchEnabled = false;
    }
    
    // Adjust for slow connections
    if (connectionType && ['2g', '3g', 'slow-2g'].includes(connectionType)) {
      settings.imageQuality = 'low';
      settings.prefetchEnabled = false;
      settings.animationDensity = 'minimal';
    }
    
    return settings;
  }
  
  /**
   * Load or create device profile for a user
   */
  async loadDeviceProfile(
    userId: string,
    clientCapabilities: DeviceCapabilities
  ): Promise<LoaderResult> {
    // Check cache first
    const cacheKey = `${userId}-${clientCapabilities.deviceType}`;
    const cached = this.settingsCache.get(cacheKey);
    
    if (cached && cached.expiresAt > new Date()) {
      return {
        capabilities: clientCapabilities,
        settings: cached.settings,
        cached: true,
      };
    }
    
    // Generate optimized settings
    const settings = this.getOptimizedSettings(clientCapabilities);
    
    // Try to save profile
    try {
      const fingerprint = this.generateFingerprint(clientCapabilities);
      
      // Check for existing profile
      const existing = await db
        .select()
        .from(userDeviceProfiles)
        .where(
          and(
            eq(userDeviceProfiles.userId, userId),
            eq(userDeviceProfiles.deviceFingerprint, fingerprint)
          )
        );
      
      if (existing.length > 0) {
        // Update last seen
        await db
          .update(userDeviceProfiles)
          .set({ lastSeenAt: new Date(), optimizedSettings: settings })
          .where(eq(userDeviceProfiles.id, existing[0].id));
        
        // Cache the settings
        this.settingsCache.set(cacheKey, {
          settings,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min cache
        });
        
        return {
          capabilities: clientCapabilities,
          settings,
          profileId: existing[0].id,
          cached: false,
        };
      }
      
      // Create new profile
      const profileId = crypto.randomUUID();
      await db.insert(userDeviceProfiles).values({
        id: profileId,
        userId,
        deviceFingerprint: fingerprint,
        deviceType: clientCapabilities.deviceType,
        platform: clientCapabilities.platform,
        browser: clientCapabilities.browser,
        browserVersion: clientCapabilities.browserVersion,
        screenWidth: clientCapabilities.screenWidth,
        screenHeight: clientCapabilities.screenHeight,
        devicePixelRatio: clientCapabilities.devicePixelRatio,
        touchSupport: clientCapabilities.touchSupport,
        cpuCores: clientCapabilities.cpuCores,
        memoryGb: clientCapabilities.memoryGb,
        connectionType: clientCapabilities.connectionType,
        optimizedSettings: settings,
        settingsVersion: 1,
      });
      
      // Cache the settings
      this.settingsCache.set(cacheKey, {
        settings,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });
      
      return {
        capabilities: clientCapabilities,
        settings,
        profileId,
        cached: false,
      };
    } catch (error) {
      // Database not ready, just return computed settings
      log.info('[DeviceLoader] DB not ready, using computed settings');
      
      this.settingsCache.set(cacheKey, {
        settings,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Short cache if DB unavailable
      });
      
      return {
        capabilities: clientCapabilities,
        settings,
        cached: false,
      };
    }
  }
  
  /**
   * Generate device fingerprint
   */
  private generateFingerprint(capabilities: DeviceCapabilities): string {
    const parts = [
      capabilities.platform,
      capabilities.browser,
      capabilities.deviceType,
      capabilities.screenWidth,
      capabilities.screenHeight,
    ];
    return Buffer.from(parts.join('-')).toString('base64').slice(0, 32);
  }
  
  /**
   * Get settings without user context (anonymous/quick load)
   */
  getQuickSettings(userAgent: string): OptimizedSettings {
    const parsed = this.parseUserAgent(userAgent);
    
    const capabilities: DeviceCapabilities = {
      deviceType: parsed.deviceType || 'desktop',
      platform: parsed.platform || 'unknown',
      browser: parsed.browser || 'unknown',
      browserVersion: parsed.browserVersion || '',
      screenWidth: 1920,
      screenHeight: 1080,
      devicePixelRatio: 1,
      touchSupport: parsed.touchSupport || false,
    };
    
    return this.getOptimizedSettings(capabilities);
  }
  
  /**
   * Clear cache for a user
   */
  clearUserCache(userId: string): void {
    for (const key of this.settingsCache.keys()) {
      if (key.startsWith(userId)) {
        this.settingsCache.delete(key);
      }
    }
  }
}

export const deviceLoader = new UniversalDeviceLoader();
