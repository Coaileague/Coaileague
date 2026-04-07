import { useEffect, useState, useMemo } from 'react';
import { Snowflake, Star, Sparkles } from 'lucide-react';

type Season = 'christmas' | 'halloween' | 'valentines' | 'newyear' | 'spring' | 'summer' | 'fall' | 'winter' | 'none';

interface SeasonalBackgroundProps {
  enabled: boolean;
}

function getCurrentSeason(): Season {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if ((month === 12) || (month === 1 && day <= 5)) {
    return 'christmas';
  }
  
  if (month === 2 && day <= 20) {
    return 'valentines';
  }
  
  if ((month === 10 && day >= 15) || (month === 11 && day <= 2)) {
    return 'halloween';
  }
  
  if ((month === 12 && day >= 26) || (month === 1 && day <= 2)) {
    return 'newyear';
  }
  
  if ((month === 3 && day >= 20) || month === 4 || month === 5 || (month === 6 && day <= 20)) {
    return 'spring';
  }
  
  if ((month === 6 && day >= 21) || month === 7 || month === 8 || (month === 9 && day <= 21)) {
    return 'summer';
  }
  
  if ((month === 9 && day >= 22) || month === 10 || month === 11 || (month === 12 && day <= 20)) {
    return 'fall';
  }
  
  return 'none';
}

function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return prefersReducedMotion;
}

export function SeasonalBackground({ enabled }: SeasonalBackgroundProps) {
  const [season, setSeason] = useState<Season>(getCurrentSeason());
  const prefersReducedMotion = useReducedMotion();
  
  useEffect(() => {
    setSeason(getCurrentSeason());
    
    const interval = setInterval(() => {
      setSeason(getCurrentSeason());
    }, 1000 * 60 * 60 * 24);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!enabled || prefersReducedMotion) return null;
  
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {season === 'christmas' && <ChristmasEffects />}
      {season === 'halloween' && <HalloweenElements />}
      {season === 'valentines' && <ValentineHearts />}
      {season === 'newyear' && <NewYearConfetti />}
      {season === 'spring' && <SpringFlowers />}
      {season === 'fall' && <FallingLeaves />}
    </div>
  );
}

function ChristmasEffects() {
  const snowflakes = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 15 + Math.random() * 25,
    opacity: 0.15 + Math.random() * 0.2,
    size: 10 + Math.random() * 8,
    delay: Math.random() * 15,
  })), []);
  
  const ornaments = useMemo(() => {
    const positions = [
      { left: 3, top: 15 },
      { left: 97, top: 25 },
      { left: 5, top: 55 },
      { left: 95, top: 70 },
      { left: 2, top: 85 },
      { left: 98, top: 45 },
    ];
    return positions.map((pos, i) => ({
      id: i,
      ...pos,
      color: ['#ef4444', '#22c55e', '#fbbf24', '#3b82f6', '#ec4899', '#f97316'][i % 6],
      size: 6 + Math.random() * 4,
      animationDelay: Math.random() * 4,
    }));
  }, []);
  
  return (
    <>
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="absolute animate-snow-fall"
          style={{
            left: `${flake.left}%`,
            top: '-20px',
            animationDuration: `${flake.animationDuration}s`,
            animationDelay: `${flake.delay}s`,
          }}
        >
          <Snowflake 
            className="text-white/30 dark:text-white/20 drop-shadow-sm"
            style={{ width: flake.size, height: flake.size }}
          />
        </div>
      ))}
      
      {ornaments.map(ornament => (
        <div
          key={`ornament-${ornament.id}`}
          className="absolute animate-ornament-glow"
          style={{
            left: `${ornament.left}%`,
            top: `${ornament.top}%`,
            animationDelay: `${ornament.animationDelay}s`,
          }}
        >
          <div 
            className="rounded-full shadow-sm"
            style={{ 
              width: ornament.size, 
              height: ornament.size,
              backgroundColor: ornament.color,
              boxShadow: `0 0 ${ornament.size}px ${ornament.color}40`,
            }}
          />
        </div>
      ))}
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes snow-fall {
          0% { 
            transform: translateY(-20px) rotate(0deg); 
            opacity: 0;
          }
          10% {
            opacity: 0.3;
          }
          80% {
            opacity: 0.3;
          }
          100% { 
            transform: translateY(95vh) rotate(360deg); 
            opacity: 0;
          }
        }
        .animate-snow-fall {
          animation: snow-fall linear infinite;
        }
        @keyframes ornament-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
        .animate-ornament-glow {
          animation: ornament-glow 3s ease-in-out infinite;
        }
      `}} />
    </>
  );
}

function HalloweenElements() {
  const elements = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i,
    icon: ['bat', 'spider', 'ghost'][Math.floor(Math.random() * 3)] as 'bat' | 'spider' | 'ghost',
    left: Math.random() * 100,
    animationDuration: 18 + Math.random() * 22,
    opacity: 0.15 + Math.random() * 0.15,
    size: 14 + Math.random() * 10,
    delay: Math.random() * 12,
  })), []);
  
  return (
    <>
      {elements.map(elem => (
        <div
          key={elem.id}
          className="absolute animate-float-down"
          style={{
            left: `${elem.left}%`,
            top: '-30px',
            animationDuration: `${elem.animationDuration}s`,
            animationDelay: `${elem.delay}s`,
            opacity: elem.opacity,
          }}
        >
          <div 
            className="text-orange-500 dark:text-orange-400"
            style={{ width: elem.size, height: elem.size }}
          >
            {elem.icon === 'bat' && <Star className="w-full h-full" />}
            {elem.icon === 'spider' && <Sparkles className="w-full h-full" />}
            {elem.icon === 'ghost' && <Star className="w-full h-full" />}
          </div>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-down {
          0% { transform: translateY(-30px) translateX(0); opacity: 0; }
          10% { opacity: 0.3; }
          80% { opacity: 0.3; }
          100% { transform: translateY(95vh) translateX(10px); opacity: 0; }
        }
        .animate-float-down {
          animation: float-down ease-in-out infinite;
        }
      `}} />
    </>
  );
}

