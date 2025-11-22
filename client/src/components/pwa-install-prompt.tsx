import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt after 30 seconds to avoid immediate interruption
      setTimeout(() => {
        setShowPrompt(true);
      }, 30000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('PWA installed successfully');
        setShowPrompt(false);
      } else {
        console.log('PWA installation dismissed');
        handleDismiss();
      }

      setDeferredPrompt(null);
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
    setShowPrompt(false);
  };

  if (isInstalled || !showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-5" data-testid="pwa-install-prompt">
      <Card className="shadow-2xl border-primary/20" data-testid="card-pwa-install">
        <CardHeader className="relative pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6"
            onClick={handleDismiss}
            data-testid="button-dismiss-pwa"
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2" data-testid="icon-pwa-smartphone">
              <Smartphone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg" data-testid="text-pwa-title">Install AutoForce™</CardTitle>
              <CardDescription data-testid="text-pwa-description">
                Get the best experience with our app
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm text-muted-foreground" data-testid="list-pwa-features">
            <li className="flex items-start gap-2" data-testid="feature-home-screen">
              <span className="text-primary">✓</span>
              <span>Instant access from your home screen</span>
            </li>
            <li className="flex items-start gap-2" data-testid="feature-offline">
              <span className="text-primary">✓</span>
              <span>Works offline with automatic sync</span>
            </li>
            <li className="flex items-start gap-2" data-testid="feature-performance">
              <span className="text-primary">✓</span>
              <span>Faster performance and notifications</span>
            </li>
          </ul>
          
          <div className="flex gap-2">
            <Button
              onClick={handleInstall}
              className="flex-1"
              data-testid="button-install-pwa"
            >
              <Download className="mr-2 h-4 w-4" />
              Install Now
            </Button>
            <Button
              variant="outline"
              onClick={handleDismiss}
              data-testid="button-later-pwa"
            >
              Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
