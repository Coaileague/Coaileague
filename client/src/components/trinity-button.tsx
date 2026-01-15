/**
 * Ask Trinity Button - Branded AI interaction button
 * Uses Trinity Mascot flower logo for consistent platform branding
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TrinityMascotIcon } from '@/components/ui/trinity-mascot';

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

export function TrinityIconStatic({ size = 16, className }: { size?: number; className?: string }) {
  return <TrinityMascotIcon size={size} className={className} />;
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
      <TrinityMascotIcon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="mr-2" />
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
      title="Ask Trinity AI"
      className={cn(
        'relative rounded-full h-11 w-11',
        'hover:bg-gradient-to-r hover:from-purple-500/15 hover:via-teal-500/15 hover:to-amber-500/15',
        'transition-all duration-300 hover:scale-110',
        'ring-2 ring-purple-400/30 hover:ring-purple-500/50',
        'shadow-sm hover:shadow-md hover:shadow-purple-500/20',
        className
      )}
    >
      <TrinityMascotIcon size={32} />
    </Button>
  );
}

/**
 * TrinityDesktopButton - Larger, more visible Trinity button for desktop headers
 * Features curved "Ask Trinity" text wrapping around the bottom of the icon
 * Uses Fortune 500 Blue/Cyan branding (#06b6d4, #22d3ee, #2dd4bf)
 */
export function TrinityDesktopButton({
  onClick,
  className,
  'data-testid': testId = 'button-trinity-desktop',
}: Pick<AskTrinityButtonProps, 'onClick' | 'className' | 'data-testid'>) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title="Ask Trinity AI"
      className={cn(
        'relative group flex flex-col items-center justify-center',
        'w-16 h-16 rounded-full cursor-pointer',
        'bg-gradient-to-br from-slate-900/90 via-slate-800/95 to-slate-900/90',
        'hover:from-slate-800/95 hover:via-slate-700/95 hover:to-slate-800/95',
        'border-2 border-cyan-500/40 hover:border-cyan-400/60',
        'shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-400/30',
        'transition-all duration-300 hover:scale-105',
        'ring-1 ring-cyan-400/20 hover:ring-cyan-300/40',
        className
      )}
    >
      {/* Glow effect behind icon */}
      <div className="absolute inset-0 rounded-full bg-gradient-radial from-cyan-400/15 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* Trinity mascot icon - centered and larger */}
      <div className="relative z-10 -mt-1">
        <TrinityMascotIcon size={36} />
      </div>
      
      {/* Curved "Ask Trinity" text using SVG */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 64 64"
      >
        <defs>
          {/* Curved path for text at bottom of circle */}
          <path
            id="askTrinityArc"
            d="M 8,42 Q 32,58 56,42"
            fill="none"
          />
        </defs>
        <text
          className="fill-cyan-400 group-hover:fill-cyan-300 transition-colors duration-300"
          fontSize="7"
          fontWeight="600"
          letterSpacing="0.5"
        >
          <textPath
            href="#askTrinityArc"
            startOffset="50%"
            textAnchor="middle"
          >
            Ask Trinity
          </textPath>
        </text>
      </svg>
      
      {/* Subtle pulse animation ring */}
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping opacity-20 group-hover:opacity-40" style={{ animationDuration: '2s' }} />
    </button>
  );
}

export default AskTrinityButton;
