
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
import { Building2, Check, Plus, ChevronsUpDown } from "lucide-react";

export function WorkspaceSwitcher() {
  const { data: currentWorkspace } = useQuery({
    queryKey: ['/api/workspace'],
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['/api/workspaces/all'],
    enabled: false, // Only fetch when dropdown opens
  });

  const switchWorkspace = async (workspaceId: string) => {
    await apiRequest(`/api/workspace/switch/${workspaceId}`, {
      method: 'POST',
    });
    window.location.reload();
  };

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
          className="w-full justify-between gap-2 px-2"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="h-6 w-6">
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
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.length > 0 ? (
          workspaces.map((workspace: any) => (
            <DropdownMenuItem
              key={workspace.id}
              onClick={() => switchWorkspace(workspace.id)}
              className="cursor-pointer"
            >
              <Avatar className="h-6 w-6 mr-2">
                <AvatarFallback className="text-xs">
                  {getInitials(workspace.name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1">{workspace.name}</span>
              {currentWorkspace?.id === workspace.id && (
                <Check className="h-4 w-4 ml-2" />
              )}
            </DropdownMenuItem>
          ))
        ) : (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            No other workspaces
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => (window.location.href = '/create-org')}
          className="cursor-pointer"
        >
          <Plus className="mr-2 h-4 w-4" />
          <span>Create Workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
