/**
 * Interactive Chat Announcement Banner
 * Full-width rotating banner with links, emoticons, and live updates
 * Editable by support staff only
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  AlertCircle, Clock, Users, Zap, TrendingUp, 
  Award, Bell, MessageCircle, Star, Heart
} from "lucide-react";
import { 
  ParticleSystem
} from "./advanced-banner-effects";

interface BannerMessage {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success' | 'promo' | 'queue' | 'incident' | 'maintenance';
  link?: string;
  icon?: string;
  emoticon?: string;
  progress?: number; // For incident/maintenance status (0-100)
}

interface ChatAnnouncementBannerProps {
  queuePosition?: number;
  queueWaitTime?: string;
  onlineStaff?: number;
  customMessages?: BannerMessage[];
  seasonalAnimationsEnabled?: boolean;
}

export function ChatAnnouncementBanner({ 
  queuePosition, 
  queueWaitTime = "2-3 minutes",
  onlineStaff = 0,
  customMessages = [],
  seasonalAnimationsEnabled = true
}: ChatAnnouncementBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seasonalEffect, setSeasonalEffect] = useState<'snow' | 'fireworks' | 'hearts' | 'halloween' | 'none'>('none');

  // Determine seasonal effect based on current date
  useEffect(() => {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();

    // January 1-7: Fireworks (New Year)
    if (month === 1 && day <= 7) {
      setSeasonalEffect('fireworks');
    }
    // February: Hearts (Valentine's)
    else if (month === 2) {
      setSeasonalEffect('hearts');
    }
    // October: Halloween
    else if (month === 10) {
      setSeasonalEffect('halloween');
    }
    // December: Snow (Winter/Christmas)
    else if (month === 12) {
      setSeasonalEffect('snow');
    }
    // July 1-7: Fireworks (Independence Day)
    else if (month === 7 && day <= 7) {
      setSeasonalEffect('fireworks');
    }
    else {
      setSeasonalEffect('none');
    }
  }, []);

  // Icon mapping
  const iconMap: Record<string, any> = {
    alert: AlertCircle,
    clock: Clock,
    users: Users,
    zap: Zap,
    trending: TrendingUp,
    award: Award,
    bell: Bell,
    message: MessageCircle,
    star: Star,
    heart: Heart
  };

  // Get seasonal messages based on current date
  const getSeasonalMessages = (): BannerMessage[] => {
    const baseMessages: BannerMessage[] = [
      {
        id: '1',
        text: `Queue Position: You are #${queuePosition || 1} in line - Estimated wait: ${queueWaitTime}`,
        type: 'queue',
        icon: 'clock'
      },
      {
        id: '2',
        text: `${onlineStaff} Support Agents Online - We're here to help!`,
        type: 'info',
        icon: 'users'
      }
    ];

    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    // New Year (January 1-7)
    if (month === 1 && day <= 7) {
      return [...baseMessages,
        {
          id: '3',
          text: 'Happy New Year! New features launching this month - Stay tuned!',
          type: 'promo',
          icon: 'zap'
        },
        {
          id: '4',
          text: 'Start 2025 Strong - Upgrade to Elite for 20% off first month!',
          type: 'promo',
          link: '/pricing',
          icon: 'award'
        }
      ];
    }
    
    // Valentine's Day (February)
    if (month === 2) {
      return [...baseMessages,
        {
          id: '3',
          text: 'We love our customers! Special Valentine pricing on all plans',
          type: 'promo',
          link: '/pricing',
          icon: 'heart'
        },
        {
          id: '4',
          text: 'Share the love - Refer a friend and both get $50 credit',
          type: 'promo',
          icon: 'award'
        }
      ];
    }

    // Independence Day (July 1-7)
    if (month === 7 && day <= 7) {
      return [...baseMessages,
        {
          id: '3',
          text: 'Celebrate Independence - Free AI features for all Elite subscribers!',
          type: 'promo',
          link: '/features',
          icon: 'zap'
        },
        {
          id: '4',
          text: 'Freedom to automate - Start your free trial today',
          type: 'promo',
          link: '/pricing',
          icon: 'award'
        }
      ];
    }

    // Halloween (October)
    if (month === 10) {
      return [...baseMessages,
        {
          id: '3',
          text: 'Spooky good deals! Get 31% off Elite plans this October',
          type: 'promo',
          link: '/pricing',
          icon: 'award'
        },
        {
          id: '4',
          text: 'No tricks, just treats - AI-powered automation at your fingertips',
          type: 'promo',
          icon: 'zap'
        }
      ];
    }

    // Winter/Christmas (December)
    if (month === 12) {
      return [...baseMessages,
        {
          id: '3',
          text: 'Holiday Special: Elite plan + 3 months free AI credits!',
          type: 'promo',
          link: '/pricing',
          icon: 'award'
        },
        {
          id: '4',
          text: 'Give the gift of automation - Gift cards now available!',
          type: 'promo',
          icon: 'heart'
        }
      ];
    }

    // Default year-round messages
    return [...baseMessages,
      {
        id: '3',
        text: 'Type /help for available commands | /queue to check position',
        type: 'info',
        icon: 'message'
      },
      {
        id: '4',
        text: 'AI-Powered Support - Instant answers with Gemini 2.0 HelpOS™',
        type: 'promo',
        link: '/features',
        icon: 'zap'
      },
      {
        id: '5',
        text: 'AutoForce™ Elite - Priority support + advanced automation',
        type: 'promo',
        link: '/pricing',
        icon: 'award'
      }
    ];
  };

  const defaultMessages = getSeasonalMessages();

  const messages = customMessages.length > 0 ? customMessages : defaultMessages;

  // Auto-rotate messages every 7 seconds (slowed down for better readability)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 7000);

    return () => clearInterval(interval);
  }, [messages.length]);

  const currentMessage = messages[currentIndex];
  const IconComponent = currentMessage.icon ? iconMap[currentMessage.icon] : null;

  // Special styling for incident/maintenance messages
  const isSpecialStatus = currentMessage.type === 'incident' || currentMessage.type === 'maintenance';
  const backgroundClass = isSpecialStatus 
    ? 'bg-blue-700' 
    : 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600';

  const BannerContent = (
    <div className={`
      w-full min-h-[60px] transition-all duration-500 ease-in-out relative overflow-hidden
      ${backgroundClass}
      shadow-md
      px-4 py-3 sm:px-6
      animate-in fade-in slide-in-from-top-2
    `}>
      {/* Icon-based particle effects only - NO EMOJIS per guidelines */}
      {seasonalAnimationsEnabled && !isSpecialStatus && seasonalEffect === 'snow' && (
        <ParticleSystem type="snow" count={40} duration={300000} enabled={true} />
      )}
      {seasonalAnimationsEnabled && !isSpecialStatus && seasonalEffect === 'fireworks' && (
        <>
          <ParticleSystem type="fireworks" count={60} duration={300000} enabled={true} />
          <ParticleSystem type="stars" count={30} duration={300000} enabled={true} />
        </>
      )}
      {seasonalAnimationsEnabled && !isSpecialStatus && seasonalEffect === 'hearts' && (
        <ParticleSystem type="hearts" count={35} duration={300000} enabled={true} />
      )}
      {seasonalAnimationsEnabled && !isSpecialStatus && seasonalEffect === 'halloween' && (
        <ParticleSystem type="celebration" count={40} duration={300000} enabled={true} />
      )}
      
      {/* CONFETTI for celebrations */}
      {seasonalAnimationsEnabled && !isSpecialStatus && currentMessage.type === 'promo' && (
        <ParticleSystem type="confetti" count={30} duration={300000} enabled={true} />
      )}
      <div className="max-w-full flex items-center justify-center gap-2 sm:gap-3 relative z-10 min-h-[48px] flex-wrap">
        {/* Icon - White color for bright gradient theme */}
        {IconComponent && (
          <IconComponent className="w-6 h-6 text-white flex-shrink-0" />
        )}
        
        {/* MESSAGE TEXT - Clean white text on bright gradient */}
        <div className="flex-1 text-center sm:text-left">
          <div className="text-sm sm:text-base font-semibold text-white">
            {currentMessage.text}
          </div>
          
          {/* Progress bar for incident/maintenance messages */}
          {isSpecialStatus && currentMessage.progress !== undefined && (
            <div className="mt-2 w-full bg-blue-900/30 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-white h-full rounded-full transition-all duration-500"
                style={{ width: `${currentMessage.progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Navigation Dots - Animated if enabled, static if disabled */}
        <div className="hidden sm:flex items-center gap-1.5 ml-auto">
          {messages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`
                w-2.5 h-2.5 rounded-full transition-all duration-300 relative
                ${index === currentIndex 
                  ? seasonalAnimationsEnabled 
                    ? 'w-6 h-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 animate-bounce' 
                    : 'w-6 h-2.5 bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500'
                  : 'bg-white/40'}
              `}
              style={seasonalAnimationsEnabled && index === currentIndex ? {
                animationDelay: `${index * 0.1}s`,
                animationDuration: '1s',
                boxShadow: '0 0 12px rgba(96, 165, 250, 0.8)'
              } : index === currentIndex ? {
                boxShadow: '0 0 8px rgba(96, 165, 250, 0.6)'
              } : {}}
              data-testid={`banner-dot-${index}`}
            />
          ))}
        </div>
      </div>
    </div>
  );

  // Wrap with link if provided
  if (currentMessage.link) {
    return (
      <Link href={currentMessage.link} className="block hover:opacity-90 transition-opacity">
        {BannerContent}
      </Link>
    );
  }

  return BannerContent;
}
