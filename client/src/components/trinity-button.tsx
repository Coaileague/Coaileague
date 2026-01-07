/**
 * Ask Trinity Button - Branded AI interaction button
 * Uses inline Trinity logo for consistent platform branding
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AskTrinityButtonProps {
  onClick?: () => void;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost';
  showLabel?: boolean;
  label?: string;
  disabled?: boolean;
  'data-testid'?: string;
}

function TrinityIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      className={cn("flex-shrink-0", className)}
    >
      <defs>
        <radialGradient id="trinityCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFE0" />
          <stop offset="50%" stopColor="#00BFFF" />
          <stop offset="100%" stopColor="#006699" />
        </radialGradient>
        <linearGradient id="petalGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFA500" />
        </linearGradient>
        <linearGradient id="petalTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00BFFF" />
          <stop offset="100%" stopColor="#008B8B" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {[0, 72, 144, 216, 288].map((angle, i) => (
        <ellipse
          key={i}
          cx="50"
          cy="28"
          rx="8"
          ry="22"
          fill={`url(#petal${i % 2 === 0 ? 'Gold' : 'Teal'})`}
          transform={`rotate(${angle} 50 50)`}
          filter="url(#glow)"
          opacity="0.9"
        />
      ))}
      
      <circle 
        cx="50" 
        cy="50" 
        r="12" 
        fill="url(#trinityCore)" 
        filter="url(#glow)"
      />
      
      <circle 
        cx="50" 
        cy="50" 
        r="6" 
        fill="#FFFFE0" 
        opacity="0.8"
      />
    </svg>
  );
}

export function TrinityIconStatic({ size = 16, className }: { size?: number; className?: string }) {
  return <TrinityIcon size={size} className={className} />;
}

export function AskTrinityButton({
  onClick,
  className,
  size = 'default',
  variant = 'default',
  showLabel = true,
  label = 'Ask Trinity',
  disabled = false,
  'data-testid': testId = 'button-ask-trinity',
}: AskTrinityButtonProps) {
  const baseGradient = variant === 'default' 
    ? 'bg-gradient-to-r from-[#00BFFF] via-[#3b82f6] to-[#FFD700] hover:from-[#0099CC] hover:via-[#2563eb] hover:to-[#FFA500] text-white shadow-lg shadow-blue-500/25'
    : '';

  return (
    <Button
      onClick={onClick}
      size={size}
      variant={variant === 'default' ? 'default' : variant}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        baseGradient,
        'font-semibold transition-all duration-300',
        variant === 'default' && 'border-0',
        className
      )}
    >
      <TrinityIcon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="mr-2" />
      {showLabel && <span>{label}</span>}
    </Button>
  );
}

export function TrinityMiniButton({
  onClick,
  className,
  'data-testid': testId = 'button-trinity-mini',
}: Pick<AskTrinityButtonProps, 'onClick' | 'className' | 'data-testid'>) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      variant="ghost"
      data-testid={testId}
      className={cn(
        'relative rounded-full hover:bg-blue-500/10',
        className
      )}
    >
      <TrinityIcon size={20} />
    </Button>
  );
}

export default AskTrinityButton;