function ValentineHearts() {
  const hearts = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 12 + Math.random() * 18,
    opacity: 0.1 + Math.random() * 0.15,
    size: 12 + Math.random() * 10,
    delay: Math.random() * 10,
  })), []);
  
  return (
    <>
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="absolute animate-rise"
          style={{
            left: `${heart.left}%`,
            bottom: '-30px',
            animationDuration: `${heart.animationDuration}s`,
            animationDelay: `${heart.delay}s`,
            opacity: heart.opacity,
          }}
        >
          <svg 
            viewBox="0 0 24 24" 
            fill="currentColor"
            className="text-pink-400 dark:text-pink-300"
            style={{ width: heart.size, height: heart.size }}
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes rise {
          0% { transform: translateY(0) scale(0.8); opacity: 0; }
          10% { opacity: 0.4; }
          80% { opacity: 0.4; }
          100% { transform: translateY(-100vh) scale(1.1); opacity: 0; }
        }
        .animate-rise {
          animation: rise ease-in-out infinite;
        }
      `}} />
    </>
  );
}

function NewYearConfetti() {
  const confetti = useMemo(() => Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 10 + Math.random() * 15,
    color: ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#ec4899'][Math.floor(Math.random() * 5)],
    size: 8 + Math.random() * 8,
    delay: Math.random() * 8,
  })), []);
  
  return (
    <>
      {confetti.map(item => (
        <div
          key={item.id}
          className="absolute animate-confetti"
          style={{
            left: `${item.left}%`,
            top: '-40px',
            animationDuration: `${item.animationDuration}s`,
            animationDelay: `${item.delay}s`,
          }}
        >
          <Sparkles 
            style={{ width: item.size, height: item.size, color: item.color }}
            className="opacity-40"
          />
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes confetti {
          0% { transform: translateY(-40px) rotate(0deg); opacity: 0; }
          10% { opacity: 0.5; }
          80% { opacity: 0.5; }
          100% { transform: translateY(95vh) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti linear infinite;
        }
      `}} />
    </>
  );
}

function SpringFlowers() {
  const flowers = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 20 + Math.random() * 25,
    color: ['#ec4899', '#fbbf24', '#22c55e', '#a855f7'][Math.floor(Math.random() * 4)],
    size: 10 + Math.random() * 8,
    delay: Math.random() * 15,
  })), []);
  
  return (
    <>
      {flowers.map(flower => (
        <div
          key={flower.id}
          className="absolute animate-drift"
          style={{
            left: `${flower.left}%`,
            top: '-30px',
            animationDuration: `${flower.animationDuration}s`,
            animationDelay: `${flower.delay}s`,
          }}
        >
          <Star 
            style={{ width: flower.size, height: flower.size, color: flower.color }}
            className="opacity-30"
          />
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes drift {
          0% { transform: translateY(-30px) translateX(0) rotate(0deg); opacity: 0; }
          10% { opacity: 0.4; }
          80% { opacity: 0.4; }
          100% { transform: translateY(95vh) translateX(-20px) rotate(360deg); opacity: 0; }
        }
        .animate-drift {
          animation: drift ease-in-out infinite;
        }
      `}} />
    </>
  );
}

function FallingLeaves() {
  const leaves = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    animationDuration: 18 + Math.random() * 22,
    color: ['#ea580c', '#dc2626', '#fbbf24', '#78350f'][Math.floor(Math.random() * 4)],
    size: 12 + Math.random() * 10,
    delay: Math.random() * 12,
  })), []);
  
  return (
    <>
      {leaves.map(leaf => (
        <div
          key={leaf.id}
          className="absolute animate-leaf-fall"
          style={{
            left: `${leaf.left}%`,
            top: '-30px',
            animationDuration: `${leaf.animationDuration}s`,
            animationDelay: `${leaf.delay}s`,
          }}
        >
          <svg 
            viewBox="0 0 24 24" 
            fill="currentColor"
            style={{ width: leaf.size, height: leaf.size, color: leaf.color }}
            className="opacity-30"
          >
            <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"/>
          </svg>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes leaf-fall {
          0% { transform: translateY(-30px) rotate(0deg) translateX(0); opacity: 0; }
          10% { opacity: 0.4; }
          25% { transform: translateY(23vh) rotate(90deg) translateX(15px); }
          50% { transform: translateY(45vh) rotate(180deg) translateX(-15px); }
          75% { transform: translateY(68vh) rotate(270deg) translateX(10px); opacity: 0.4; }
          100% { transform: translateY(95vh) rotate(360deg) translateX(0); opacity: 0; }
        }
        .animate-leaf-fall {
          animation: leaf-fall ease-in-out infinite;
        }
      `}} />
    </>
  );
}
