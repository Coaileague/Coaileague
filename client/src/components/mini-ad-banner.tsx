import { useState, useEffect } from "react";
import { Sparkles, Zap, TrendingUp, Star, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MiniBannerProps {
  onDismiss?: () => void;
}

export function MiniAdBanner({ onDismiss }: MiniBannerProps) {
  const [currentAd, setCurrentAd] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Rotate ads every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentAd((prev) => (prev + 1) % ads.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const ads = [
    {
      icon: Sparkles,
      title: "EngagementOS™",
      subtitle: "Track employee satisfaction in real-time",
      gradient: "from-purple-500 via-pink-500 to-blue-500",
      iconColor: "text-pink-300",
      badge: "NEW"
    },
    {
      icon: TrendingUp,
      title: "PredictionOS™",
      subtitle: "AI-powered turnover risk analysis",
      gradient: "from-blue-500 via-blue-500 to-teal-500",
      iconColor: "text-blue-300",
      badge: "AI"
    },
    {
      icon: Zap,
      title: "AssetOS™",
      subtitle: "Physical resource scheduling & billing",
      gradient: "from-blue-500 via-orange-500 to-red-500",
      iconColor: "text-orange-300",
      badge: "PRO"
    },
    {
      icon: Star,
      title: "Premium Features",
      subtitle: "Unlock all WorkforceOS capabilities",
      gradient: "from-indigo-500 via-purple-500 to-pink-500",
      iconColor: "text-emerald-700 dark:text-emerald-400",
      badge: "SAVE 40%"
    }
  ];

  const ad = ads[currentAd];

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  return (
    <div className="relative overflow-hidden animate-in slide-in-from-top-2 fade-in">
      {/* Animated gradient background */}
      <div className={`bg-gradient-to-r ${ad.gradient} p-3 relative`}>
        {/* Animated shine effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
        
        {/* Content */}
        <div className="relative flex items-center gap-3">
          {/* Animated icon */}
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center animate-pulse">
            <ad.icon className={`w-6 h-6 ${ad.iconColor} drop-shadow-lg`} />
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-white font-bold text-sm truncate drop-shadow-md">
                {ad.title}
              </h3>
              <Badge className="bg-white/30 text-white border-white/50 text-xs font-bold px-1.5 py-0 backdrop-blur-sm">
                {ad.badge}
              </Badge>
            </div>
            <p className="text-white/90 text-xs truncate drop-shadow-sm">
              {ad.subtitle}
            </p>
          </div>

          {/* CTA Arrow */}
          <button 
            className="flex-shrink-0 w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover-elevate active-elevate-2 transition-all"
            data-testid="button-ad-cta"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 w-6 h-6 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center hover-elevate active-elevate-2 transition-all"
            data-testid="button-dismiss-ad"
          >
            <X className="w-4 h-4 text-white/80" />
          </button>
        </div>

        {/* Progress indicator dots */}
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1">
          {ads.map((_, idx) => (
            <div
              key={idx}
              className={`w-1 h-1 rounded-full transition-all ${
                idx === currentAd
                  ? 'bg-white w-3'
                  : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Shimmer animation styles */}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite;
        }
      `}</style>
    </div>
  );
}
