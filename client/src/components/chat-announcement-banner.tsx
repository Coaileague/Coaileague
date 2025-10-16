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

interface BannerMessage {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success' | 'promo' | 'queue';
  link?: string;
  icon?: string;
  emoticon?: string;
}

interface ChatAnnouncementBannerProps {
  queuePosition?: number;
  queueWaitTime?: string;
  onlineStaff?: number;
  customMessages?: BannerMessage[];
}

export function ChatAnnouncementBanner({ 
  queuePosition, 
  queueWaitTime = "2-3 minutes",
  onlineStaff = 0,
  customMessages = []
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

  // No emoticons - guidelines prohibit emojis
  const emoticons: Record<string, string> = {};

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
        text: 'AI-Powered Support - Instant answers with GPT-4 HelpOS™',
        type: 'promo',
        link: '/features',
        icon: 'zap'
      },
      {
        id: '5',
        text: 'WorkforceOS Elite - Priority support + advanced automation',
        type: 'promo',
        link: '/pricing',
        icon: 'award'
      }
    ];
  };

  const defaultMessages = getSeasonalMessages();

  const messages = customMessages.length > 0 ? customMessages : defaultMessages;

  // Auto-rotate messages every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [messages.length]);

  const currentMessage = messages[currentIndex];
  const IconComponent = currentMessage.icon ? iconMap[currentMessage.icon] : null;
  const emoticon = currentMessage.emoticon ? emoticons[currentMessage.emoticon] : null;

  // Color schemes based on message type
  const colorSchemes = {
    info: 'bg-gradient-to-r from-blue-500/20 to-blue-600/10 border-blue-400/30 text-blue-100',
    warning: 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 border-amber-400/30 text-amber-100',
    success: 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border-emerald-400/30 text-emerald-100',
    promo: 'bg-gradient-to-r from-purple-500/20 to-pink-600/10 border-purple-400/30 text-purple-100',
    queue: 'bg-gradient-to-r from-cyan-500/20 to-cyan-600/10 border-cyan-400/30 text-cyan-100'
  };

  const BannerContent = (
    <div className={`
      w-full border-b backdrop-blur-sm transition-all duration-500 ease-in-out relative overflow-hidden
      ${colorSchemes[currentMessage.type]}
      animate-in fade-in slide-in-from-top-2
    `}>
      {/* Seasonal Effects Overlay */}
      {seasonalEffect === 'snow' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(15)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-white/60 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}px`,
                animation: `fall ${3 + Math.random() * 2}s linear infinite`,
                animationDelay: `${Math.random() * 3}s`
              }}
            />
          ))}
        </div>
      )}
      {seasonalEffect === 'fireworks' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 bg-yellow-300/50 rounded-full animate-ping"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${Math.random() * 100}%`,
                animationDuration: `${1 + Math.random()}s`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}
      {seasonalEffect === 'hearts' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-pink-300/50 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                animation: `float ${3 + Math.random() * 2}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}
      {seasonalEffect === 'halloween' && (
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 bg-orange-400/40 rounded-full animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                animationDuration: `${2 + Math.random()}s`,
                animationDelay: `${Math.random() * 1.5}s`
              }}
            />
          ))}
        </div>
      )}
      <div className="max-w-full px-4 py-2.5 flex items-center justify-center gap-2.5 relative z-10">
        {/* Icon */}
        {IconComponent && (
          <IconComponent className="w-4 h-4 flex-shrink-0 animate-pulse" />
        )}
        
        {/* Emoticon */}
        {emoticon && (
          <span className="text-lg leading-none animate-bounce" style={{ animationDuration: '2s' }}>
            {emoticon}
          </span>
        )}
        
        {/* Message Text */}
        <span className="text-sm font-medium text-center">
          {currentMessage.text}
        </span>

        {/* Progress Dots */}
        <div className="hidden sm:flex items-center gap-1 ml-auto">
          {messages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`
                w-1.5 h-1.5 rounded-full transition-all duration-300
                ${index === currentIndex ? 'bg-current w-4' : 'bg-current/40'}
              `}
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
