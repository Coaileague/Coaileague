import { useState } from "react";
import { Bot, Loader2 } from "lucide-react";
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
import { apiRequest } from "@/lib/queryClient";
import { useWorkspaceAccess } from "@/hooks/useWorkspaceAccess";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

export function HelpOsAiTester() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Hi, I need help logging in");
  const [aiResponse, setAiResponse] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();

  // Try to get workspace from API since workspaceAccess might be null
  const { data: workspace } = useQuery({
    queryKey: ['/api/workspace'],
    enabled: !!user,
  });

  const testAiMutation = useMutation({
    mutationFn: async (testMessage: string) => {
      const workspaceId = (workspace as any)?.id;
      const response = await apiRequest("/api/support/helpos-chat", "POST", {
        message: testMessage,
        // Send workspace ID if available
        ...(workspaceId ? { workspaceId } : {}),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setAiResponse(data.reply || "No response from AI");
      toast({
        title: "✅ HelpOS™ AI Responding",
        description: "Smart AI is working!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ HelpOS™ AI Error",
        description: error.message || "Failed to get AI response",
        variant: "destructive",
      });
    },
  });

  const handleTest = () => {
    setAiResponse("");
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
              Test HelpOS™ Smart AI
            </DialogTitle>
            <DialogDescription>
              Send a test message to verify HelpOS™ AI is working correctly
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
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

            {/* AI Response */}
            {(testAiMutation.isPending || aiResponse) && (
              <div className="space-y-2">
                <label className="text-sm font-medium">AI Response</label>
                <ScrollArea className="h-48 rounded-md border p-4">
                  {testAiMutation.isPending ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>AI is thinking...</span>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm">
                      {aiResponse}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleTest}
              disabled={!message.trim() || testAiMutation.isPending}
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
                  Test HelpOS AI
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
