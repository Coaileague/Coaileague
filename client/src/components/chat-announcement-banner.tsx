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
import { 
  ParticleSystem, 
  AnimatedGradientText, 
  TypingText, 
  FloatingEmojis,
  PulseGlow,
  AnimatedIconCarousel,
  WaveText
} from "./advanced-banner-effects";

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

  // Color schemes - TRANSPARENT to blend with header (animations show through)
  const colorSchemes = {
    info: 'bg-transparent text-white',
    warning: 'bg-transparent text-amber-200',
    success: 'bg-transparent text-emerald-200',
    promo: 'bg-transparent text-white',
    queue: 'bg-transparent text-cyan-200'
  };

  const BannerContent = (
    <div className={`
      w-full min-h-[72px] transition-all duration-500 ease-in-out relative overflow-hidden
      bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500
      border-b-4 border-blue-300 shadow-xl backdrop-blur-sm
      animate-in fade-in slide-in-from-top-2
    `}>
      {/* ADVANCED PARTICLE EFFECTS - Physics-based with emojis */}
      {seasonalEffect === 'snow' && (
        <>
          <ParticleSystem type="snow" count={40} duration={300000} enabled={true} />
          <FloatingEmojis emojis={['❄️', '⛄', '🌨️']} count={5} />
        </>
      )}
      {seasonalEffect === 'fireworks' && (
        <>
          <ParticleSystem type="fireworks" count={60} duration={300000} enabled={true} />
          <ParticleSystem type="stars" count={30} duration={300000} enabled={true} />
          <FloatingEmojis emojis={['🎆', '🎇', '✨', '💫', '🌟']} count={8} />
        </>
      )}
      {seasonalEffect === 'hearts' && (
        <>
          <ParticleSystem type="hearts" count={35} duration={300000} enabled={true} />
          <FloatingEmojis emojis={['❤️', '💕', '💖', '💗', '💘', '💝']} count={8} />
        </>
      )}
      {seasonalEffect === 'halloween' && (
        <>
          <ParticleSystem type="celebration" count={40} duration={300000} enabled={true} />
          <FloatingEmojis emojis={['👻', '🎃', '🦇', '🕷️', '🕸️', '💀']} count={10} />
        </>
      )}
      
      {/* CONFETTI for celebrations */}
      {currentMessage.type === 'promo' && (
        <ParticleSystem type="confetti" count={30} duration={300000} enabled={true} />
      )}
      <div className="max-w-full px-4 sm:px-6 py-3 flex items-center justify-center gap-2 sm:gap-3 relative z-10 min-h-[48px]">
        {/* Animated Icon Carousel - Multiple icons rotating */}
        {IconComponent && (
          <PulseGlow color={currentMessage.type === 'promo' ? '#00ffff' : '#ffff00'} intensity={15}>
            <div className="scale-110">
              <AnimatedIconCarousel 
                icons={['sparkles', 'star', 'zap', 'trophy', 'crown']}
                size={28}
                colors={['text-yellow-400', 'text-cyan-400', 'text-purple-400', 'text-pink-400', 'text-orange-400']}
                interval={1500}
              />
            </div>
          </PulseGlow>
        )}
        
        {/* Emoticon with enhanced animation */}
        {emoticon && (
          <PulseGlow color="#ff00ff" intensity={20}>
            <span className="text-2xl sm:text-3xl leading-none animate-bounce" style={{ animationDuration: '1.5s' }}>
              {emoticon}
            </span>
          </PulseGlow>
        )}
        
        {/* ENHANCED MESSAGE TEXT - Multi-color gradient with animations */}
        <div className="flex-1 text-center">
          {currentMessage.type === 'promo' ? (
            // PROMO: Gradient animated text with wave effect
            <div className="text-base sm:text-xl font-extrabold">
              <AnimatedGradientText 
                colors={['#ff0080', '#ff8c00', '#40e0d0', '#9370db', '#ff0080']}
                speed={4}
              >
                {currentMessage.text}
              </AnimatedGradientText>
            </div>
          ) : currentMessage.type === 'warning' ? (
            // WARNING: Typing effect with pulse
            <PulseGlow color="#ff6600" intensity={15}>
              <div className="text-base sm:text-lg font-bold text-amber-300">
                <TypingText text={currentMessage.text} speed={80} />
              </div>
            </PulseGlow>
          ) : currentMessage.type === 'success' ? (
            // SUCCESS: Wave text animation
            <div className="text-base sm:text-lg font-bold text-emerald-300">
              <WaveText text={currentMessage.text} delay={80} />
            </div>
          ) : (
            // INFO/QUEUE: Gradient text
            <div className="text-sm sm:text-base font-semibold">
              <AnimatedGradientText 
                colors={['#60a5fa', '#a78bfa', '#60a5fa']}
                speed={3}
              >
                {currentMessage.text}
              </AnimatedGradientText>
            </div>
          )}
        </div>

        {/* Animated Bouncing Dots with glow - Makes it feel ALIVE */}
        <div className="hidden sm:flex items-center gap-1.5 ml-auto">
          {messages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`
                w-2.5 h-2.5 rounded-full transition-all duration-300 relative
                ${index === currentIndex ? 'w-6 h-2.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 animate-bounce' : 'bg-white/40'}
              `}
              style={{
                animationDelay: `${index * 0.1}s`,
                animationDuration: '1s',
                boxShadow: index === currentIndex ? '0 0 12px rgba(96, 165, 250, 0.8)' : 'none'
              }}
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
