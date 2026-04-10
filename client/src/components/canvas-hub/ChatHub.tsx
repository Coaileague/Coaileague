/**
 * ChatHub - Universal Canvas Hub Chat Entry Point
 * 
 * Provides a unified chat interface that:
 * - Integrates with Canvas Hub layer management
 * - Works seamlessly on desktop and mobile
 * - Routes to appropriate chat experience based on user role
 * - Manages chat modals/sheets through LayerManager
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Headphones, Bot, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEmployee } from "@/hooks/useEmployee";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useManagedLayer } from "./LayerManager";
import { MobileResponsiveSheet } from "./MobileResponsiveSheet";
import { cn } from "@/lib/utils";

export interface ChatHubConfig {
  defaultMode?: "helpdesk" | "support" | "org-chat" | "trinity";
  showUnreadBadge?: boolean;
  position?: "bottom-right" | "bottom-left" | "header";
}

interface ChatHubProps {
  config?: ChatHubConfig;
  className?: string;
}

type ChatMode = "helpdesk" | "support" | "org-chat" | "trinity";

const CHAT_MODES: Record<ChatMode, { label: string; icon: typeof MessageSquare; route: string; description: string }> = {
  helpdesk: {
    label: "Help Desk",
    icon: Headphones,
    route: "/chatrooms",
    description: "Get help from HelpAI and support team",
  },
  support: {
    label: "Support Dashboard",
    icon: Users,
    route: "/support/chatrooms",
    description: "Staff support dashboard",
  },
  "org-chat": {
    label: "Organization Chat",
    icon: MessageSquare,
    route: "/org-chat",
    description: "Chat with your team",
  },
  trinity: {
    label: "Trinity AI",
    icon: Bot,
    route: "/trinity",
    description: "Ask Trinity AI for help",
  },
};

/**
 * ChatHubButton - Floating button to open chat hub
 */
export function ChatHubButton({ 
  onClick, 
  unreadCount = 0,
  className 
}: { 
  onClick: () => void; 
  unreadCount?: number;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className={cn(
        "relative h-12 w-12 rounded-full shadow-sm",
        "bg-primary hover:bg-primary/90",
        className
      )}
      data-testid="button-chat-hub"
    >
      <MessageSquare className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge 
          variant="destructive" 
          className="absolute -top-1 -right-1 min-w-5 h-5 px-1 flex items-center justify-center text-xs"
        >
          {unreadCount}
        </Badge>
      )}
    </Button>
  );
}

/**
 * ChatHubPanel - The chat selection panel
 */
export function ChatHubPanel({
  onSelectMode,
  onClose,
  availableModes,
}: {
  onSelectMode: (mode: ChatMode) => void;
  onClose: () => void;
  availableModes: ChatMode[];
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <h2 className="text-lg font-semibold">Chat Options</h2>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-chat-hub">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex-1 p-4 space-y-3">
        {availableModes.map((mode) => {
          const config = CHAT_MODES[mode];
          const Icon = config.icon;
          
          return (
            <Button
              key={mode}
              variant="outline"
              className="w-full justify-start gap-3 h-auto py-3"
              onClick={() => onSelectMode(mode)}
              data-testid={`button-chat-mode-${mode}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">{config.label}</span>
                <span className="text-xs text-muted-foreground">{config.description}</span>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ChatHub - Main component that manages chat entry
 */
export function ChatHub({ config = {}, className }: ChatHubProps) {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount] = useState(0);
  
  // Apply config defaults
  const { 
    defaultMode,
    showUnreadBadge = true,
  } = config;
  
  // Register with layer manager
  // @ts-expect-error — TS migration: fix in refactoring sprint
  const { register, unregister } = useManagedLayer({
    id: "chat-hub",
    type: "sheet",
    priority: 50,
  });

  // Determine available modes based on user role
  const getAvailableModes = useCallback((): ChatMode[] => {
    const modes: ChatMode[] = [];
    
    if (!user) {
      // Guest: only helpdesk and trinity
      modes.push("helpdesk");
      modes.push("trinity");
    } else {
      // Authenticated user
      const platformRole = (employee as any)?.platformRole;
      const isStaff = platformRole && ["root_admin", "deputy_admin", "support_manager", "sysop"].includes(platformRole);
      
      if (isStaff) {
        modes.push("support");
      }
      
      modes.push("helpdesk");
      modes.push("org-chat");
      modes.push("trinity");
    }
    
    return modes;
  }, [user, employee]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    register();
  }, [register]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    unregister();
  }, [unregister]);

  const handleSelectMode = useCallback((mode: ChatMode) => {
    const route = CHAT_MODES[mode].route;
    setLocation(route);
    handleClose();
  }, [setLocation, handleClose]);

  const availableModes = getAvailableModes();

  // Handle button click with config.defaultMode support
  const handleButtonClick = useCallback(() => {
    // If defaultMode is configured and available, go directly there
    if (defaultMode && availableModes.includes(defaultMode)) {
      handleSelectMode(defaultMode);
      return;
    }
    
    // If only one mode available, go directly there
    if (availableModes.length === 1) {
      handleSelectMode(availableModes[0]);
      return;
    }
    
    // Otherwise show the mode selection panel
    handleOpen();
  }, [availableModes, defaultMode, handleSelectMode, handleOpen]);

  return (
    <>
      <ChatHubButton 
        onClick={handleButtonClick} 
        className={className}
        unreadCount={showUnreadBadge ? unreadCount : 0}
      />
      
      <MobileResponsiveSheet
        open={isOpen}
        onOpenChange={(open) => open ? handleOpen() : handleClose()}
        title="Chat Options"
        side={isMobile ? "bottom" : "right"}
      >
        <ChatHubPanel
          onSelectMode={handleSelectMode}
          onClose={handleClose}
          availableModes={availableModes}
        />
      </MobileResponsiveSheet>
    </>
  );
}

export default ChatHub;
