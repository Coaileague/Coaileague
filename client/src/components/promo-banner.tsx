import { useState, useEffect } from "react";
import { X, Sparkles, Gift, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromoBannerProps {
  message?: string;
  ctaText?: string;
  ctaLink?: string;
  onClose?: () => void;
  showClose?: boolean;
}

export function PromoBanner({
  message = "New Year Sale! Get 50% OFF your first 3 months - Limited time offer!",
  ctaText = "Claim Offer",
  ctaLink = "/register",
  onClose,
  showClose = true,
}: PromoBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [animationIndex, setAnimationIndex] = useState(0);

  // Seasonal sparkle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationIndex((prev) => (prev + 1) % 3);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) return null;

  return (
    <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4xIj48cGF0aCBkPSJNMzYgMzRjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00em0wLTIwYzAtMi4yMS0xLjc5LTQtNC00cy00IDEuNzktNCA0IDEuNzkgNCA0IDQgNC0xLjc5IDQtNHptMjAgMjBjMC0yLjIxLTEuNzktNC00LTRzLTQgMS43OS00IDQgMS43OSA0IDQgNCA0LTEuNzkgNC00eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20 animate-pulse"></div>

      {/* Content */}
      <div className="relative container mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex items-center justify-between gap-2 sm:gap-4 min-h-[3rem] sm:min-h-[3.5rem] py-2">
          {/* Icon - animated */}
          <div className="flex-shrink-0 hidden xs:block">
            {animationIndex === 0 && <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 animate-spin-slow" />}
            {animationIndex === 1 && <Gift className="w-5 h-5 sm:w-6 sm:h-6 animate-bounce" />}
            {animationIndex === 2 && <Zap className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />}
          </div>

          {/* Message - wrapped */}
          <div className="flex-1 text-center md:text-left px-2 sm:px-0">
            <p className="text-xs sm:text-sm md:text-base font-semibold leading-tight break-words">
              {message}
            </p>
          </div>

          {/* CTA Button - mobile optimized */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Button
              size="sm"
              onClick={() => window.location.href = ctaLink}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-2 sm:px-3 md:px-4 bg-white text-purple-600 hover:bg-gray-100 font-bold shadow-lg"
              data-testid="button-promo-cta"
            >
              {ctaText}
            </Button>
            
            {showClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-white/20 flex-shrink-0"
                data-testid="button-close-banner"
                aria-label="Close banner"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Shimmer effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer pointer-events-none" />
    </div>
  );
}
