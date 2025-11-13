
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HelpCircle,
  Book,
  MessageSquare,
  Keyboard,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { ServiceFailureDialog } from "@/components/errors/ServiceFailureDialog";

export function HelpDropdown() {
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-help">
                <HelpCircle className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Help & Support</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Help & Support</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.open('/help', '_blank')}>
            <Book className="mr-2 h-4 w-4" />
            <span>Documentation</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.location.href = '/chat'}>
            <MessageSquare className="mr-2 h-4 w-4" />
            <span>Live Chat Support</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true });
              document.dispatchEvent(event);
            }}
          >
            <Keyboard className="mr-2 h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowIncidentDialog(true)} data-testid="menu-item-report-issue">
            <AlertTriangle className="mr-2 h-4 w-4" />
            <span>Report Technical Issue</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open('/contact', '_blank')}>
            <ExternalLink className="mr-2 h-4 w-4" />
            <span>Contact Support</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Service Failure Dialog */}
      <ServiceFailureDialog
        error={null}
        isOpen={showIncidentDialog}
        onClose={() => setShowIncidentDialog(false)}
        onReset={() => setShowIncidentDialog(false)}
      />
    </>
  );
}
