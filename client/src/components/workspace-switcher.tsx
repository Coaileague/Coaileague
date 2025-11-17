
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Check, ChevronsUpDown, Settings, Eye } from "lucide-react";
import { useLocation } from "wouter";

export function WorkspaceSwitcher() {
  const [, setLocation] = useLocation();
  
  const { data: currentWorkspace } = useQuery<{
    id: string;
    name: string;
    externalId?: string;
  }>({
    queryKey: ['/api/workspace'],
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="max-w-[240px] justify-between gap-2 px-2"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="h-6 w-6 shrink-0">
              <AvatarFallback className="text-xs">
                {currentWorkspace?.name ? getInitials(currentWorkspace.name) : <Building2 className="h-3 w-3" />}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium truncate">
              {currentWorkspace?.name || 'Select Workspace'}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Your Workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Current Workspace Details */}
        <div className="px-2 py-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-sm bg-primary/10 text-primary">
                {currentWorkspace?.name ? getInitials(currentWorkspace.name) : <Building2 className="h-5 w-5" />}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {currentWorkspace?.name || 'Loading...'}
              </p>
              {currentWorkspace?.externalId && (
                <p className="text-xs text-muted-foreground font-mono">
                  {currentWorkspace.externalId}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Your organization workspace
              </p>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />
        
        {/* Workspace Actions */}
        <DropdownMenuItem
          onClick={() => setLocation('/settings')}
          className="cursor-pointer"
          data-testid="menu-workspace-settings"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Workspace Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
