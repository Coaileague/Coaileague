/**
 * Haptics Utility - Native-feel vibration feedback for mobile
 * Provides consistent haptic patterns for different interaction types
 */

export const haptics = {
  light: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  medium: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },

  heavy: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 10, 30]);
    }
  },

  success: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 20]);
    }
  },

  error: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50, 30, 50]);
    }
  },

  warning: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 20, 30]);
    }
  },

  clockIn: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 10, 30, 50, 10, 50, 20]);
    }
  },

  duress: () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }
  },
};

export default haptics;
