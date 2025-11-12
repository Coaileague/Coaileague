import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, Code } from "lucide-react";

export default function ChatExport() {
  const { toast } = useToast();
  const [sessionId, setSessionId] = useState("");
  const [sessionType, setSessionType] = useState<"support" | "commroom" | "private">("support");
  const [exportFormat, setExportFormat] = useState<"pdf" | "html">("pdf");

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId.trim()) {
        throw new Error("Session ID is required");
      }

      let endpoint = "";
      if (sessionType === "support") {
        endpoint = `/api/chat-export/support-conversation/${sessionId}`;
      } else if (sessionType === "commroom") {
        endpoint = `/api/chat-export/comm-room/${sessionId}`;
      } else if (sessionType === "private") {
        endpoint = `/api/chat-export/private-conversation/${sessionId}`;
      }

      const response = await fetch(endpoint, {
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

      return response;
    },
    onSuccess: async (response) => {
      if (exportFormat === 'pdf') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-export-${sessionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: "Export Successful",
          description: "PDF downloaded successfully",
        });
      } else {
        const html = await response.text();
        const blob = new Blob([html], { type: 'text/html' });
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');

        toast({
          title: "Export Successful",
          description: "HTML opened in new window",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleExport = () => {
    exportMutation.mutate();
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Chat History Export</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Export chat conversations, support tickets, and CommOS room transcripts for compliance, training, or archival purposes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle data-testid="text-card-title">Export Chat Session</CardTitle>
          <CardDescription data-testid="text-card-description">
            Enter a session ID and select the export format to download a transcript
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="session-type" data-testid="label-session-type">Session Type</Label>
            <Select
              value={sessionType}
              onValueChange={(value) => setSessionType(value as "support" | "commroom" | "private")}
            >
              <SelectTrigger id="session-type" data-testid="select-session-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="support" data-testid="option-support">Support Conversation</SelectItem>
                <SelectItem value="commroom" data-testid="option-commroom">CommOS Chat Room</SelectItem>
                <SelectItem value="private" data-testid="option-private">Private DM (Requires Audit Approval)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-id" data-testid="label-session-id">
              Session ID / Conversation ID / Room ID
            </Label>
            <Input
              id="session-id"
              placeholder="Enter session identifier"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              data-testid="input-session-id"
            />
            <p className="text-sm text-muted-foreground">
              You can find session IDs in dashboard portals, chat interfaces, or from support logs
            </p>
          </div>

          <div className="space-y-2">
            <Label data-testid="label-export-format">Export Format</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(value) => setExportFormat(value as "pdf" | "html")}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="format-pdf" data-testid="radio-format-pdf" />
                <Label htmlFor="format-pdf" className="flex items-center gap-2 font-normal cursor-pointer">
                  <FileText className="w-4 h-4 text-primary" />
                  <span>PDF Document (Download)</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="html" id="format-html" data-testid="radio-format-html" />
                <Label htmlFor="format-html" className="flex items-center gap-2 font-normal cursor-pointer">
                  <Code className="w-4 h-4 text-primary" />
                  <span>HTML Page (Open in Browser)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="pt-4 border-t">
            <Button
              onClick={handleExport}
              disabled={!sessionId.trim() || exportMutation.isPending}
              className="w-full"
              data-testid="button-export"
            >
              <Download className="w-4 h-4 mr-2" />
              {exportMutation.isPending ? "Exporting..." : `Export as ${exportFormat.toUpperCase()}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle data-testid="text-info-title">Usage Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-1">Support Conversations</h3>
            <p className="text-sm text-muted-foreground">
              Export customer support ticket conversations. Requires manager or higher permissions.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">CommOS Chat Rooms</h3>
            <p className="text-sm text-muted-foreground">
              Export team communication room transcripts. Requires manager or higher permissions.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Private DMs</h3>
            <p className="text-sm text-muted-foreground">
              Export encrypted private messages. Requires owner permissions and an approved audit request due to privacy protections.
            </p>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Compliance Note</p>
            <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
              All chat exports are logged for audit purposes. Only export conversations when required for legitimate business, compliance, or training purposes.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
