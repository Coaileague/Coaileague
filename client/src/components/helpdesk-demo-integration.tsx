/**
 * HelpDesk Enhanced Integration Demo
 * Shows how to integrate ProgressHeader, AgentToolbelt, and TicketContextPanel
 * into the existing HelpDeskCab and HelpDesk5 components
 */

import { useState } from "react";
import { HelpDeskProgressHeader } from "./helpdesk-progress-header";
import { AgentToolbelt } from "./agent-toolbelt";
import { TicketContextPanel } from "./ticket-context-panel";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { Send, Paperclip, Smile } from "lucide-react";

export function HelpDeskEnhancedDemo() {
  const [messageText, setMessageText] = useState("");
  const [ticketStatus, setTicketStatus] = useState<'new' | 'assigned' | 'investigating' | 'waiting_user' | 'resolved' | 'escalated'>('investigating');

  // Mock data for demonstration
  const mockUser = {
    id: "user-123",
    name: "John Smith",
    email: "john.smith@example.com",
    organization: "Acme Corporation",
    subscriptionTier: "professional" as const,
    accountCreated: "2024-01-15",
  };

  const mockPreviousTickets = [
    {
      id: "ticket-001",
      subject: "Unable to access dashboard",
      status: "resolved" as const,
      createdAt: "2024-11-05",
      resolvedIn: "2h 15m",
    },
    {
      id: "ticket-002",
      subject: "Billing question about invoice",
      status: "resolved" as const,
      createdAt: "2024-10-28",
      resolvedIn: "45m",
    },
  ];

  const mockKBArticles = [
    {
      id: "kb-001",
      title: "Getting Started with CoAIleague",
      url: "/help/getting-started",
      relevance: 0.95,
    },
    {
      id: "kb-002",
      title: "Troubleshooting Dashboard Access Issues",
      url: "/help/dashboard-access",
      relevance: 0.87,
    },
  ];

  const handleMacroInsert = (macro: string) => {
    setMessageText(prev => prev ? `${prev}\n\n${macro}` : macro);
  };

  const handleSendKBLink = (link: string) => {
    setMessageText(prev => prev ? `${prev}\n\n${link}` : link);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header with branding */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">CoAIleague Support</h1>
        <div className="text-sm text-muted-foreground">
          Enhanced HelpDesk Demo
        </div>
      </header>

      {/* Main content area - 3 column layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar - Room/Ticket List */}
        <div className="w-64 border-r bg-muted/30 p-4">
          <h3 className="font-semibold mb-4">Active Conversations</h3>
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="p-4">
              <CardTitle className="text-sm">{mockUser.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {mockUser.organization}
              </p>
            </CardHeader>
          </Card>
        </div>

        {/* Center - Chat Messages */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Progress Header */}
          <div className="p-4 border-b">
            <HelpDeskProgressHeader
              status={ticketStatus}
              assignedAgent="Sarah Johnson"
              slaRemaining={1200}
              priority="high"
              ticketId="ticket-123"
            />
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Sample customer message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                  JS
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{mockUser.name}</span>
                    <span className="text-xs text-muted-foreground">2 minutes ago</span>
                  </div>
                  <div className="bg-muted rounded-lg p-3 text-sm">
                    I'm having trouble accessing my dashboard. It keeps showing a loading spinner.
                  </div>
                </div>
              </div>

              {/* Sample agent message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-semibold">
                  SJ
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">Sarah Johnson</span>
                    <span className="text-xs text-blue-600">Support</span>
                    <span className="text-xs text-muted-foreground">1 minute ago</span>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm">
                    I'm looking into this for you. Can you try clearing your browser cache and refreshing?
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Agent Toolbelt + Input Area */}
          <div className="border-t p-4 space-y-3">
            {/* Toolbelt - Only visible to support staff */}
            <div className="flex items-center gap-2">
              <AgentToolbelt
                ticketId="ticket-123"
                onMacroInsert={handleMacroInsert}
                onRequestFile={(type) => console.log('Request file:', type)}
                onSendKBLink={handleSendKBLink}
                onEscalate={(reason, queue) => console.log('Escalate:', { reason, queue })}
                onCreateBug={(desc) => console.log('Create bug:', desc)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const statuses: typeof ticketStatus[] = ['assigned', 'investigating', 'waiting_user', 'resolved'];
                  const currentIndex = statuses.indexOf(ticketStatus);
                  const nextIndex = (currentIndex + 1) % statuses.length;
                  setTicketStatus(statuses[nextIndex]);
                }}
                data-testid="button-cycle-status"
              >
                Cycle Status (Demo)
              </Button>
            </div>

            {/* Message Input */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon">
                <Paperclip className="w-4 h-4" />
              </Button>
              <Input
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                data-testid="input-message"
              />
              <Button variant="ghost" size="icon">
                <Smile className="w-4 h-4" />
              </Button>
              <Button size="icon" data-testid="button-send">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right sidebar - Context Panel */}
        <div className="w-80 border-l">
          <TicketContextPanel
            user={mockUser}
            previousTickets={mockPreviousTickets}
            suggestedArticles={mockKBArticles}
          />
        </div>
      </div>
    </div>
  );
}
