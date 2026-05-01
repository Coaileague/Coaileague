import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Phone,
  MessageCircle,
  Mail,
  AlertCircle,
  Trash2,
  Pencil,
  ArrowUpDown,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  MessagesSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UniversalModal,
  UniversalModalHeader,
  UniversalModalTitle,
  UniversalModalFooter,
  UniversalModalContent,
} from "@/components/ui/universal-modal";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

interface ChannelBridge {
  id: string;
  workspaceId: string;
  channelType: string;
  displayName: string;
  providerConfig: Record<string, any>;
  webhookUrl: string | null;
  phoneNumber: string | null;
  emailAddress: string | null;
  status: string;
  lastActivityAt: string | null;
  messageCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BridgeConversation {
  id: string;
  bridgeId: string;
  workspaceId: string;
  conversationId: string | null;
  channelType: string;
  externalIdentifier: string;
  externalDisplayName: string | null;
  resolvedUserId: string | null;
  resolvedEmployeeId: string | null;
  status: string;
  lastMessageAt: string | null;
  messageCount: number;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface BridgeMessage {
  id: string;
  bridgeConversationId: string;
  workspaceId: string;
  chatMessageId: string | null;
  direction: string;
  channelType: string;
  externalMessageId: string | null;
  senderIdentity: string | null;
  messageContent: string | null;
  messageType: string;
  attachmentUrl: string | null;
  deliveryStatus: string;
  providerResponse: Record<string, any> | null;
  creditsCost: number;
  createdAt: string;
  updatedAt: string;
}

interface ConversationListResponse {
  items: BridgeConversation[];
  total: number;
  limit: number;
  offset: number;
}

interface MessageListResponse {
  items: BridgeMessage[];
  total: number;
  limit: number;
  offset: number;
}

const CHANNEL_TYPES = [
  { value: "sms", label: "SMS", icon: Phone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "email", label: "Email", icon: Mail },
  { value: "messenger", label: "Messenger", icon: MessagesSquare },
] as const;

const CHANNEL_ICON_MAP: Record<string, typeof Phone> = {
  sms: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  messenger: MessagesSquare,
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/15 text-green-600 dark:text-green-400",
  inactive: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  error: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const DELIVERY_STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-500/15 text-green-600 dark:text-green-400",
  delivered: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

type ViewMode = "channels" | "conversations" | "messages";

const pageConfig: CanvasPageConfig = {
  id: "bridge-channels",
  title: "Bridge Channels",
  subtitle: "Manage external messaging bridges for SMS, WhatsApp, Email, and Messenger",
  category: "operations",
};

export default function BridgeChannels() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>("channels");
  const [createOpen, setCreateOpen] = useState(false);
  const [editBridge, setEditBridge] = useState<ChannelBridge | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<BridgeConversation | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendConversation, setSendConversation] = useState<BridgeConversation | null>(null);
  const [sendMessage, setSendMessage] = useState("");

  const [formDisplayName, setFormDisplayName] = useState("");
  const [formChannelType, setFormChannelType] = useState("sms");
  const [formPhoneNumber, setFormPhoneNumber] = useState("");
  const [formEmailAddress, setFormEmailAddress] = useState("");
  const [formStatus, setFormStatus] = useState("inactive");

  const { data: channels, isLoading: channelsLoading, isError: channelsError } = useQuery<ChannelBridge[]>({
    queryKey: ["/api/bridges/channels"],
  });

  const { data: conversationsData, isLoading: convsLoading, isError: convsError } = useQuery<ConversationListResponse>({
    queryKey: ["/api/bridges/conversations"],
    enabled: viewMode === "conversations" || viewMode === "messages",
  });

  const { data: messagesData, isLoading: msgsLoading } = useQuery<MessageListResponse>({
    queryKey: ["/api/bridges/conversations", selectedConversation?.id, "messages"],
    enabled: !!selectedConversation,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/bridges/channels", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bridges/channels"] });
      setCreateOpen(false);
      resetForm();
      toast({ title: "Channel Created", description: "Bridge channel has been created." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to create channel", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/bridges/channels/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bridges/channels"] });
      setEditBridge(null);
      toast({ title: "Channel Updated", description: "Bridge channel has been updated." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to update channel", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/bridges/channels/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bridges/channels"] });
      setEditBridge(null);
      toast({ title: "Channel Removed", description: "Bridge channel has been removed or deactivated." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to delete channel", variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/bridges/send", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bridges/conversations"] });
      setSendOpen(false);
      setSendMessage("");
      setSendConversation(null);
      toast({ title: "Message Sent", description: "Outbound message has been sent." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message || "Failed to send message", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormDisplayName("");
    setFormChannelType("sms");
    setFormPhoneNumber("");
    setFormEmailAddress("");
    setFormStatus("inactive");
  };

  const openEdit = (bridge: ChannelBridge) => {
    setEditBridge(bridge);
    setFormDisplayName(bridge.displayName);
    setFormChannelType(bridge.channelType);
    setFormPhoneNumber(bridge.phoneNumber || "");
    setFormEmailAddress(bridge.emailAddress || "");
    setFormStatus(bridge.status);
  };

  const handleCreate = () => {
    if (!formDisplayName.trim()) {
      toast({ title: "Validation Error", description: "Display name is required.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      displayName: formDisplayName.trim(),
      channelType: formChannelType,
      phoneNumber: formPhoneNumber || undefined,
      emailAddress: formEmailAddress || undefined,
      status: formStatus,
    });
  };

  const handleUpdate = () => {
    if (!editBridge) return;
    updateMutation.mutate({
      id: editBridge.id,
      data: {
        displayName: formDisplayName.trim(),
        phoneNumber: formPhoneNumber || undefined,
        emailAddress: formEmailAddress || undefined,
        status: formStatus,
      },
    });
  };

  const handleSend = () => {
    if (!sendConversation || !sendMessage.trim()) return;
    sendMutation.mutate({
      bridgeConversationId: sendConversation.id,
      message: sendMessage.trim(),
      channelType: sendConversation.channelType,
    });
  };

  const channelList = channels || [];
  const conversations = conversationsData?.items || [];
  const messages = messagesData?.items || [];

  const totalBridges = channelList.length;
  const activeBridges = channelList.filter((c) => c.status === "active").length;
  const totalConversations = conversationsData?.total || 0;
  const messagesToday = channelList.reduce((sum, c) => sum + (c.messageCount || 0), 0);

  const getChannelIcon = (type: string) => {
    const Icon = CHANNEL_ICON_MAP[type] || MessagesSquare;
    return <Icon className="w-4 h-4" />;
  };

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant={viewMode === "channels" ? "default" : "outline"}
        size="sm"
        onClick={() => { setViewMode("channels"); setSelectedConversation(null); }}
        data-testid="button-view-channels"
      >
        Channels
      </Button>
      <Button
        variant={viewMode === "conversations" ? "default" : "outline"}
        size="sm"
        onClick={() => { setViewMode("conversations"); setSelectedConversation(null); }}
        data-testid="button-view-conversations"
      >
        Conversations
      </Button>
      <Button onClick={() => { resetForm(); setCreateOpen(true); }} data-testid="button-add-channel">
        <Plus className="w-4 h-4 mr-2" />
        Add Channel
      </Button>
    </div>
  );

  return (
    <CanvasHubPage config={{ ...pageConfig, headerActions }}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Bridges</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-total-bridges">{totalBridges}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-active-bridges">{activeBridges}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <MessagesSquare className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Conversations</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-active-conversations">{totalConversations}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Messages</span>
            </div>
            <p className="text-2xl font-bold mt-1" data-testid="stat-messages-today">{messagesToday}</p>
          </Card>
        </div>

        {viewMode === "channels" && (
          <>
            {channelsError ? (
              <Card className="p-12 text-center" data-testid="channels-error">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
                <p className="text-muted-foreground">Failed to load channels.</p>
              </Card>
            ) : channelsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : channelList.length === 0 ? (
              <Card className="p-12 text-center">
                <ArrowUpDown className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground" data-testid="text-no-channels">No bridge channels configured</p>
                <Button className="mt-4" onClick={() => { resetForm(); setCreateOpen(true); }} data-testid="button-add-first-channel">
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Channel
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {channelList.map((ch) => (
                  <Card
                    key={ch.id}
                    className="p-4 cursor-pointer hover-elevate transition-colors"
                    onClick={() => openEdit(ch)}
                    data-testid={`card-channel-${ch.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getChannelIcon(ch.channelType)}
                        <div>
                          <p className="font-medium" data-testid={`text-channel-name-${ch.id}`}>{ch.displayName}</p>
                          <p className="text-xs text-muted-foreground capitalize">{ch.channelType}</p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={STATUS_STYLES[ch.status] || STATUS_STYLES.inactive}
                        data-testid={`badge-status-${ch.id}`}
                      >
                        {ch.status}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {ch.phoneNumber && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span data-testid={`text-phone-${ch.id}`}>{ch.phoneNumber}</span>
                        </div>
                      )}
                      {ch.emailAddress && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span data-testid={`text-email-${ch.id}`}>{ch.emailAddress}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span data-testid={`text-msg-count-${ch.id}`}>{ch.messageCount} messages</span>
                        {ch.lastActivityAt && (
                          <span>{format(new Date(ch.lastActivityAt), "MMM d, yyyy")}</span>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "conversations" && !selectedConversation && (
          <>
            {convsError ? (
              <Card className="p-12 text-center" data-testid="conversations-error">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
                <p className="text-muted-foreground">Failed to load conversations.</p>
              </Card>
            ) : convsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <Card className="p-12 text-center">
                <MessagesSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground" data-testid="text-no-conversations">No bridge conversations yet</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <Card
                    key={conv.id}
                    className="p-3 cursor-pointer hover-elevate transition-colors"
                    onClick={() => setSelectedConversation(conv)}
                    data-testid={`card-conversation-${conv.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {getChannelIcon(conv.channelType)}
                        <div className="min-w-0">
                          <p className="font-medium truncate" data-testid={`text-conv-name-${conv.id}`}>
                            {conv.externalDisplayName || conv.externalIdentifier}
                          </p>
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-conv-identifier-${conv.id}`}>
                            {conv.externalIdentifier}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="capitalize text-xs">{conv.channelType}</Badge>
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[conv.status] || STATUS_STYLES.inactive}
                          data-testid={`badge-conv-status-${conv.id}`}
                        >
                          {conv.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground" data-testid={`text-conv-count-${conv.id}`}>
                          {conv.messageCount} msgs
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSendConversation(conv);
                            setSendOpen(true);
                          }}
                          data-testid={`button-reply-${conv.id}`}
                        >
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {viewMode === "conversations" && selectedConversation && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedConversation(null)}
                  data-testid="button-back-conversations"
                >
                  Back
                </Button>
                <div className="flex items-center gap-2">
                  {getChannelIcon(selectedConversation.channelType)}
                  <span className="font-medium" data-testid="text-selected-conv-name">
                    {selectedConversation.externalDisplayName || selectedConversation.externalIdentifier}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setSendConversation(selectedConversation);
                  setSendOpen(true);
                }}
                data-testid="button-send-reply"
              >
                <Send className="w-4 h-4 mr-2" />
                Reply
              </Button>
            </div>

            {msgsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground" data-testid="text-no-messages">No messages in this conversation</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <Card
                    key={msg.id}
                    className={`p-3 ${msg.direction === "outbound" ? "ml-8" : "mr-8"}`}
                    data-testid={`card-message-${msg.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs capitalize">
                            {msg.direction === "inbound" ? "Received" : "Sent"}
                          </Badge>
                          {msg.direction === "outbound" && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${DELIVERY_STATUS_STYLES[msg.deliveryStatus] || ""}`}
                              data-testid={`badge-delivery-${msg.id}`}
                            >
                              {msg.deliveryStatus}
                            </Badge>
                          )}
                          {msg.senderIdentity && (
                            <span className="text-xs text-muted-foreground" data-testid={`text-msg-sender-${msg.id}`}>
                              {msg.senderIdentity}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm" data-testid={`text-msg-content-${msg.id}`}>
                          {msg.messageContent || "(no content)"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {msg.createdAt ? format(new Date(msg.createdAt), "h:mm a") : ""}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <UniversalModal open={createOpen} onOpenChange={setCreateOpen}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-create-modal-title">Add Bridge Channel</UniversalModalTitle>
          </UniversalModalHeader>
          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <Label htmlFor="bridge-name">Display Name *</Label>
              <Input
                id="bridge-name"
                placeholder="e.g., Main SMS Line"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                data-testid="input-bridge-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bridge-type">Channel Type</Label>
              <Select value={formChannelType} onValueChange={setFormChannelType}>
                <SelectTrigger data-testid="select-bridge-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_TYPES.map((ct) => (
                    <SelectItem key={ct.value} value={ct.value} data-testid={`option-type-${ct.value}`}>
                      {ct.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(formChannelType === "sms" || formChannelType === "whatsapp") && (
              <div className="space-y-2">
                <Label htmlFor="bridge-phone">Phone Number</Label>
                <Input
                  id="bridge-phone"
                  placeholder="+1234567890"
                  value={formPhoneNumber}
                  onChange={(e) => setFormPhoneNumber(e.target.value)}
                  data-testid="input-bridge-phone"
                />
              </div>
            )}
            {formChannelType === "email" && (
              <div className="space-y-2">
                <Label htmlFor="bridge-email">Email Address</Label>
                <Input
                  id="bridge-email"
                  placeholder="support@company.com"
                  value={formEmailAddress}
                  onChange={(e) => setFormEmailAddress(e.target.value)}
                  data-testid="input-bridge-email"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="bridge-status">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger data-testid="select-bridge-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending} data-testid="button-submit-create">
              {createMutation.isPending ? "Creating..." : "Create Channel"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={!!editBridge} onOpenChange={(open) => { if (!open) setEditBridge(null); }}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-edit-modal-title">Edit Bridge Channel</UniversalModalTitle>
          </UniversalModalHeader>
          {editBridge && (
            <div className="space-y-4 p-4">
              <div className="space-y-2">
                <Label htmlFor="edit-bridge-name">Display Name</Label>
                <Input
                  id="edit-bridge-name"
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  data-testid="input-edit-bridge-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Channel Type</Label>
                <div className="flex items-center gap-2">
                  {getChannelIcon(editBridge.channelType)}
                  <span className="capitalize text-sm">{editBridge.channelType}</span>
                </div>
              </div>
              {(editBridge.channelType === "sms" || editBridge.channelType === "whatsapp") && (
                <div className="space-y-2">
                  <Label htmlFor="edit-bridge-phone">Phone Number</Label>
                  <Input
                    id="edit-bridge-phone"
                    value={formPhoneNumber}
                    onChange={(e) => setFormPhoneNumber(e.target.value)}
                    data-testid="input-edit-bridge-phone"
                  />
                </div>
              )}
              {editBridge.channelType === "email" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-bridge-email">Email Address</Label>
                  <Input
                    id="edit-bridge-email"
                    value={formEmailAddress}
                    onChange={(e) => setFormEmailAddress(e.target.value)}
                    data-testid="input-edit-bridge-email"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="edit-bridge-status">Status</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger data-testid="select-edit-bridge-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editBridge.webhookUrl && (
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <p className="text-xs text-muted-foreground break-all" data-testid="text-webhook-url">
                    {editBridge.webhookUrl}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Messages: {editBridge.messageCount}</span>
                {editBridge.createdAt && (
                  <span>Created: {format(new Date(editBridge.createdAt), "MMM d, yyyy")}</span>
                )}
              </div>
            </div>
          )}
          <UniversalModalFooter>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => { if (editBridge) deleteMutation.mutate(editBridge.id); }}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-channel"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditBridge(null)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending} data-testid="button-submit-edit">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>

      <UniversalModal open={sendOpen} onOpenChange={(open) => { if (!open) { setSendOpen(false); setSendConversation(null); setSendMessage(""); } }}>
        <UniversalModalContent className="max-w-lg">
          <UniversalModalHeader>
            <UniversalModalTitle data-testid="text-send-modal-title">Send Message</UniversalModalTitle>
          </UniversalModalHeader>
          {sendConversation && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2 text-sm">
                {getChannelIcon(sendConversation.channelType)}
                <span className="font-medium">
                  {sendConversation.externalDisplayName || sendConversation.externalIdentifier}
                </span>
                <Badge variant="outline" className="capitalize text-xs">{sendConversation.channelType}</Badge>
              </div>
              <div className="space-y-2">
                <Label htmlFor="send-message">Message</Label>
                <Textarea
                  id="send-message"
                  placeholder="Type your message..."
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  rows={4}
                  data-testid="input-send-message"
                />
              </div>
            </div>
          )}
          <UniversalModalFooter>
            <Button variant="outline" onClick={() => { setSendOpen(false); setSendConversation(null); setSendMessage(""); }} data-testid="button-cancel-send">
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sendMutation.isPending || !sendMessage.trim()} data-testid="button-submit-send">
              <Send className="w-4 h-4 mr-2" />
              {sendMutation.isPending ? "Sending..." : "Send"}
            </Button>
          </UniversalModalFooter>
        </UniversalModalContent>
      </UniversalModal>
    </CanvasHubPage>
  );
}
