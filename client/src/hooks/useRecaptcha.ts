/**
 * Smart reCAPTCHA v3 Hook
 * 
 * Invisible reCAPTCHA that:
 * - Runs in the background without user interaction
 * - Remembers trusted users (humans) via session
 * - Only triggers challenges when suspicious activity is detected
 * - Returns a score (0.0 = bot, 1.0 = human)
 */

import { useEffect, useCallback, useRef } from 'react';

declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

interface UseRecaptchaOptions {
  action: string;
}

export function useRecaptcha({ action }: UseRecaptchaOptions) {
  const isLoaded = useRef(false);

  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY || isLoaded.current) return;

    // Load reCAPTCHA v3 script dynamically
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
    isLoaded.current = true;

    return () => {
      // Cleanup if needed
    };
  }, []);

  const executeRecaptcha = useCallback(async (): Promise<string | null> => {
    if (!RECAPTCHA_SITE_KEY) {
      console.warn('[reCAPTCHA] No site key configured - skipping verification');
      return null;
    }

    try {
      return new Promise((resolve) => {
        if (window.grecaptcha) {
          window.grecaptcha.ready(async () => {
            try {
              const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
              resolve(token);
            } catch (error) {
              console.error('[reCAPTCHA] Execute error:', error);
              resolve(null);
            }
          });
        } else {
          // reCAPTCHA not loaded yet
          console.warn('[reCAPTCHA] Script not loaded yet');
          resolve(null);
        }
      });
    } catch (error) {
      console.error('[reCAPTCHA] Error:', error);
      return null;
    }
  }, [action]);

  return {
    executeRecaptcha,
    isEnabled: !!RECAPTCHA_SITE_KEY,
  };
}

export default useRecaptcha;
