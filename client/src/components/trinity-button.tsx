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
  // Use unique IDs to prevent SVG gradient conflicts
  const uniqueId = `trinity-${Math.random().toString(36).slice(2, 9)}`;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      className={cn("flex-shrink-0", className)}
    >
      <defs>
        <linearGradient id={`${uniqueId}-teal`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-cyan`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-blue`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={`${uniqueId}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.5" />
        </radialGradient>
        <filter id={`${uniqueId}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Trinity Triquetra - 3 interlocking loops */}
      {/* Loop 1 - Top (Teal) */}
      <path 
        d="M 50 12 C 70 12, 82 30, 82 48 C 82 58, 72 70, 50 50 C 28 70, 18 58, 18 48 C 18 30, 30 12, 50 12 Z"
        fill={`url(#${uniqueId}-teal)`}
        filter={`url(#${uniqueId}-glow)`}
      />
      
      {/* Loop 2 - Bottom Left (Cyan) */}
      <path 
        d="M 22 80 C 10 68, 10 48, 22 36 C 32 26, 48 32, 50 50 C 42 64, 30 76, 22 80 C 32 92, 48 90, 50 78 Z"
        fill={`url(#${uniqueId}-cyan)`}
        filter={`url(#${uniqueId}-glow)`}
      />
      
      {/* Loop 3 - Bottom Right (Blue) */}
      <path 
        d="M 78 80 C 90 68, 90 48, 78 36 C 68 26, 52 32, 50 50 C 58 64, 70 76, 78 80 C 68 92, 52 90, 50 78 Z"
        fill={`url(#${uniqueId}-blue)`}
        filter={`url(#${uniqueId}-glow)`}
      />
      
      {/* Central core */}
      <circle cx="50" cy="50" r="10" fill={`url(#${uniqueId}-core)`} filter={`url(#${uniqueId}-glow)`} />
      <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95"/>
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
