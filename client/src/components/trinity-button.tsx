/**
 * Ask Trinity Button - Branded AI interaction button
 * Uses CoAIleague triquetra mark for consistent platform branding
 * @version 3.0.2 - Cache bust fix (2026-01-24)
 */

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TrinityLogo } from '@/components/ui/coaileague-logo-mark';

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
  return <TrinityLogo size={size} className={className} />;
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
    ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/25'
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
      <TrinityLogo size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="mr-2" />
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
      size="lg"
      variant="outline"
      data-testid={testId}
      title="Ask Trinity AI"
      className={cn(
        'relative rounded-full h-11 w-11',
        'border-2 border-cyan-400/60 hover:border-cyan-300',
        'bg-gradient-to-br from-cyan-500/10 to-blue-500/10',
        'hover:bg-gradient-to-br hover:from-cyan-500/20 hover:to-blue-500/20',
        'transition-all duration-300',
        'shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40',
        'flex items-center justify-center',
        className
      )}
    >
      <TrinityLogo size={28} className="text-cyan-400" />
    </Button>
  );
}

// TrinityDesktopButton is INLINED in universal-header.tsx to bypass Replit webview module caching

export default AskTrinityButton;
