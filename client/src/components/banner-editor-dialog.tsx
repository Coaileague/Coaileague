/**
 * Banner Editor Dialog - Support Staff Only
 * Manage chat announcement banners with live updates
 * Includes seasonal effects and special occasions
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Trash2, Edit3, Send, Sparkles, 
  AlertCircle, CheckCircle, Info, Zap,
  Snowflake, Heart, Ghost, PartyPopper
} from "lucide-react";

interface BannerMessage {
  id: string;
  text: string;
  type: 'info' | 'warning' | 'success' | 'promo' | 'queue';
  link?: string;
  icon?: string;
  emoticon?: string;
  effect?: 'none' | 'snow' | 'fireworks' | 'hearts' | 'halloween' | 'sparkles';
}

interface BannerEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMessages: BannerMessage[];
  onSave: (messages: BannerMessage[]) => void;
}

export function BannerEditorDialog({ 
  open, 
  onOpenChange, 
  currentMessages = [],
  onSave 
}: BannerEditorDialogProps) {
  const [messages, setMessages] = useState<BannerMessage[]>(currentMessages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState({
    text: '',
    type: 'info' as const,
    link: '',
    icon: 'bell',
    emoticon: 'wave',
    effect: 'none' as const
  });
  const { toast } = useToast();

  // Emoticon options
  const emoticonOptions = [
    { value: 'wave', label: '👋 Wave', icon: '👋' },
    { value: 'star', label: '⭐ Star', icon: '⭐' },
    { value: 'fire', label: '🔥 Fire', icon: '🔥' },
    { value: 'rocket', label: '🚀 Rocket', icon: '🚀' },
    { value: 'party', label: '🎉 Party', icon: '🎉' },
    { value: 'heart', label: '❤️ Heart', icon: '❤️' },
    { value: 'check', label: '✅ Check', icon: '✅' },
    { value: 'clock', label: '⏰ Clock', icon: '⏰' },
    { value: 'bell', label: '🔔 Bell', icon: '🔔' },
    { value: 'trophy', label: '🏆 Trophy', icon: '🏆' },
  ];

  // Icon options
  const iconOptions = [
    { value: 'alert', label: 'Alert' },
    { value: 'clock', label: 'Clock' },
    { value: 'users', label: 'Users' },
    { value: 'zap', label: 'Lightning' },
    { value: 'bell', label: 'Bell' },
    { value: 'star', label: 'Star' },
    { value: 'heart', label: 'Heart' },
  ];

  // Special effects for seasons/holidays
  const effectOptions = [
    { value: 'none', label: 'None', icon: null },
    { value: 'snow', label: '❄️ Snow (Winter)', icon: Snowflake },
    { value: 'fireworks', label: '🎆 Fireworks (Celebrations)', icon: PartyPopper },
    { value: 'hearts', label: '💝 Hearts (Valentine\'s)', icon: Heart },
    { value: 'halloween', label: '🎃 Halloween Spooky', icon: Ghost },
    { value: 'sparkles', label: '✨ Sparkles (Special)', icon: Sparkles },
  ];

  const addMessage = () => {
    if (!newMessage.text.trim()) {
      toast({
        title: "Error",
        description: "Message text cannot be empty",
        variant: "destructive",
      });
      return;
    }

    const message: BannerMessage = {
      id: Date.now().toString(),
      text: newMessage.text,
      type: newMessage.type,
      link: newMessage.link || undefined,
      icon: newMessage.icon,
      emoticon: newMessage.emoticon,
      effect: newMessage.effect,
    };

    setMessages([...messages, message]);
    setNewMessage({
      text: '',
      type: 'info',
      link: '',
      icon: 'bell',
      emoticon: 'wave',
      effect: 'none'
    });
  };

  const deleteMessage = (id: string) => {
    setMessages(messages.filter(m => m.id !== id));
  };

  const handleSave = () => {
    onSave(messages);
    toast({
      title: "✅ Banner Updated",
      description: "Changes published to all users",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            Manage Chat Banners
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Create rotating announcements with emoticons and special effects
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Current Messages */}
          <div className="space-y-4 mb-6">
            <Label className="text-sm font-semibold">Live Messages ({messages.length})</Label>
            {messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No banner messages. Add one below to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div 
                    key={msg.id} 
                    className="flex items-center gap-2 p-3 border rounded-lg bg-card hover-elevate"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={msg.type === 'promo' ? 'default' : 'secondary'} className="text-xs">
                          {msg.type}
                        </Badge>
                        {msg.effect !== 'none' && (
                          <Badge variant="outline" className="text-xs">
                            {effectOptions.find(e => e.value === msg.effect)?.label}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{msg.text}</p>
                      {msg.link && (
                        <p className="text-xs text-muted-foreground mt-1">🔗 {msg.link}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMessage(msg.id)}
                      data-testid={`delete-banner-${msg.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Message */}
          <div className="space-y-4 border-t pt-4">
            <Label className="text-sm font-semibold">Add New Banner</Label>
            
            <div>
              <Label className="text-xs">Message Text</Label>
              <Input
                value={newMessage.text}
                onChange={(e) => setNewMessage({ ...newMessage, text: e.target.value })}
                placeholder="Type your announcement message..."
                className="mt-1"
                data-testid="input-banner-text"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={newMessage.type}
                  onValueChange={(value: any) => setNewMessage({ ...newMessage, type: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="select-banner-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="promo">Promotion</SelectItem>
                    <SelectItem value="queue">Queue Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Emoticon</Label>
                <Select
                  value={newMessage.emoticon}
                  onValueChange={(value) => setNewMessage({ ...newMessage, emoticon: value })}
                >
                  <SelectTrigger className="mt-1" data-testid="select-emoticon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {emoticonOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Special Effect (Optional)</Label>
              <Select
                value={newMessage.effect}
                onValueChange={(value: any) => setNewMessage({ ...newMessage, effect: value })}
              >
                <SelectTrigger className="mt-1" data-testid="select-effect">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {effectOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Link URL (Optional)</Label>
              <Input
                value={newMessage.link}
                onChange={(e) => setNewMessage({ ...newMessage, link: e.target.value })}
                placeholder="/pricing, /features, https://..."
                className="mt-1"
                data-testid="input-banner-link"
              />
            </div>

            <Button onClick={addMessage} className="w-full" data-testid="button-add-banner">
              <Plus className="w-4 h-4 mr-2" />
              Add Banner Message
            </Button>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save-banners">
            <Send className="w-4 h-4 mr-2" />
            Publish Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
