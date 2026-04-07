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
          variant="ghost"
          size="icon"
          onClick={openModal}
          data-testid="button-header-trinity"
          className="relative"
          aria-label="Open Trinity AI Assistant"
        >
          <div className="w-5 h-5 flex items-center justify-center">
            <TrinityIconStatic size={20} />
          </div>
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Ask Trinity</p>
      </TooltipContent>
    </Tooltip>
  );
}
