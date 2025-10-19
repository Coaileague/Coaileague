/**
 * QueryOS™ - User Diagnostics Panel
 * Universal user information retrieval system for support staff
 * Works on both mobile and desktop platforms
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  User, Building2, Mail, Calendar, Shield, TrendingUp, 
  AlertCircle, CheckCircle, Clock, MessageSquare, Loader2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UserDiagnosticsPanelProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  // Mobile uses Sheet, Desktop uses Dialog
  variant?: 'mobile' | 'desktop';
}

export function UserDiagnosticsPanel({ 
  userId, 
  open, 
  onClose, 
  variant = 'desktop' 
}: UserDiagnosticsPanelProps) {
  // QueryOS™ - User Context Query
  const { data: userContext, isLoading, error } = useQuery({
    queryKey: ['/api/helpdesk/user-context', userId],
    enabled: !!userId && open,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
    queryFn: async () => {
      if (!userId) return null;
      const response = await fetch(`/api/helpdesk/user-context/${userId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch user context: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('📊 UserContext Data:', data);
      return data;
    },
  });

  const content = (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-8" data-testid="loading-user-info">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading user information...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-md" data-testid="error-user-info">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive">Failed to load user information</span>
        </div>
      )}

      {userContext && !isLoading && (
        <div className="space-y-6" data-testid="user-context-loaded">
          {/* User Profile Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">User Profile</h3>
            </div>
            <div className="space-y-2 pl-6">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium" data-testid="text-user-name">
                  {userContext.user?.firstName} {userContext.user?.lastName}
                </span>
                
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium text-xs break-all" data-testid="text-user-email">
                  {userContext.user?.email}
                </span>

                {userContext.user?.phone && (
                  <>
                    <span className="text-muted-foreground">Phone:</span>
                    <span className="font-medium text-xs" data-testid="text-user-phone">
                      {userContext.user.phone}
                    </span>
                  </>
                )}

                <span className="text-muted-foreground">User ID:</span>
                <span className="text-xs font-mono break-all" data-testid="text-user-id">
                  {userContext.user?.id}
                </span>

                {userContext.user?.platformRole && userContext.user.platformRole !== 'none' && (
                  <>
                    <span className="text-muted-foreground">Platform Role:</span>
                    <Badge variant="outline" className="w-fit" data-testid="badge-platform-role">
                      <Shield className="w-3 h-3 mr-1" />
                      {userContext.user.platformRole}
                    </Badge>
                  </>
                )}

                <span className="text-muted-foreground">Joined:</span>
                <span className="text-xs">
                  {userContext.user?.createdAt 
                    ? formatDistanceToNow(new Date(userContext.user.createdAt), { addSuffix: true })
                    : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Workspace Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Workspace</h3>
            </div>
            {userContext.workspace ? (
              <div className="space-y-2 pl-6">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium" data-testid="text-workspace-name">
                    {userContext.workspace.name}
                  </span>

                  {userContext.workspace.companyName && (
                    <>
                      <span className="text-muted-foreground">Company:</span>
                      <span className="font-medium text-xs" data-testid="text-company-name">
                        {userContext.workspace.companyName}
                      </span>
                    </>
                  )}

                  <span className="text-muted-foreground">Workspace ID:</span>
                  <span className="text-xs font-mono break-all" data-testid="text-workspace-id">
                    {userContext.workspace.id}
                  </span>

                  {userContext.workspace.organizationId && (
                    <>
                      <span className="text-muted-foreground">Org ID:</span>
                      <span className="text-xs font-mono break-all" data-testid="text-org-id">
                        {userContext.workspace.organizationId}
                      </span>
                    </>
                  )}

                  {userContext.workspace.organizationSerial && (
                    <>
                      <span className="text-muted-foreground">Org Serial:</span>
                      <span className="text-xs font-mono" data-testid="text-org-serial">
                        {userContext.workspace.organizationSerial}
                      </span>
                    </>
                  )}

                  <span className="text-muted-foreground">Role:</span>
                  <Badge variant="secondary" className="w-fit">
                    {userContext.workspace.role || 'Member'}
                  </Badge>
                </div>

                {/* Subscription Info - Separate Row for Better Spacing */}
                {userContext.workspace.subscriptionTier && (
                  <div className="grid grid-cols-2 gap-2 text-sm mt-2 pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">Subscription Tier:</span>
                    <Badge variant="outline" className="w-fit text-xs capitalize" data-testid="badge-subscription-tier">
                      {userContext.workspace.subscriptionTier}
                    </Badge>
                    
                    {userContext.workspace.subscriptionStatus && (
                      <>
                        <span className="text-muted-foreground">Status:</span>
                        <Badge 
                          variant={userContext.workspace.subscriptionStatus === 'active' ? 'default' : 'destructive'} 
                          className="w-fit text-xs capitalize"
                          data-testid="badge-subscription-status"
                        >
                          {userContext.workspace.subscriptionStatus}
                        </Badge>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pl-6">No workspace associated</p>
            )}
          </div>

          <Separator />

          {/* Tickets Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Support Tickets</h3>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-6">
              <div className="text-center p-2 bg-card rounded-md border">
                <div className="text-lg font-bold text-destructive" data-testid="text-active-tickets">
                  {userContext.tickets?.active?.length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
              <div className="text-center p-2 bg-card rounded-md border">
                <div className="text-lg font-bold text-green-500" data-testid="text-resolved-tickets">
                  {userContext.tickets?.history?.length || 0}
                </div>
                <div className="text-xs text-muted-foreground">Resolved</div>
              </div>
              <div className="text-center p-2 bg-card rounded-md border">
                <div className="text-lg font-bold text-blue-500">
                  {userContext.metrics?.resolutionRate || 0}%
                </div>
                <div className="text-xs text-muted-foreground">Rate</div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Chat History Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Recent Chat Activity</h3>
            </div>
            {userContext.chatHistory && userContext.chatHistory.length > 0 ? (
              <ScrollArea className="h-32 pl-6">
                <div className="space-y-2">
                  {userContext.chatHistory.slice(0, 5).map((msg: any, idx: number) => (
                    <div key={idx} className="text-xs p-2 bg-card rounded border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{msg.roomSlug || 'main'}</span>
                        <span className="text-muted-foreground">
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate">{msg.message}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground pl-6">No recent chat history</p>
            )}
          </div>

          {/* Simulated User Notice */}
          {userContext.note && (
            <>
              <Separator />
              <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
                <AlertCircle className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-blue-500">{userContext.note}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  // Mobile variant uses Sheet (slide-in from bottom)
  if (variant === 'mobile') {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent side="bottom" className="h-[90vh] flex flex-col overflow-hidden">
          <SheetHeader className="flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              User Diagnostics - QueryOS™
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop variant uses Dialog (modal)
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            User Diagnostics - QueryOS™
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
