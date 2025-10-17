/**
 * Interactive Chat Announcement Banner
 * Full-width rotating banner with links, emoticons, and live updates
 * Editable by support staff only
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  AlertCircle, Clock, Users, Zap, TrendingUp, 
  Award, Bell, MessageCircle, Star, Heart, Ghost 
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

  // Auto-rotate messages every 7 seconds (slowed down for better readability)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % messages.length);
    }, 7000);

    return () => clearInterval(interval);
  }, [messages.length]);

  const currentMessage = messages[currentIndex];
  const IconComponent = currentMessage.icon ? iconMap[currentMessage.icon] : null;
  const emoticon = currentMessage.emoticon ? emoticons[currentMessage.emoticon] : null;

  // Color schemes based on message type - vibrant backgrounds with good contrast
  const colorSchemes = {
    info: 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-400/50 text-white',
    warning: 'bg-gradient-to-r from-amber-600 to-amber-700 border-amber-400/50 text-white',
    success: 'bg-gradient-to-r from-emerald-600 to-emerald-700 border-emerald-400/50 text-white',
    promo: 'bg-gradient-to-r from-purple-600 to-pink-600 border-purple-400/50 text-white',
    queue: 'bg-gradient-to-r from-cyan-600 to-cyan-700 border-cyan-400/50 text-white'
  };

  const BannerContent = (
    <div className={`
      w-full border-b-2 transition-all duration-500 ease-in-out relative overflow-hidden
      ${colorSchemes[currentMessage.type]}
      animate-in fade-in slide-in-from-top-2
    `}>
      {/* Enhanced Seasonal Effects Overlay with Better Graphics */}
      {seasonalEffect === 'snow' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(20)].map((_, i) => {
            const size = 2 + Math.random() * 4;
            return (
              <div
                key={i}
                className="absolute bg-white/80 rounded-full shadow-lg"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${Math.random() * 100}%`,
                  top: `-${Math.random() * 20}px`,
                  animation: `snowfall ${4 + Math.random() * 3}s linear infinite`,
                  animationDelay: `${Math.random() * 4}s`,
                  filter: 'blur(1px)'
                }}
              />
            );
          })}
        </div>
      )}
      {seasonalEffect === 'fireworks' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(12)].map((_, i) => {
            const colors = ['bg-yellow-400', 'bg-red-400', 'bg-blue-400', 'bg-green-400', 'bg-purple-400'];
            const color = colors[i % colors.length];
            return (
              <div
                key={i}
                className={`absolute w-4 h-4 ${color} rounded-full shadow-2xl`}
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  top: `${20 + Math.random() * 60}%`,
                  animation: `firework ${0.8 + Math.random() * 0.5}s ease-out infinite`,
                  animationDelay: `${Math.random() * 2.5}s`,
                  filter: 'blur(0.5px)',
                  opacity: 0.9
                }}
              />
            );
          })}
        </div>
      )}
      {seasonalEffect === 'hearts' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(15)].map((_, i) => {
            const size = 8 + Math.random() * 6;
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${100 + Math.random() * 20}%`,
                  animation: `heartFloat ${4 + Math.random() * 3}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 3}s`
                }}
              >
                <Heart className="w-3 h-3 text-pink-400 fill-pink-400" style={{ filter: 'drop-shadow(0 0 3px rgba(244, 114, 182, 0.5))' }} />
              </div>
            );
          })}
        </div>
      )}
      {seasonalEffect === 'halloween' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(10)].map((_, i) => {
            const icons = [Ghost, Ghost, Ghost, Ghost]; // Using Ghost icon for spooky effect
            const Icon = icons[i % icons.length];
            return (
              <div
                key={i}
                className="absolute"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${-20 + Math.random() * 10}%`,
                  animation: `spookyFloat ${3 + Math.random() * 2}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 2}s`,
                  transform: `rotate(${Math.random() * 360}deg)`
                }}
              >
                <Icon className="w-4 h-4 text-orange-400" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 146, 60, 0.6))' }} />
              </div>
            );
          })}
        </div>
      )}
      <div className="max-w-full px-6 py-4 flex items-center justify-center gap-3 relative z-10">
        {/* Icon */}
        {IconComponent && (
          <IconComponent className="w-5 h-5 flex-shrink-0 animate-pulse" />
        )}
        
        {/* Emoticon */}
        {emoticon && (
          <span className="text-2xl leading-none animate-bounce" style={{ animationDuration: '2s' }}>
            {emoticon}
          </span>
        )}
        
        {/* Message Text */}
        <span className="text-base font-bold text-center tracking-wide">
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
