/**
 * HEADER TRINITY BUTTON
 * =====================
 * Trinity Chat access point in the main header.
 * Only visible to authorized roles (org_owner, co_owner, manager, etc.).
 * Opens the Trinity modal chat interface.
 */

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrinityIconStatic } from '@/components/trinity-button';
import { useWorkspaceAccess } from '@/hooks/useWorkspaceAccess';
import { isTrinityAccessAllowed } from '@/config/trinity';
import { useTrinityModal } from '@/components/trinity-chat-modal';

export function HeaderTrinityButton() {
  const { openModal } = useTrinityModal();
  const { workspaceRole, platformRole, isLoading } = useWorkspaceAccess();

  if (isLoading) return null;

  if (!isTrinityAccessAllowed(workspaceRole, platformRole)) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          onClick={openModal}
          data-testid="button-header-trinity"
          className="relative h-10 w-10 rounded-full border-2 border-cyan-400/60 hover:border-cyan-300 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
          aria-label="Open Trinity AI Assistant"
        >
          <div className="w-full h-full flex items-center justify-center">
            <TrinityIconStatic size={24} className="text-cyan-400" />
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-400/50" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-cyan-950 border border-cyan-700 text-cyan-200">
        <p className="font-semibold">Open Trinity AI</p>
      </TooltipContent>
    </Tooltip>
  );
}
