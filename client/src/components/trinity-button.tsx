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

export default AskTrinityButton;
