/**
 * Support Command Panel - Force-Push Updates Control Center
 * Allows support staff to push What's New, notifications, and system messages
 * to all connected clients in real-time.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Megaphone, Bell, RefreshCw, Wrench, AlertTriangle, 
  Send, Loader2, CheckCircle, Radio, Zap, Sparkles,
  MessageCircle, RotateCcw, TrendingUp
} from "lucide-react";

interface CommandResponse {
  success: boolean;
  message: string;
  [key: string]: any;
}

export function SupportCommandPanel() {
  const { toast } = useToast();
  const [whatsNewTitle, setWhatsNewTitle] = useState("");
  const [whatsNewDescription, setWhatsNewDescription] = useState("");
  const [whatsNewCategory, setWhatsNewCategory] = useState("announcement");
  const [systemMessage, setSystemMessage] = useState("");
  const [messageSeverity, setMessageSeverity] = useState("info");
  
  const [mascotMode, setMascotMode] = useState("idle");
  const [mascotPersona, setMascotPersona] = useState("friendly");
  const [mascotEmote, setMascotEmote] = useState("curious");
  const [mascotSpeech, setMascotSpeech] = useState("");
  const [businessFocus, setBusinessFocus] = useState("general");

  const forceWhatsNewMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; category: string }): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/force-whats-new', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Update Pushed", description: data.message });
      setWhatsNewTitle("");
      setWhatsNewDescription("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const broadcastMessageMutation = useMutation({
    mutationFn: async (data: { message: string; severity: string }): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/broadcast-message', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Message Broadcast", description: data.message });
      setSystemMessage("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const forceSyncMutation = useMutation({
    mutationFn: async (syncTypes: string[]): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/force-sync', { syncTypes });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Force Sync", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mascotControlMutation = useMutation({
    mutationFn: async (data: { mode?: string; persona?: string; emote?: string; speech?: string; businessFocus?: string }): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/mascot/control', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Mascot Updated", description: data.message });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mascotSpeakMutation = useMutation({
    mutationFn: async (data: { message: string; immediate?: boolean }): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/mascot/speak', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Mascot Speech", description: data.message });
      setMascotSpeech("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const businessAdviceMutation = useMutation({
    mutationFn: async (data: { focus: string; broadcast?: boolean }): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/mascot/business-advice', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Business Advice Generated", description: "AI-powered insights broadcast to all clients" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const mascotResetMutation = useMutation({
    mutationFn: async (): Promise<CommandResponse> => {
      const res = await apiRequest('POST', '/api/support/command/mascot/reset', {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Mascot Reset", description: data.message });
      setMascotMode("idle");
      setMascotPersona("friendly");
      setMascotEmote("curious");
      setMascotSpeech("");
      setBusinessFocus("general");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border-2 border-dashed border-yellow-500/50 bg-yellow-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-yellow-500 animate-pulse" />
          <CardTitle className="text-lg">Support Command Console</CardTitle>
          <Badge variant="outline" className="ml-auto border-yellow-500 text-yellow-600">
            <Zap className="h-3 w-3 mr-1" />
            Live
          </Badge>
        </div>
        <CardDescription>
          Force-push real-time updates to all connected clients
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="whats-new" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="whats-new" className="text-xs">
              <Megaphone className="h-3 w-3 mr-1" />
              What's New
            </TabsTrigger>
            <TabsTrigger value="broadcast" className="text-xs">
              <Bell className="h-3 w-3 mr-1" />
              Broadcast
            </TabsTrigger>
            <TabsTrigger value="mascot" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Mascot
            </TabsTrigger>
            <TabsTrigger value="sync" className="text-xs">
              <RefreshCw className="h-3 w-3 mr-1" />
              Sync
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whats-new" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label htmlFor="whats-new-title">Title</Label>
              <Input
                id="whats-new-title"
                placeholder="New Feature: AI Brain Improvements"
                value={whatsNewTitle}
                onChange={(e) => setWhatsNewTitle(e.target.value)}
                data-testid="input-whats-new-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whats-new-description">Description</Label>
              <Textarea
                id="whats-new-description"
                placeholder="Describe the update..."
                value={whatsNewDescription}
                onChange={(e) => setWhatsNewDescription(e.target.value)}
                rows={3}
                data-testid="input-whats-new-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whats-new-category">Category</Label>
              <Select value={whatsNewCategory} onValueChange={setWhatsNewCategory}>
                <SelectTrigger data-testid="select-whats-new-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="bugfix">Bug Fix</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="announcement">Announcement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={() => forceWhatsNewMutation.mutate({
                title: whatsNewTitle,
                description: whatsNewDescription,
                category: whatsNewCategory,
              })}
              disabled={!whatsNewTitle || !whatsNewDescription || forceWhatsNewMutation.isPending}
              className="w-full"
              data-testid="button-push-whats-new"
            >
              {forceWhatsNewMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Push What's New Update
            </Button>
          </TabsContent>

          <TabsContent value="broadcast" className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label htmlFor="system-message">Message</Label>
              <Textarea
                id="system-message"
                placeholder="Enter system-wide message..."
                value={systemMessage}
                onChange={(e) => setSystemMessage(e.target.value)}
                rows={3}
                data-testid="input-broadcast-message"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message-severity">Severity</Label>
              <Select value={messageSeverity} onValueChange={setMessageSeverity}>
                <SelectTrigger data-testid="select-message-severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={() => broadcastMessageMutation.mutate({
                message: systemMessage,
                severity: messageSeverity,
              })}
              disabled={!systemMessage || broadcastMessageMutation.isPending}
              className="w-full"
              variant={messageSeverity === 'error' ? 'destructive' : 'default'}
              data-testid="button-broadcast-message"
            >
              {broadcastMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Megaphone className="h-4 w-4 mr-2" />
              )}
              Broadcast to All Users
            </Button>
          </TabsContent>

          <TabsContent value="mascot" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mascot-mode">Mode</Label>
                <Select value={mascotMode} onValueChange={setMascotMode}>
                  <SelectTrigger data-testid="select-mascot-mode">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="advising">Advising</SelectItem>
                    <SelectItem value="celebrating">Celebrating</SelectItem>
                    <SelectItem value="alerting">Alerting</SelectItem>
                    <SelectItem value="teaching">Teaching</SelectItem>
                    <SelectItem value="business_buddy">Business Buddy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mascot-persona">Persona</Label>
                <Select value={mascotPersona} onValueChange={setMascotPersona}>
                  <SelectTrigger data-testid="select-mascot-persona">
                    <SelectValue placeholder="Select persona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="playful">Playful</SelectItem>
                    <SelectItem value="serious">Serious</SelectItem>
                    <SelectItem value="motivational">Motivational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mascot-emote">Emote</Label>
              <Select value={mascotEmote} onValueChange={setMascotEmote}>
                <SelectTrigger data-testid="select-mascot-emote">
                  <SelectValue placeholder="Select emote" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="idle">Idle</SelectItem>
                  <SelectItem value="curious">Curious</SelectItem>
                  <SelectItem value="happy">Happy</SelectItem>
                  <SelectItem value="thinking">Thinking</SelectItem>
                  <SelectItem value="excited">Excited</SelectItem>
                  <SelectItem value="concerned">Concerned</SelectItem>
                  <SelectItem value="celebrating">Celebrating</SelectItem>
                  <SelectItem value="advising">Advising</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mascot-speech">Speech Message</Label>
              <Input
                id="mascot-speech"
                placeholder="Make the mascot say something..."
                value={mascotSpeech}
                onChange={(e) => setMascotSpeech(e.target.value)}
                data-testid="input-mascot-speech"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={() => mascotControlMutation.mutate({
                  mode: mascotMode,
                  persona: mascotPersona,
                  emote: mascotEmote,
                })}
                disabled={mascotControlMutation.isPending}
                variant="outline"
                data-testid="button-update-mascot"
              >
                {mascotControlMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Update State
              </Button>
              <Button 
                onClick={() => mascotSpeakMutation.mutate({
                  message: mascotSpeech,
                  immediate: true,
                })}
                disabled={!mascotSpeech || mascotSpeakMutation.isPending}
                data-testid="button-mascot-speak"
              >
                {mascotSpeakMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                Speak
              </Button>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Business Buddy Advice</Label>
              <div className="flex gap-2">
                <Select value={businessFocus} onValueChange={setBusinessFocus}>
                  <SelectTrigger className="flex-1" data-testid="select-business-focus">
                    <SelectValue placeholder="Focus area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="efficiency">Efficiency</SelectItem>
                    <SelectItem value="debt">Debt/AR</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => businessAdviceMutation.mutate({ 
                    focus: businessFocus, 
                    broadcast: true 
                  })}
                  disabled={businessAdviceMutation.isPending}
                  data-testid="button-generate-advice"
                >
                  {businessAdviceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-2" />
                  )}
                  Generate
                </Button>
              </div>
            </div>
            <Button 
              onClick={() => mascotResetMutation.mutate()}
              disabled={mascotResetMutation.isPending}
              variant="outline"
              className="w-full"
              data-testid="button-reset-mascot"
            >
              {mascotResetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset Mascot to Default
            </Button>
          </TabsContent>

          <TabsContent value="sync" className="space-y-3 pt-3">
            <p className="text-sm text-muted-foreground">
              Force all connected clients to refresh their cached data immediately.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline"
                onClick={() => forceSyncMutation.mutate(['whats_new'])}
                disabled={forceSyncMutation.isPending}
                data-testid="button-sync-whats-new"
              >
                <Megaphone className="h-4 w-4 mr-2" />
                What's New
              </Button>
              <Button 
                variant="outline"
                onClick={() => forceSyncMutation.mutate(['notifications'])}
                disabled={forceSyncMutation.isPending}
                data-testid="button-sync-notifications"
              >
                <Bell className="h-4 w-4 mr-2" />
                Notifications
              </Button>
              <Button 
                variant="outline"
                onClick={() => forceSyncMutation.mutate(['health'])}
                disabled={forceSyncMutation.isPending}
                data-testid="button-sync-health"
              >
                <Wrench className="h-4 w-4 mr-2" />
                Health Status
              </Button>
              <Button 
                variant="outline"
                onClick={() => forceSyncMutation.mutate(['whats_new', 'notifications', 'health'])}
                disabled={forceSyncMutation.isPending}
                data-testid="button-sync-all"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync All
              </Button>
            </div>
            {forceSyncMutation.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Sync broadcast sent to all clients
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default SupportCommandPanel;
