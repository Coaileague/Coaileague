/**
 * Safety Guards - CAPTCHA detection, destructive action prevention
 */

import { Page } from 'playwright';
import { config } from '../config/diagnostics.config';

export async function detectCaptcha(page: Page): Promise<boolean> {
  try {
    for (const selector of config.captchaSelectors) {
      const element = await page.$(selector);
      if (element) {
        return true;
      }
    }
    
    const bodyText = await page.textContent('body') || '';
    const captchaKeywords = [
      "i'm not a robot",
      "prove you're human",
      "security check",
      "verify you are human",
      "complete the captcha"
    ];
    
    const lowerText = bodyText.toLowerCase();
    for (const keyword of captchaKeywords) {
      if (lowerText.includes(keyword)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('[Guards] Error detecting CAPTCHA:', error);
    return false;
  }
}

export function isDestructiveElement(text: string, selector?: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerSelector = (selector || '').toLowerCase();
  
  for (const keyword of config.destructiveKeywords) {
    if (lowerText.includes(keyword) || lowerSelector.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

export function isDestructiveUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  const dangerousPatterns = [
    '/delete',
    '/remove',
    '/destroy',
    '/cancel',
    '/unsubscribe',
    '/deactivate',
    '/logout',
    '/signout'
  ];
  
  for (const pattern of dangerousPatterns) {
    if (lowerUrl.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}
