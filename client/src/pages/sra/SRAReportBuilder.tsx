import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, CheckCircle, Circle, FileDown, RefreshCw, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DOMPurify from 'isomorphic-dompurify';
import SRAPortalLayout from "./SRAPortalLayout";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ReportSection {
  title: string;
  content: string;
  verified: boolean;
  index: number;
}

function sraFetch(path: string) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }).then(r => r.json());
}

function sraRequest(method: string, path: string, body?: any) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

function sraDownload(path: string, filename: string) {
  const token = localStorage.getItem("sra_session_token");
  return fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
  }).then(async res => {
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "PDF generation failed.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

const STARTER_MESSAGE = `Hello! I'm Trinity, your AI audit report assistant. I'm here to help you build a comprehensive, professional audit report for this compliance review.

To get started, could you tell me:
1. **What is the scope of this audit?** (Individual officer, multiple specific officers, or a full organizational audit?)
2. **What are the primary compliance concerns you've identified so far?**

I'll guide you through each section of the report, gathering the information needed to create a complete government-grade audit document.`;

export default function SRAReportBuilder() {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: STARTER_MESSAGE, timestamp: new Date() }
  ]);
  const [input, setInput] = useState("");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const { data: sectionsData, refetch: refetchSections } = useQuery({
    queryKey: ["/api/sra/trinity/sections"],
    queryFn: () => sraFetch("/api/sra/trinity/sections"),
    refetchInterval: false,
  });

  const sections: ReportSection[] = (sectionsData?.sections || []).map((s: any, i: number) => ({ ...s, index: i }));
  const verifiedCount = sections.filter(s => s.verified).length;
  const allVerified = sections.length > 0 && verifiedCount === sections.length;

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (message: string) => sraRequest("POST", "/api/sra/trinity/chat", { message }),
    onSuccess: (res) => {
      if (!res.success) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "I encountered an error. Please try again.",
          timestamp: new Date(),
        }]);
        return;
      }
      setMessages(prev => [...prev, {
        role: "assistant",
        content: res.reply,
        timestamp: new Date(),
      }]);
      if (res.newSections?.length > 0) {
        refetchSections();
      }
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Connection error. Please try again.",
        timestamp: new Date(),
      }]);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ index, verified }: { index: number; verified: boolean }) =>
      sraRequest("PATCH", `/api/sra/trinity/sections/${index}/verify`, { verified }),
    onSuccess: () => refetchSections(),
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || chatMutation.isPending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg, timestamp: new Date() }]);
    chatMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    setPdfError("");
    setPdfSuccess(false);
    try {
      await sraDownload(
        "/api/sra/trinity/generate-pdf",
        `SRA-Audit-Report-${Date.now()}.pdf`
      );
      setPdfSuccess(true);
    } catch (err: any) {
      setPdfError(err.message || "Failed to generate PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleReset = () => {
    setMessages([{ role: "assistant", content: STARTER_MESSAGE, timestamp: new Date() }]);
    chatMutation.mutate("Start a new report from scratch. Reset context.");
    refetchSections();
  };

  const escapeHtml = (raw: string) =>
    raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const renderMarkdown = (text: string) => {
    const escaped = escapeHtml(
      text
        .split(/---SECTION_START---[\s\S]*?---SECTION_END---/g)
        .join("")
    );
    const rendered = escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, "<br />");
    return DOMPurify.sanitize(rendered, {
      ALLOWED_TAGS: ['strong', 'em', 'br'],
      ALLOWED_ATTR: [],
    });
  };

  return (
    <SRAPortalLayout activeRoute="/regulatory-audit/portal/report-builder">
      <div className="flex h-[calc(100vh-56px)]">
        {/* Left — Chat */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200">
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#1a3a6b] rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Trinity</p>
                <p className="text-xs text-gray-400">AI Audit Report Builder</p>
              </div>
            </div>
            <button
              data-testid="button-reset-chat"
              onClick={handleReset}
              className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-xs"
            >
              <RefreshCw className="w-3 h-3" /> New Report
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto p-5 space-y-4"
            data-testid="chat-messages"
          >
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user" ? "bg-gray-200" : "bg-[#1a3a6b]"
                }`}>
                  {msg.role === "user"
                    ? <User className="w-4 h-4 text-gray-600" />
                    : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`max-w-[75%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1a3a6b] text-white"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  <div
                    className="whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1a3a6b] flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center gap-1.5">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="flex gap-2">
              <Textarea
                data-testid="input-chat-message"
                placeholder="Type your response to Trinity..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                className="flex-1 resize-none border-gray-300 text-sm"
                disabled={chatMutation.isPending}
              />
              <Button
                data-testid="button-send-message"
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                size="icon"
                className="bg-[#1a3a6b] text-white self-end"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* Right — Staged Sections */}
        <div className="w-80 flex-shrink-0 flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-[#1a3a6b]">Report Sections</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {verifiedCount}/{sections.length} verified
              {allVerified && " — Ready to generate"}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {sections.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-xs">Sections appear here as Trinity builds them through the conversation.</p>
              </div>
            ) : (
              sections.map(section => (
                <Card
                  key={section.index}
                  data-testid={`section-card-${section.index}`}
                  className={`border transition-colors ${section.verified ? "border-green-200 bg-green-50/50" : "border-gray-200"}`}
                >
                  <CardHeader className="p-3 pb-2">
                    <div className="flex items-start gap-2">
                      <button
                        data-testid={`button-verify-section-${section.index}`}
                        onClick={() => verifyMutation.mutate({ index: section.index, verified: !section.verified })}
                        className="mt-0.5 flex-shrink-0"
                      >
                        {section.verified
                          ? <CheckCircle className="w-4 h-4 text-green-600" />
                          : <Circle className="w-4 h-4 text-gray-300" />}
                      </button>
                      <CardTitle className="text-xs font-semibold text-gray-800 leading-tight">{section.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{section.content}</p>
                    <p className="text-xs mt-2 font-medium" style={{ color: section.verified ? "#16a34a" : "#9ca3af" }}>
                      {section.verified ? "Verified for report" : "Click to verify"}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Generate PDF panel */}
          <div className="p-4 border-t border-gray-100">
            {pdfSuccess && (
              <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                PDF generated and downloaded. SHA-256 hash embedded in document footer.
              </div>
            )}
            {pdfError && (
              <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {pdfError}
              </div>
            )}
            {sections.length > 0 && !allVerified && (
              <p className="text-xs text-gray-400 mb-2 text-center">
                Verify all {sections.length} sections to generate.
              </p>
            )}
            <Button
              data-testid="button-generate-pdf"
              onClick={handleGeneratePdf}
              disabled={sections.length === 0 || !allVerified || isGeneratingPdf}
              className="w-full bg-[#d4aa3b] text-[#0f1e3d] font-semibold gap-2 hover:bg-[#d4aa3b]"
            >
              {isGeneratingPdf ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <FileDown className="w-4 h-4" /> Generate PDF Report
                </span>
              )}
            </Button>
            {sections.length > 0 && allVerified && (
              <p className="text-xs text-gray-400 text-center mt-2">
                Report will include SHA-256 integrity hash
              </p>
            )}
          </div>
        </div>
      </div>
    </SRAPortalLayout>
  );
}
