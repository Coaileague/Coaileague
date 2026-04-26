import { useEffect, useRef } from 'react';

/**
 * Chat notification sounds hook
 * Plays sounds for message sent, received, user join/leave
 */
export function useChatSounds() {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Initialize Web Audio API
    if (typeof window !== 'undefined' && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  const playSound = (type: 'send' | 'receive' | 'join' | 'leave' | 'notify') => {
    const context = audioContextRef.current;
    if (!context) return;

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    // Different sounds for different actions
    switch (type) {
      case 'send':
        // Bubble send sound - quick ascending tone
        oscillator.frequency.setValueAtTime(440, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.15);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.15);
        break;

      case 'receive':
        // Bubble receive sound - gentle descending tone
        oscillator.frequency.setValueAtTime(660, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.12);
        gainNode.gain.setValueAtTime(0.2, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.18);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.18);
        break;

      case 'join':
        // User joined - pleasant chime
        oscillator.frequency.setValueAtTime(523, context.currentTime); // C5
        oscillator.frequency.setValueAtTime(659, context.currentTime + 0.08); // E5
        gainNode.gain.setValueAtTime(0.12, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.25);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.25);
        break;

      case 'leave':
        // User left - subtle descending tone
        oscillator.frequency.setValueAtTime(523, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(330, context.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.08, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.25);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.25);
        break;

      case 'notify':
        // Important notification - attention-grabbing
        oscillator.frequency.setValueAtTime(880, context.currentTime);
        oscillator.frequency.setValueAtTime(1047, context.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(880, context.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.25, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.35);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.35);
        break;
    }
  };

  return { playSound };
}
