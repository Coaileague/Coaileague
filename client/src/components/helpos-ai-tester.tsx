import { useState, useEffect } from "react";
import { Bot, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

export function CoAIleagueAiTester() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Hi, I need help logging in");
  const [aiResponse, setAiResponse] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch all workspaces user has access to
  const { data: workspaces = [] } = useQuery({
    queryKey: ['/api/workspaces/all'],
    enabled: !!user && open, // Only fetch when dialog opens
  });

  // Switch workspace mutation
  const switchWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      await apiRequest(`/api/workspace/switch/${workspaceId}`, "POST");
      // CRITICAL: invalidateQueries AND WAIT for fresh data
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      // Give React Query time to refetch (it's triggered by invalidation above)
      await new Promise(resolve => setTimeout(resolve, 100));
    },
    onSuccess: () => {
      toast({
        title: "✅ Workspace Selected",
        description: "CoAIleague AI is ready",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Failed to Switch Workspace",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Auto-select sole workspace if user has exactly one and no currentWorkspaceId
  useEffect(() => {
    if (
      open &&
      user &&
      !user.currentWorkspaceId &&
      Array.isArray(workspaces) &&
      workspaces.length === 1 &&
      !switchWorkspaceMutation.isPending
    ) {
      const soleWorkspace = workspaces[0];
      switchWorkspaceMutation.mutate(soleWorkspace.id);
    }
  }, [open, user?.currentWorkspaceId, workspaces]);

  const testAiMutation = useMutation({
    mutationFn: async (testMessage: string) => {
      // Use currentWorkspaceId from user object (set via workspace switcher)
      const workspaceId = user?.currentWorkspaceId;
      
      // Authenticated users MUST provide currentWorkspaceId (security requirement)
      if (!workspaceId && user) {
        throw new Error("Please select a workspace first using the workspace switcher");
      }
      
      const response = await apiRequest("/api/support/helpos-chat", "POST", {
        message: testMessage,
        // Always send workspace ID if user is authenticated
        ...(workspaceId ? { workspaceId } : {}),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setAiResponse(data.message || "No response from AI");
      toast({
        title: "✅ CoAIleague AI Active",
        description: "Intelligent automation system responding",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ AI Brain Error",
        description: error.message || "Failed to get AI response",
        variant: "destructive",
      });
    },
  });

  const handleTest = () => {
    // Don't clear response - mutation will update it
    testAiMutation.mutate(message);
  };

  return (
    <>
      {/* Floating Test Button */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-20 right-6 z-50 h-14 w-14 rounded-full shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)",
            }}
            data-testid="button-test-helpos-ai"
          >
            <Bot className="h-6 w-6 text-white" />
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" style={{ color: "#3b82f6" }} />
              AI Brain Intelligence Tester
            </DialogTitle>
            <DialogDescription>
              Test the AI Brain's intelligent support automation system
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Workspace Selector - shown for multi-workspace users OR users without currentWorkspaceId */}
            {user && Array.isArray(workspaces) && workspaces.length > 0 && (
              (!user.currentWorkspaceId || workspaces.length > 1) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {workspaces.length === 1 ? 'Workspace' : 'Select Workspace for AI Assistant'}
                  </label>
                  <Select
                    value={user.currentWorkspaceId || ""}
                    onValueChange={(value) => switchWorkspaceMutation.mutate(value)}
                    disabled={switchWorkspaceMutation.isPending}
                  >
                    <SelectTrigger data-testid="select-helpos-workspace">
                      <SelectValue placeholder="Choose a workspace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((ws: any) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.name || ws.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!user.currentWorkspaceId && workspaces.length === 1 && (
                    <p className="text-xs text-muted-foreground">
                      ℹ️ Auto-selecting your workspace...
                    </p>
                  )}
                  {!user.currentWorkspaceId && workspaces.length > 1 && (
                    <p className="text-xs text-destructive">
                      ⚠️ Please select a workspace to use AI Support
                    </p>
                  )}
                </div>
              )
            )}

            {/* Input Message */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Test Message</label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your test message..."
                className="min-h-[80px]"
                data-testid="input-helpos-test-message"
              />
            </div>

            {/* AI Response - Always show after first test */}
            {(testAiMutation.isPending || testAiMutation.isSuccess || aiResponse) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">AI Response</label>
                <ScrollArea className="h-48 rounded-md border p-4">
                  {testAiMutation.isPending ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI is thinking...</span>
                    </div>
                  ) : aiResponse ? (
                    <div className="whitespace-pre-wrap text-sm">
                      {aiResponse}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      No response yet...
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleTest}
              disabled={
                !message.trim() || 
                testAiMutation.isPending || 
                switchWorkspaceMutation.isPending ||
                (!user?.currentWorkspaceId && (workspaces as any[]).length > 1)
              }
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)",
              }}
              className="text-white"
              data-testid="button-send-test"
            >
              {testAiMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Bot className="mr-2 h-4 w-4" />
                  Test AI Brain
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
