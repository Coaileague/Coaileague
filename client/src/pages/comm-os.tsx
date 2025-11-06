import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  MessageSquare, 
  Users, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  PlusCircle,
  Play,
  Settings,
  Eye,
  Ban,
  Download
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { OrganizationChatRoom } from "@shared/schema";

export default function CommOS() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<OrganizationChatRoom | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [newRoomDialogOpen, setNewRoomDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "html">("pdf");

  const isSupportStaff = user?.role === 'platform_admin' || user?.role === 'support_staff';

  // Fetch chat rooms
  const { data: rooms, isLoading } = useQuery<OrganizationChatRoom[]>({
    queryKey: ['/api/comm-os/rooms'],
    enabled: !!user,
  });

  // Fetch onboarding status for organization
  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/comm-os/onboarding-status'],
    enabled: !!user && !isSupportStaff,
  });

  // Join room mutation (support staff only)
  const joinRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`/api/comm-os/rooms/${roomId}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms'] });
      toast({
        title: "Joined room",
        description: "You have successfully joined the chat room",
      });
    },
  });

  // Suspend room mutation (support staff only)
  const suspendRoomMutation = useMutation({
    mutationFn: async ({ roomId, reason }: { roomId: string; reason: string }) => {
      const res = await fetch(`/api/comm-os/rooms/${roomId}/suspend`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms'] });
      setSuspendDialogOpen(false);
      setSuspendReason("");
      toast({
        title: "Room suspended",
        description: "The room has been frozen and no one can chat until it's lifted",
      });
    },
  });

  // Lift suspension mutation
  const liftSuspensionMutation = useMutation({
    mutationFn: async (roomId: string) => {
      const res = await fetch(`/api/comm-os/rooms/${roomId}/lift-suspension`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comm-os/rooms'] });
      toast({
        title: "Suspension lifted",
        description: "The room is now active and users can chat",
      });
    },
  });

  const handleSuspendRoom = (room: OrganizationChatRoom) => {
    setSelectedRoom(room);
    setSuspendDialogOpen(true);
  };

  const confirmSuspend = () => {
    if (selectedRoom && suspendReason.trim()) {
      suspendRoomMutation.mutate({
        roomId: selectedRoom.id,
        reason: suspendReason,
      });
    }
  };

  const handleExportRoom = (room: OrganizationChatRoom) => {
    setSelectedRoom(room);
    setExportDialogOpen(true);
  };

  const confirmExport = async () => {
    if (!selectedRoom) return;

    try {
      const response = await fetch(`/api/chat-export/comm-room/${selectedRoom.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ format: exportFormat }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      if (exportFormat === 'pdf') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatroom-${selectedRoom.roomName || selectedRoom.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Export Successful",
          description: "Chat history PDF downloaded successfully",
        });
      } else {
        const html = await response.text();
        const blob = new Blob([html], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');

        toast({
          title: "Export Successful",
          description: "Chat history HTML opened in new window",
        });
      }

      setExportDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
      case 'suspended':
        return <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Suspended</Badge>;
      case 'closed':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Closed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading CommOS™...</p>
        </div>
      </div>
    );
  }

  // Check if organization needs onboarding
  if (!isSupportStaff && !onboardingStatus?.isCompleted && (!rooms || rooms.length === 0)) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-emerald-600" />
              Welcome to CommOS™
            </CardTitle>
            <CardDescription>
              Set up your organization's communication channels
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              CommOS™ allows your organization to create dedicated chat rooms and channels for your team, customers, and support staff.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-sm">What you'll get:</h4>
              <ul className="text-sm space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>Main chat room for your organization</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>Sub-channels for meetings, departments, and projects</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>Role-based access for owners, admins, members, and guests</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                  <span>Guest access for end customers</span>
                </li>
              </ul>
            </div>
            <Button 
              className="w-full"
              onClick={() => window.location.href = '/comm-os/onboarding'}
              data-testid="button-start-onboarding"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-emerald-600" />
            CommOS™
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSupportStaff 
              ? "Manage all organization chat rooms and channels" 
              : "Your organization's communication channels"}
          </p>
        </div>
        {!isSupportStaff && (
          <Button data-testid="button-create-room">
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Room
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{isSupportStaff ? "All Organization Rooms" : "Your Rooms"}</span>
            {rooms && rooms.length > 0 && (
              <Badge variant="secondary">{rooms.length} {rooms.length === 1 ? 'Room' : 'Rooms'}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isSupportStaff 
              ? "View and manage chat rooms for all onboarded organizations" 
              : "Active chat rooms and channels for your organization"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rooms || rooms.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">No chat rooms found</p>
              {!isSupportStaff && (
                <Button data-testid="button-create-first-room">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Create Your First Room
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room Name</TableHead>
                    {isSupportStaff && <TableHead>Organization</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.id} data-testid={`room-${room.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                          {room.roomName}
                        </div>
                      </TableCell>
                      {isSupportStaff && (
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {room.workspaceId.substring(0, 8)}...
                          </span>
                        </TableCell>
                      )}
                      <TableCell>{getStatusBadge(room.status || 'active')}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">0 / {room.maxMembers || 100}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">0 channels</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isSupportStaff ? (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => joinRoomMutation.mutate(room.id)}
                                data-testid={`button-join-${room.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Join
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleExportRoom(room)}
                                data-testid={`button-export-${room.id}`}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Export
                              </Button>
                              {room.status === 'active' ? (
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => handleSuspendRoom(room)}
                                  data-testid={`button-suspend-${room.id}`}
                                >
                                  <Ban className="w-4 h-4 mr-1" />
                                  Suspend
                                </Button>
                              ) : room.status === 'suspended' ? (
                                <Button 
                                  size="sm" 
                                  variant="ghost"
                                  onClick={() => liftSuspensionMutation.mutate(room.id)}
                                  data-testid={`button-lift-${room.id}`}
                                >
                                  <Unlock className="w-4 h-4 mr-1" />
                                  Lift
                                </Button>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                data-testid={`button-open-${room.id}`}
                              >
                                <Play className="w-4 h-4 mr-1" />
                                Open
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                data-testid={`button-settings-${room.id}`}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suspend Room Dialog */}
      <Dialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <DialogContent data-testid="dialog-suspend-room">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Suspend Room
            </DialogTitle>
            <DialogDescription>
              This will freeze the room and prevent all users from chatting until the suspension is lifted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="suspend-reason">Reason for Suspension</Label>
              <Textarea
                id="suspend-reason"
                placeholder="Explain why this room is being suspended..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="mt-2"
                data-testid="input-suspend-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setSuspendDialogOpen(false)}
              data-testid="button-cancel-suspend"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmSuspend}
              disabled={!suspendReason.trim() || suspendRoomMutation.isPending}
              data-testid="button-confirm-suspend"
            >
              {suspendRoomMutation.isPending ? 'Suspending...' : 'Suspend Room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Chat History Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent data-testid="dialog-export-chat">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" />
              Export Chat History
            </DialogTitle>
            <DialogDescription>
              Download the complete chat history for this room
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Export Format</Label>
              <div className="flex gap-4 mt-2">
                <Button
                  variant={exportFormat === "pdf" ? "default" : "outline"}
                  onClick={() => setExportFormat("pdf")}
                  className="flex-1"
                  data-testid="button-format-pdf"
                >
                  PDF Document
                </Button>
                <Button
                  variant={exportFormat === "html" ? "default" : "outline"}
                  onClick={() => setExportFormat("html")}
                  className="flex-1"
                  data-testid="button-format-html"
                >
                  HTML Page
                </Button>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                This export will include all messages, timestamps, and participant information. It will be logged for compliance purposes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setExportDialogOpen(false)}
              data-testid="button-cancel-export"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmExport}
              data-testid="button-confirm-export"
            >
              <Download className="w-4 h-4 mr-2" />
              Export as {exportFormat.toUpperCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
