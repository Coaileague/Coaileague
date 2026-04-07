
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { Badge } from "@/components/ui/badge";
import { Building2, Check, ChevronsUpDown, GitBranch, MapPin, Settings, Search, Users } from "lucide-react";
import { useLocation } from "wouter";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { broadcastWorkspaceSwitch } from "@/lib/tabSync";

interface ManagedOrg {
  id: string;
  name: string;
  memberCount: number;
  clientCount: number;
  isOwner: boolean;
  canManage: boolean;
  subscriptionStatus: string;
  isSuspended: boolean;
  isFrozen: boolean;
  isSubOrg: boolean;
  parentWorkspaceId: string | null;
  subOrgLabel: string | null;
  primaryOperatingState: string | null;
  operatingStates: string[];
}

export function WorkspaceSwitcher() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { isPlatformStaff } = useWorkspaceAccess();
  const { toast } = useToast();
  
  const { data: currentWorkspace } = useQuery<{
    id: string;
    name: string;
    externalId?: string;
  }>({
    queryKey: ['/api/workspace'],
  });

  const { data: managedOrgs } = useQuery<ManagedOrg[]>({
    queryKey: ['/api/organizations/managed'],
    enabled: open,
    staleTime: 30 * 1000,
  });

  const switchWorkspace = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest('POST', `/api/workspace/switch/${workspaceId}`);
      return res.json();
    },
    onSuccess: (_, workspaceId) => {
      queryClient.clear();
      broadcastWorkspaceSwitch(workspaceId);
      toast({
        title: "Workspace switched",
        description: "You are now viewing a different organization.",
      });
      setTimeout(() => window.location.reload(), 300);
    },
    onError: () => {
      toast({
        title: "Switch failed",
        description: "Could not switch to that organization.",
        variant: "destructive",
      });
    },
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const filteredOrgs = managedOrgs?.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const showOrgList = managedOrgs && managedOrgs.length > 1;

  const groupedOrgs = (() => {
    if (!filteredOrgs.length) return [];
    const parentOrgs = filteredOrgs.filter(org => !org.isSubOrg);
    const subOrgs = filteredOrgs.filter(org => org.isSubOrg);
    const result: ManagedOrg[] = [];
    for (const parent of parentOrgs) {
      result.push(parent);
      const children = subOrgs.filter(sub => sub.parentWorkspaceId === parent.id);
      result.push(...children);
    }
    const orphanSubs = subOrgs.filter(sub => !parentOrgs.some(p => p.id === sub.parentWorkspaceId));
    result.push(...orphanSubs);
    return result;
  })();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between gap-2 px-2"
          data-testid="button-workspace-switcher"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[220px]">
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback className="text-xs font-semibold">
                {currentWorkspace?.name ? getInitials(currentWorkspace.name) : <Building2 className="h-3.5 w-3.5" />}
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
          {showOrgList ? 'Organizations' : 'Your Workspace'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {showOrgList && (
          <>
            <div className="px-2 py-1.5">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search organizations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  data-testid="input-org-search"
                />
              </div>
            </div>
            <DropdownMenuSeparator />
            <ScrollArea className="max-h-[240px]">
              {groupedOrgs.map((org) => {
                const isCurrent = org.id === currentWorkspace?.id;
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => {
                      if (!isCurrent) {
                        switchWorkspace.mutate(org.id);
                      }
                    }}
                    className={`cursor-pointer flex items-center gap-2 py-2 ${org.isSubOrg ? 'pl-4' : ''}`}
                    data-testid={`menu-org-${org.id}`}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs font-semibold">
                        {org.isSubOrg ? <GitBranch className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{org.name}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <Users className="h-3 w-3" />
                          {org.memberCount}
                        </span>
                        {org.isSubOrg && org.primaryOperatingState && (
                          <span
                            className="text-[11px] text-muted-foreground flex items-center gap-0.5"
                            data-testid={`text-org-state-${org.id}`}
                          >
                            <MapPin className="h-3 w-3" />
                            {org.primaryOperatingState}
                          </span>
                        )}
                        {org.isSuspended && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">Suspended</Badge>
                        )}
                        {org.isFrozen && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">Frozen</Badge>
                        )}
                      </div>
                    </div>
                    {isCurrent && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                );
              })}
              {filteredOrgs.length === 0 && searchQuery && (
                <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                  No organizations found
                </div>
              )}
            </ScrollArea>
            <DropdownMenuSeparator />
          </>
        )}

        {!showOrgList && (
          <>
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Your organization
                  </p>
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        
        <DropdownMenuItem
          onClick={() => setLocation('/settings')}
          className="cursor-pointer"
          data-testid="menu-workspace-settings"
        >
          <Settings className="mr-2 h-4 w-4" />
          <span>Workspace Settings</span>
        </DropdownMenuItem>

        {isPlatformStaff && (
          <DropdownMenuItem
            onClick={() => setLocation('/org-management')}
            className="cursor-pointer"
            data-testid="menu-org-management"
          >
            <Building2 className="mr-2 h-4 w-4" />
            <span>Manage All Organizations</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
