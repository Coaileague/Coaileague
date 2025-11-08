import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SimpleRichTextEditor } from "@/components/simple-rich-text-editor";
import { EmailComposer, type EmailData } from "@/components/email-composer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Mail, FileText, Send } from "lucide-react";

export default function RichTextDemo() {
  const { toast } = useToast();
  
  // Chat message state
  const [chatMessage, setChatMessage] = useState("");
  const [chatPlainText, setChatPlainText] = useState("");
  
  // DM state
  const [dmMessage, setDmMessage] = useState("");
  const [dmPlainText, setDmPlainText] = useState("");
  
  // Report state
  const [reportContent, setReportContent] = useState("");
  const [reportPlainText, setReportPlainText] = useState("");

  const handleSendChat = () => {
    if (!chatPlainText.trim()) return;
    toast({
      title: "Chat Message Sent",
      description: "Your message has been posted to the chatroom",
    });
    setChatMessage("");
    setChatPlainText("");
  };

  const handleSendDM = () => {
    if (!dmPlainText.trim()) return;
    toast({
      title: "Private Message Sent",
      description: "Your encrypted message has been delivered",
    });
    setDmMessage("");
    setDmPlainText("");
  };

  const handleSendEmail = async (emailData: EmailData) => {
    console.log("Email data:", emailData);
    // Simulate email sending
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: "Email Sent Successfully",
      description: `Sent ${emailData.template} email to ${emailData.to.length} recipient(s)`,
    });
  };

  const handleSaveReport = () => {
    if (!reportPlainText.trim()) return;
    toast({
      title: "Report Saved",
      description: "Your report has been saved and is ready for distribution",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900/20 to-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">
            AutoForce™ Rich Text System
          </h1>
          <p className="text-lg text-gray-300">
            Professional messaging for chat, DMs, emails, and reports
          </p>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl mx-auto">
            <TabsTrigger value="chat" data-testid="tab-chat">
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="dm" data-testid="tab-dm">
              <MessageSquare className="h-4 w-4 mr-2" />
              Private DM
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">
              <Mail className="h-4 w-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="report" data-testid="tab-report">
              <FileText className="h-4 w-4 mr-2" />
              Report
            </TabsTrigger>
          </TabsList>

          {/* Chat Messages */}
          <TabsContent value="chat" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Chatroom Message</CardTitle>
                <CardDescription>
                  Quick formatting for team communication in CommOS™
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SimpleRichTextEditor
                  value={chatMessage}
                  onChange={(html, plain) => {
                    setChatMessage(html);
                    setChatPlainText(plain);
                  }}
                  placeholder="Type your message... (toolbar appears on focus)"
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSendChat}
                    disabled={!chatPlainText.trim()}
                    data-testid="button-send-chat"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to Chatroom
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: chatMessage || "<em>Your message will appear here...</em>" }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Private DMs */}
          <TabsContent value="dm" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Private Message (AES-256-GCM Encrypted)</CardTitle>
                <CardDescription>
                  Secure end-to-end encrypted direct messages
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SimpleRichTextEditor
                  value={dmMessage}
                  onChange={(html, plain) => {
                    setDmMessage(html);
                    setDmPlainText(plain);
                  }}
                  placeholder="Type your private message..."
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSendDM}
                    disabled={!dmPlainText.trim()}
                    variant="default"
                    data-testid="button-send-dm"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Encrypted DM
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle>Preview (Encrypted on Send)</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: dmMessage || "<em>Your private message will appear here...</em>" }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Composer */}
          <TabsContent value="email" className="space-y-4">
            <EmailComposer
              onSend={handleSendEmail}
              defaultTo={[]}
              defaultSubject=""
              defaultTemplate="blank"
            />
          </TabsContent>

          {/* Reports */}
          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create Professional Report</CardTitle>
                <CardDescription>
                  Analytics, invoicing, and business reports with full formatting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RichTextEditor
                  value={reportContent}
                  onChange={(html, plain) => {
                    setReportContent(html);
                    setReportPlainText(plain);
                  }}
                  placeholder="Write your professional report with headings, lists, and formatting..."
                  minHeight="400px"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReportContent("");
                      setReportPlainText("");
                    }}
                    data-testid="button-clear-report"
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={handleSaveReport}
                    disabled={!reportPlainText.trim()}
                    data-testid="button-save-report"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Save Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle>Report Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: reportContent || "<em>Your report will appear here...</em>" }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Features List */}
        <Card className="bg-muted/30/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-primary">Available Formatting Features</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-gray-300">
              <ul className="space-y-2">
                <li>✓ Bold, Italic, Underline, Strikethrough</li>
                <li>✓ Headings (H1, H2, H3)</li>
                <li>✓ Ordered & Unordered Lists</li>
                <li>✓ Code Blocks</li>
              </ul>
              <ul className="space-y-2">
                <li>✓ Blockquotes</li>
                <li>✓ Text Alignment</li>
                <li>✓ Hyperlinks</li>
                <li>✓ Clear Formatting</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
