/**
 * SUPPORT AI CONTROL CONSOLE
 * 
 * Comprehensive control interface for support staff to:
 * - Chat with Trinity™ using natural language
 * - Browse and edit platform files
 * - Execute and monitor workflows
 * - Run diagnostic tests
 * - View action history and capabilities
 * 
 * SUPPORT STAFF ONLY - Role-based access control
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import {
  Brain,
  Send,
  MessageSquare,
  FileCode,
  Play,
  TestTube,
  History,
  Settings,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Terminal,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Search,
  Edit3,
  Eye,
  Trash2,
  Plus,
  FolderOpen,
  Code,
  Sparkles,
  Zap,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { UniversalModal, UniversalModalDescription, UniversalModalHeader, UniversalModalTitle, UniversalModalFooter } from '@/components/ui/universal-modal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actionExecuted?: {
    actionId: string;
    success: boolean;
    result?: any;
  };
}

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  extension?: string;
}

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  duration?: number;
  details?: any;
}

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
}

interface CapabilitiesData {
  actionCount?: number;
  testSuites?: number;
  workflows?: number;
  categories?: string[];
}

interface FilesData {
  files?: FileItem[];
  path?: string;
}

interface HistoryData {
  actions?: Array<{
    actionId: string;
    category: string;
    success: boolean;
    message?: string;
    timestamp: string;
  }>;
}

export default function SupportAIConsole() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("chat");
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentPath, setCurrentPath] = useState(".");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPattern, setSearchPattern] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [testCategory, setTestCategory] = useState<string>("all");

  const { data: capabilities, isLoading: capabilitiesLoading } = useQuery<CapabilitiesData>({
    queryKey: ['/api/ai-brain/console/capabilities'],
  });

  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = useQuery<FilesData>({
    queryKey: ['/api/ai-brain/console/files', currentPath],
    enabled: activeTab === 'files',
  });

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useQuery<HistoryData>({
    queryKey: ['/api/ai-brain/console/history'],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { message: string; conversationId?: string; executeActions?: boolean }) => {
      const response = await apiRequest('POST', '/api/ai-brain/console/chat', data);
      return response.json();
    },
    onSuccess: (data: any) => {
      setConversationId(data.conversationId);
      setMessages(data.conversation || []);
      queryClient.invalidateQueries({ queryKey: ['/api/ai-brain/console/history'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const readFileMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const response = await apiRequest('POST', '/api/ai-brain/console/files/read', { filePath });
      return response.json();
    },
    onSuccess: (data: any) => {
      setFileContent(data.content || '');
      setSelectedFile(data.path);
    },
    onError: (error: any) => {
      toast({
        title: "Error reading file",
        description: error.message || "Failed to read file",
        variant: "destructive",
      });
    },
  });

  const writeFileMutation = useMutation({
    mutationFn: async (data: { filePath: string; content: string }) => {
      const response = await apiRequest('POST', '/api/ai-brain/console/files/write', data);
      return response.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      toast({
        title: "File saved",
        description: "Changes have been saved successfully",
      });
      refetchFiles();
    },
    onError: (error: any) => {
      toast({
        title: "Error saving file",
        description: error.message || "Failed to save file",
        variant: "destructive",
      });
    },
  });

  const searchFilesMutation = useMutation({
    mutationFn: async (data: { pattern: string; path?: string }) => {
      const response = await apiRequest('POST', '/api/ai-brain/console/files/search', data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Search complete",
        description: `Found ${data.matches?.length || 0} matches`,
      });
    },
  });

  const runTestsMutation = useMutation({
    mutationFn: async (data: { category?: string; testNames?: string[] }) => {
      const response = await apiRequest('POST', '/api/ai-brain/console/tests/run', data);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Tests completed",
        description: `${data.passed}/${data.total} tests passed`,
        variant: data.passed === data.total ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test error",
        description: error.message || "Failed to run tests",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    const userMessage: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    sendMessageMutation.mutate({
      message,
      conversationId: conversationId || undefined,
      executeActions: true,
    });
    setMessage("");
  };

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'directory') {
      setCurrentPath(file.path);
    } else {
      readFileMutation.mutate(file.path);
    }
  };

  const handleNavigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.length ? parts.join('/') : '.');
  };

  const handleSaveFile = () => {
    if (!selectedFile) return;
    writeFileMutation.mutate({
      filePath: selectedFile,
      content: fileContent,
    });
  };

  const handleSearch = () => {
    if (!searchPattern.trim()) return;
    searchFilesMutation.mutate({
      pattern: searchPattern,
      path: currentPath !== '.' ? currentPath : undefined,
    });
  };

  const handleRunTests = () => {
    runTestsMutation.mutate({
      category: testCategory !== 'all' ? testCategory : undefined,
    });
  };

  const pageConfig: CanvasPageConfig = {
    id: "support-ai-console",
    title: "Support AI Control Console",
    subtitle: "Direct interface to Trinity™ - File access, workflows, testing, and chat",
    category: "admin",
    maxWidth: "7xl",
  };

  return (
    <CanvasHubPage config={pageConfig}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
        <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <CardContent className="p-3 sm:pt-4 sm:px-6">
            <div className="text-lg sm:text-2xl font-bold truncate" data-testid="text-action-count">
              {capabilities?.actionCount || 0}
            </div>
            <p className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 truncate flex items-center gap-1">
              <Zap className="w-3 h-3 shrink-0" />
              Actions
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <CardContent className="p-3 sm:pt-4 sm:px-6">
            <div className="text-lg sm:text-2xl font-bold truncate" data-testid="text-file-tools">
              6
            </div>
            <p className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 truncate flex items-center gap-1">
              <FileCode className="w-3 h-3 shrink-0" />
              File Tools
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <CardContent className="p-3 sm:pt-4 sm:px-6">
            <div className="text-lg sm:text-2xl font-bold truncate" data-testid="text-test-suites">
              {capabilities?.testSuites || 0}
            </div>
            <p className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 truncate flex items-center gap-1">
              <TestTube className="w-3 h-3 shrink-0" />
              Test Suites
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 border-violet-500/20">
          <CardContent className="p-3 sm:pt-4 sm:px-6">
            <div className="text-lg sm:text-2xl font-bold truncate" data-testid="text-workflows">
              {capabilities?.workflows || 0}
            </div>
            <p className="text-[10px] sm:text-xs text-violet-600 dark:text-violet-400 truncate flex items-center gap-1">
              <Activity className="w-3 h-3 shrink-0" />
              Workflows
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full overflow-x-auto flex sm:grid sm:grid-cols-5 max-w-2xl">
            <TabsTrigger value="chat" className="flex items-center gap-1.5 shrink-0" data-testid="tab-chat">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-1.5 shrink-0" data-testid="tab-files">
              <FileCode className="w-4 h-4" />
              <span className="hidden sm:inline">Files</span>
            </TabsTrigger>
            <TabsTrigger value="workflows" className="flex items-center gap-1.5 shrink-0" data-testid="tab-workflows">
              <Play className="w-4 h-4" />
              <span className="hidden sm:inline">Workflows</span>
            </TabsTrigger>
            <TabsTrigger value="tests" className="flex items-center gap-1.5 shrink-0" data-testid="tab-tests">
              <TestTube className="w-4 h-4" />
              <span className="hidden sm:inline">Tests</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 shrink-0" data-testid="tab-history">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 overflow-hidden mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  Trinity™ Chat
                </CardTitle>
                <CardDescription>
                  Ask questions, execute actions, or get help with platform management
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4 pb-4">
                    {messages.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Start a conversation with Trinity™</p>
                        <p className="text-sm mt-2">
                          Try: "Show me the platform health status" or "List recent audit logs"
                        </p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-violet-600 text-white'
                              : msg.role === 'system'
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-card border'
                          }`}
                          data-testid={`message-${msg.role}-${i}`}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.actionExecuted && (
                            <div className="mt-2 pt-2 border-t border-white/20">
                              <Badge variant={msg.actionExecuted.success ? "default" : "destructive"}>
                                {msg.actionExecuted.success ? "Action Succeeded" : "Action Failed"}
                              </Badge>
                              <p className="text-xs mt-1 opacity-80">
                                Action: {msg.actionExecuted.actionId}
                              </p>
                            </div>
                          )}
                          <p className="text-xs opacity-60 mt-2">
                            {format(new Date(msg.timestamp), 'HH:mm:ss')}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>
                <div className="flex gap-2 pt-4 border-t">
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask Trinity™ anything..."
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    disabled={sendMessageMutation.isPending}
                    data-testid="input-chat-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    data-testid="button-send-message"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="flex-1 overflow-hidden mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 h-full">
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Folder className="w-5 h-5 text-yellow-500" />
                      File Browser
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNavigateUp}
                      disabled={currentPath === '.'}
                      data-testid="button-navigate-up"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
                      Up
                    </Button>
                    <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                      {currentPath}
                    </code>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  <div className="flex gap-2 mb-3">
                    <Input
                      value={searchPattern}
                      onChange={(e) => setSearchPattern(e.target.value)}
                      placeholder="Search pattern (regex)..."
                      className="flex-1"
                      data-testid="input-search-pattern"
                    />
                    <Button
                      variant="outline"
                      onClick={handleSearch}
                      disabled={searchFilesMutation.isPending}
                      data-testid="button-search-files"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  </div>
                  <ScrollArea className="h-[400px]">
                    {filesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {(files?.files || []).map((file: FileItem, i: number) => (
                          <button
                            key={file.path}
                            onClick={() => handleFileClick(file)}
                            className="w-full flex items-center gap-2 p-2 rounded hover-elevate text-left"
                            data-testid={`file-item-${i}`}
                          >
                            {file.type === 'directory' ? (
                              <FolderOpen className="w-4 h-4 text-yellow-500" />
                            ) : (
                              <File className="w-4 h-4 text-blue-500" />
                            )}
                            <span className="flex-1 truncate">{file.name}</span>
                            {file.size !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(1)}KB
                              </span>
                            )}
                          </button>
                        ))}
                        {(!files?.files || files.files.length === 0) && (
                          <p className="text-muted-foreground text-center py-4">
                            No files in this directory
                          </p>
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Code className="w-5 h-5 text-green-500" />
                      File Editor
                    </CardTitle>
                    <div className="flex gap-2">
                      {selectedFile && !isEditing && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditing(true)}
                          data-testid="button-edit-file"
                        >
                          <Edit3 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      )}
                      {isEditing && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditing(false)}
                            data-testid="button-cancel-edit"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveFile}
                            disabled={writeFileMutation.isPending}
                            data-testid="button-save-file"
                          >
                            {writeFileMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Save
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {selectedFile && (
                    <code className="text-sm text-muted-foreground">
                      {selectedFile}
                    </code>
                  )}
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                  {readFileMutation.isPending ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : selectedFile ? (
                    <Textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="h-full font-mono text-sm resize-none"
                      readOnly={!isEditing}
                      data-testid="textarea-file-content"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center">
                        <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Select a file to view its contents</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="workflows" className="flex-1 overflow-hidden mt-4">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-green-500" />
                  Workflow Execution
                </CardTitle>
                <CardDescription>
                  Define and execute step-based workflows with Trinity™
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Available Workflow Actions</h4>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { id: 'health_check', label: 'Health Check', icon: Activity },
                        { id: 'run_diagnostics', label: 'Run Diagnostics', icon: TestTube },
                        { id: 'clear_cache', label: 'Clear Cache', icon: RefreshCw },
                        { id: 'sync_data', label: 'Sync Data', icon: Zap },
                        { id: 'generate_report', label: 'Generate Report', icon: FileCode },
                        { id: 'backup_config', label: 'Backup Config', icon: Settings },
                      ].map((action) => (
                        <Button
                          key={action.id}
                          variant="outline"
                          className="justify-start"
                          data-testid={`workflow-action-${action.id}`}
                        >
                          <action.icon className="w-4 h-4 mr-2" />
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Recent Workflows</h4>
                    <p className="text-muted-foreground text-sm">
                      No recent workflow executions. Start by selecting an action above or asking Trinity™ in Chat.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tests" className="flex-1 overflow-hidden mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TestTube className="w-5 h-5 text-blue-500" />
                      Diagnostic Tests
                    </CardTitle>
                    <CardDescription>
                      Run platform health and integration tests
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={testCategory} onValueChange={setTestCategory}>
                      <SelectTrigger className="w-40" data-testid="select-test-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tests</SelectItem>
                        <SelectItem value="health">Health</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                        <SelectItem value="api">API</SelectItem>
                        <SelectItem value="integration">Integration</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleRunTests}
                      disabled={runTestsMutation.isPending}
                      data-testid="button-run-tests"
                    >
                      {runTestsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Run Tests
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {runTestsMutation.isPending ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                    <p className="text-muted-foreground">Running diagnostic tests...</p>
                  </div>
                ) : runTestsMutation.data ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium">{runTestsMutation.data.passed} Passed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-500" />
                        <span className="font-medium">{runTestsMutation.data.failed} Failed</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                        <span>{runTestsMutation.data.duration}ms</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(runTestsMutation.data.results || []).map((result: TestResult, i: number) => (
                        <div
                          key={i}
                          className={`p-3 rounded-lg border ${
                            result.passed ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                          }`}
                          data-testid={`test-result-${i}`}
                        >
                          <div className="flex items-center gap-2">
                            {result.passed ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className="font-medium">{result.testName}</span>
                            {result.duration && (
                              <span className="text-xs text-muted-foreground ml-auto">
                                {result.duration}ms
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1 text-muted-foreground">{result.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <TestTube className="w-12 h-12 mb-4 opacity-50" />
                    <p>Click "Run Tests" to execute diagnostics</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="w-5 h-5 text-orange-500" />
                      Action History
                    </CardTitle>
                    <CardDescription>
                      Recent Trinity™ actions and console interactions
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : (history?.actions || []).length > 0 ? (
                  <div className="space-y-3">
                    {(history?.actions || []).map((action: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 border rounded-lg"
                        data-testid={`history-item-${i}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {action.success ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                            <span className="font-medium">{action.actionId}</span>
                            <Badge variant="outline">{action.category}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(action.timestamp), 'MMM d, HH:mm')}
                          </span>
                        </div>
                        {action.message && (
                          <p className="text-sm text-muted-foreground mt-1">{action.message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <History className="w-12 h-12 mb-4 opacity-50" />
                    <p>No action history yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </CanvasHubPage>
  );
}
