/**
 * PWAInstallPrompt - Prompt for mobile users to install the app
 * 
 * Features:
 * - Detects if PWA can be installed
 * - Shows install prompt for Android/Chrome
 * - Shows iOS add-to-home-screen instructions
 * - Remembers dismissal for 7 days
 * - Non-intrusive bottom sheet design
 */

import { useState, useEffect } from "react";
import { useMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { UniversalModal, UniversalModalTitle, UniversalModalContent } from '@/components/ui/universal-modal';
import { Download, X, Share, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrinityLogo } from "@/components/trinity-logo";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

const DISMISS_KEY = 'coaileague_pwa_prompt_dismissed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PWAInstallPrompt() {
  const { isPWA, isIOS, isAndroid, isMobile, canInstallPWA, promptPWAInstall } = useMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check if already dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
    
    // Show prompt after 5 seconds for mobile non-PWA users
    const timer = setTimeout(() => {
      if (isMobile && !isPWA && (canInstallPWA || isIOS)) {
        setIsOpen(true);
      }
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [isMobile, isPWA, canInstallPWA, isIOS]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
    setIsOpen(false);
  };

  const handleInstall = async () => {
    if (canInstallPWA) {
      await promptPWAInstall();
    }
    handleDismiss();
  };

  if (dismissed || isPWA || !isMobile) {
    return null;
  }

  return (
    <UniversalModal open={isOpen} onOpenChange={setIsOpen}>
      <UniversalModalContent 
        side="bottom" 
        className="rounded-t-2xl px-4 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 24px)' }}
        showHomeButton={false}
        hideBuiltInClose
      >
        <UniversalModalTitle className="sr-only">Install {PLATFORM_NAME} App</UniversalModalTitle>
        
        <button 
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground z-10"
          data-testid="button-dismiss-pwa-prompt"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center mb-4 shadow-sm border">
            <TrinityLogo size={40} />
          </div>
          
          <h2 className="text-xl font-bold text-foreground mb-2">
            Install {PLATFORM_NAME}
          </h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-[280px]">
            Add to your home screen for quick access to clock in, view your schedule, and report incidents.
          </p>
          
          {isIOS ? (
            <>
              <div className="w-full p-4 bg-muted/50 rounded-md mb-4">
                <div className="flex items-start gap-3 text-left">
                  <div className="p-2 bg-muted rounded-lg">
                    <Share className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Tap the Share button</p>
                    <p className="text-xs text-muted-foreground">At the bottom of your browser</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 text-left mt-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground font-medium">Tap "Add to Home Screen"</p>
                    <p className="text-xs text-muted-foreground">Then tap "Add" to confirm</p>
                  </div>
                </div>
              </div>
              <Button 
                onClick={handleDismiss}
                className="w-full"
                size="lg"
                data-testid="button-got-it"
              >
                Got it
              </Button>
            </>
          ) : (
            <>
              <Button 
                onClick={handleInstall}
                className="w-full mb-3"
                size="lg"
                data-testid="button-install-app"
              >
                <Download className="w-5 h-5 mr-2" />
                Install App
              </Button>
              <button
                onClick={handleDismiss}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="button-not-now"
              >
                Not now
              </button>
            </>
          )}
        </div>
      </UniversalModalContent>
    </UniversalModal>
  );
}

export default PWAInstallPrompt;
