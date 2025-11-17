import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Zap, Star, Heart, Gift, Trophy, Crown, Rocket, 
  PartyPopper, Flame, Sun, Moon, Cloud, Snowflake 
} from 'lucide-react';

// ============================================
// PARTICLE SYSTEM - Physics-based animations
// ============================================

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  life: number;
  maxLife: number;
  type: 'circle' | 'square' | 'star' | 'heart' | 'emoji';
  emoji?: string;
}

export function ParticleSystem({ 
  type = 'confetti',
  count = 50,
  duration = 5000,
  enabled = true 
}: { 
  type?: 'confetti' | 'fireworks' | 'snow' | 'hearts' | 'stars' | 'celebration';
  count?: number;
  duration?: number;
  enabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles based on type
    const initParticles = () => {
      particlesRef.current = [];
      const colors = getColorsForType(type);
      const emojis = getEmojisForType(type);

      for (let i = 0; i < count; i++) {
        particlesRef.current.push(createParticle(i, type, colors, emojis, canvas.width, canvas.height));
      }
    };

    initParticles();
    startTimeRef.current = Date.now();

    // Animation loop
    const animate = () => {
      if (!ctx || !canvas) return;

      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed > duration) {
        cancelAnimationFrame(animationFrameRef.current!);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current.forEach((particle, index) => {
        updateParticle(particle, type, canvas.width, canvas.height);
        drawParticle(ctx, particle);

        // Remove dead particles and create new ones for continuous effects
        if (particle.life <= 0) {
          const colors = getColorsForType(type);
          const emojis = getEmojisForType(type);
          particlesRef.current[index] = createParticle(index, type, colors, emojis, canvas.width, canvas.height);
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [type, count, duration, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}

function getColorsForType(type: string): string[] {
  const colorSets: Record<string, string[]> = {
    confetti: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8', '#00b894', '#fdcb6e'],
    fireworks: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'],
    snow: ['#ffffff', '#e8f4fd', '#d4e9f7', '#c0e0f0'],
    hearts: ['#ff006e', '#fb5607', '#ff006e', '#d62828', '#f72585'],
    stars: ['#ffd700', '#ffed4e', '#ffc107', '#ffb300', '#ffa000'],
    celebration: ['#ff0080', '#00ffff', '#ffff00', '#ff00ff', '#00ff00', '#ff8000']
  };
  return colorSets[type] || colorSets.confetti;
}

function getEmojisForType(type: string): string[] {
  const emojiSets: Record<string, string[]> = {
    confetti: ['🎊', '🎉', '✨', '⭐', '🌟', '💫'],
    fireworks: ['💥', '✨', '🎆', '🎇', '⚡', '💫'],
    snow: ['❄️', '⛄', '🌨️'],
    hearts: ['❤️', '💕', '💖', '💗', '💝', '💘'],
    stars: ['⭐', '🌟', '✨', '💫', '🌠'],
    celebration: ['🎉', '🎊', '🎈', '🎁', '🏆', '👑', '🚀']
  };
  return emojiSets[type] || emojiSets.confetti;
}

function createParticle(
  id: number,
  type: string,
  colors: string[],
  emojis: string[],
  width: number,
  height: number
): Particle {
  const configs: Record<string, any> = {
    confetti: {
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 2 + 1,
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      type: Math.random() > 0.7 ? 'emoji' : (Math.random() > 0.5 ? 'square' : 'circle')
    },
    fireworks: {
      x: Math.random() * width,
      y: height * 0.7 + Math.random() * height * 0.3,
      vx: (Math.random() - 0.5) * 8,
      vy: -(Math.random() * 8 + 4),
      size: Math.random() * 6 + 2,
      rotation: 0,
      rotationSpeed: 0,
      type: Math.random() > 0.8 ? 'star' : 'circle'
    },
    snow: {
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * 0.5,
      vy: Math.random() * 1 + 0.5,
      size: Math.random() * 6 + 3,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 2,
      type: Math.random() > 0.7 ? 'emoji' : 'circle'
    },
    hearts: {
      x: Math.random() * width,
      y: height + 20,
      vx: (Math.random() - 0.5) * 1,
      vy: -(Math.random() * 2 + 1),
      size: Math.random() * 12 + 8,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 3,
      type: Math.random() > 0.5 ? 'emoji' : 'heart'
    },
    stars: {
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 3 + 1,
      size: Math.random() * 10 + 5,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8,
      type: Math.random() > 0.6 ? 'emoji' : 'star'
    },
    celebration: {
      x: Math.random() * width,
      y: -20,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      size: Math.random() * 12 + 6,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      type: 'emoji'
    }
  };

  const config = configs[type] || configs.confetti;

  return {
    id,
    ...config,
    color: colors[Math.floor(Math.random() * colors.length)],
    opacity: 1,
    life: 1,
    maxLife: 1,
    emoji: config.type === 'emoji' ? emojis[Math.floor(Math.random() * emojis.length)] : undefined
  };
}

function updateParticle(particle: Particle, type: string, width: number, height: number) {
  // Update position
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.rotation += particle.rotationSpeed;

  // Apply gravity for certain types
  if (type === 'confetti' || type === 'fireworks' || type === 'stars' || type === 'celebration') {
    particle.vy += 0.1; // Gravity
  }

  // Wind effect for snow
  if (type === 'snow') {
    particle.vx += Math.sin(Date.now() / 1000 + particle.id) * 0.02;
  }

  // Fade out
  if (particle.y > height || particle.y < -50 || particle.x < -50 || particle.x > width + 50) {
    particle.life -= 0.02;
    particle.opacity = Math.max(0, particle.life);
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle) {
  ctx.save();
  ctx.globalAlpha = particle.opacity;
  ctx.translate(particle.x, particle.y);
  ctx.rotate((particle.rotation * Math.PI) / 180);

  if (particle.type === 'emoji' && particle.emoji) {
    ctx.font = `${particle.size}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(particle.emoji, 0, 0);
  } else if (particle.type === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.fill();
  } else if (particle.type === 'square') {
    ctx.fillStyle = particle.color;
    ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
  } else if (particle.type === 'star') {
    drawStar(ctx, 0, 0, 5, particle.size / 2, particle.size / 4, particle.color);
  } else if (particle.type === 'heart') {
    drawHeart(ctx, 0, 0, particle.size, particle.color);
  }

  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string) {
  let rot = Math.PI / 2 * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(x, y + topCurveHeight);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 2, x, y + size);
  ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ============================================
// GRADIENT TEXT ANIMATION
// ============================================

export function AnimatedGradientText({ 
  children, 
  colors = ['#ff0080', '#ff8c00', '#40e0d0', '#9370db'],
  speed = 3,
  className = ''
}: { 
  children: string; 
  colors?: string[];
  speed?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={`font-bold ${className}`}
      style={{
        background: `linear-gradient(90deg, ${colors.join(', ')})`,
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
      animate={{
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
      }}
      transition={{
        duration: speed,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// TYPING TEXT ANIMATION
// ============================================

export function TypingText({ 
  text, 
  speed = 100,
  className = '' 
}: { 
  text: string; 
  speed?: number;
  className?: string;
}) {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    setDisplayText('');
    let index = 0;
    const interval = setInterval(() => {
      if (index <= text.length) {
        setDisplayText(text.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span className={className}>{displayText}<span className="animate-pulse">|</span></span>;
}

// ============================================
// FLOATING EMOJI ANIMATION
// ============================================

export function FloatingEmojis({ 
  emojis = ['🎉', '🎊', '✨'],
  count = 10,
  duration = 8000
}: { 
  emojis?: string[];
  count?: number;
  duration?: number;
}) {
  const items = Array.from({ length: count }, (_, i) => ({
    id: i,
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 4,
    duration: 4 + Math.random() * 4,
    size: 1 + Math.random() * 1.5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {items.map((item) => (
        <motion.div
          key={item.id}
          className="absolute"
          style={{
            left: item.left,
            fontSize: `${item.size}rem`,
          }}
          initial={{ y: '120%', opacity: 0, rotate: 0 }}
          animate={{
            y: '-120%',
            opacity: [0, 1, 1, 0],
            rotate: 360,
          }}
          transition={{
            duration: item.duration,
            delay: item.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {item.emoji}
        </motion.div>
      ))}
    </div>
  );
}

// ============================================
// PULSE GLOW EFFECT
// ============================================

export function PulseGlow({ 
  children, 
  color = '#00ffff',
  intensity = 20 
}: { 
  children: React.ReactNode;
  color?: string;
  intensity?: number;
}) {
  return (
    <motion.div
      animate={{
        filter: [
          `drop-shadow(0 0 ${intensity}px ${color})`,
          `drop-shadow(0 0 ${intensity * 2}px ${color})`,
          `drop-shadow(0 0 ${intensity}px ${color})`,
        ],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// ANIMATED ICON CAROUSEL
// ============================================

const iconMap = {
  sparkles: Sparkles,
  zap: Zap,
  star: Star,
  heart: Heart,
  gift: Gift,
  trophy: Trophy,
  crown: Crown,
  rocket: Rocket,
  party: PartyPopper,
  flame: Flame,
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  snowflake: Snowflake,
};

export function AnimatedIconCarousel({ 
  icons = ['sparkles', 'star', 'zap'],
  size = 24,
  colors = ['text-yellow-400', 'text-blue-400', 'text-blue-700 dark:text-blue-400'],
  interval = 2000
}: {
  icons?: Array<keyof typeof iconMap>;
  size?: number;
  colors?: string[];
  interval?: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % icons.length);
    }, interval);
    return () => clearInterval(timer);
  }, [icons.length, interval]);

  const Icon = iconMap[icons[currentIndex]];
  const color = colors[currentIndex % colors.length];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentIndex}
        initial={{ scale: 0, rotate: -180, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0, rotate: 180, opacity: 0 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className={color}
      >
        <Icon size={size} />
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// WAVE TEXT ANIMATION
// ============================================

export function WaveText({ 
  text, 
  className = '',
  delay = 100 
}: { 
  text: string;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`flex ${className}`}>
      {text.split('').map((char, i) => (
        <motion.span
          key={i}
          animate={{
            y: [0, -10, 0],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * (delay / 1000),
            ease: 'easeInOut',
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </div>
  );
}
