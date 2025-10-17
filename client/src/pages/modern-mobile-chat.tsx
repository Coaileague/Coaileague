import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useChatroomWebSocket } from "@/hooks/use-chatroom-websocket";
import { useChatSounds } from "@/hooks/use-chat-sounds";
import { 
  Send, Menu, X, Settings, Users, Circle, Shield, 
  Headphones, Bot, MessageSquare, Lock, HelpCircle,
  XCircle, CheckCircle, Clock, AlertCircle, ChevronDown
} from "lucide-react";
import type { ChatMessage } from "@shared/schema";

interface OnlineUser {
  id: string;
  name: string;
  role: 'admin' | 'support' | 'customer' | 'bot';
  status: 'online';
}

export default function ModernMobileChat() {
  const [messageText, setMessageText] = useState("");
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { playSound } = useChatSounds();

  // Get current user data
  const { data: currentUser } = useQuery<{ user: { id: string; email: string; platformRole?: string } }>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const userId = currentUser?.user?.id;
  const userName = currentUser?.user?.email || 'Guest';
  const isStaff = currentUser?.user?.platformRole && 
    ['root', 'deputy_admin', 'deputy_assistant', 'sysop'].includes(currentUser.user.platformRole);
  const isAuthenticated = !!currentUser?.user;

  // Fetch HelpDesk room info
  const { data: helpDeskRoom } = useQuery<{ status: string; statusMessage: string | null }>({
    queryKey: ['/api/helpdesk/room/helpdesk'],
    enabled: !!userId && isAuthenticated,
    retry: false,
    staleTime: 30000,
  });

  // Use WebSocket for real-time messaging
  const { 
    messages, sendMessage, onlineUsers, isConnected
  } = useChatroomWebSocket(isAuthenticated ? userId : undefined, userName);

  const commands = [
    { icon: MessageSquare, label: 'Send Welcome', command: '/intro', color: 'text-blue-400' },
    { icon: Lock, label: 'Request Auth', command: '/auth', color: 'text-indigo-400' },
    { icon: HelpCircle, label: 'Show Help', command: '/help', color: 'text-cyan-400' },
    { icon: XCircle, label: 'Close & Feedback', command: '/close', color: 'text-slate-400' },
    { icon: CheckCircle, label: 'Verify User', command: '/verify', color: 'text-emerald-400' },
    { icon: Users, label: 'View Queue', command: '/queue', color: 'text-purple-400' },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (messageText.trim()) {
      sendMessage(messageText, userName, isStaff ? 'support' : 'customer');
      setMessageText('');
      playSound('send');
    }
  };

  const handleCommandExecute = (command: string) => {
    sendMessage(command, userName, 'support');
    setShowCommandMenu(false);
    toast({ title: "Command executed", description: `${command} sent` });
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col max-w-md mx-auto relative overflow-hidden">
      {/* Animated background effect - WorkforceOS colors */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header */}
      <div className="relative z-10 backdrop-blur-xl bg-black/30 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-sm">
                  HD
                </div>
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                helpDeskRoom?.status === 'open' ? 'bg-emerald-500' : 'bg-red-500'
              }`}></div>
            </div>
            <div>
              <h2 className="text-white font-bold text-sm">Help Desk</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Users size={12} />
                <span>{onlineUsers.length} online</span>
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} animate-pulse`} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isStaff && (
              <button 
                onClick={() => setShowCommandMenu(!showCommandMenu)}
                className={`p-2 rounded-full transition-all ${
                  showCommandMenu ? 'bg-indigo-500 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
                data-testid="button-command-menu"
              >
                <Menu size={20} />
              </button>
            )}
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
              data-testid="button-settings"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Command Grid Menu */}
      {showCommandMenu && isStaff && (
        <div className="absolute top-16 left-4 right-4 z-50 backdrop-blur-xl bg-black/80 rounded-2xl border border-white/10 p-4 shadow-2xl animate-in slide-in-from-top-2 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              Support Commands
            </h3>
            <button 
              onClick={() => setShowCommandMenu(false)} 
              className="text-slate-400 hover:text-white"
              data-testid="button-close-commands"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {commands.map((cmd, idx) => (
              <button
                key={idx}
                onClick={() => handleCommandExecute(cmd.command)}
                className="flex flex-col items-center gap-2 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all active:scale-95 border border-white/5"
                data-testid={`command-${cmd.command.slice(1)}`}
              >
                <cmd.icon size={24} className={cmd.color} />
                <span className="text-xs text-slate-300 text-center font-medium">{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-16 right-4 z-50 backdrop-blur-xl bg-black/80 rounded-2xl border border-white/10 p-4 w-64 shadow-2xl animate-in slide-in-from-top-2 fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Chat Settings</h3>
            <button 
              onClick={() => setShowSettings(false)} 
              className="text-slate-400 hover:text-white"
              data-testid="button-close-settings"
            >
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Sound alerts</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Timestamps</span>
              <input type="checkbox" defaultChecked className="rounded" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Notifications</span>
              <input type="checkbox" className="rounded" />
            </label>
          </div>
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative z-10">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold ${
              msg.senderType === 'bot' ? 'from-purple-500 to-pink-500' :
              msg.senderType === 'support' ? 'from-indigo-500 to-blue-500' :
              'from-slate-600 to-slate-700'
            }`}>
              {msg.senderType === 'bot' ? <Bot size={16} /> : msg.senderName?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-semibold text-sm ${
                  msg.senderType === 'bot' ? 'text-purple-400' :
                  msg.senderType === 'support' ? 'text-indigo-400' :
                  'text-white'
                }`}>
                  {msg.senderName}
                </span>
                {msg.senderType === 'support' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-indigo-500/20 text-indigo-400 border-indigo-500/30">
                    STAFF
                  </Badge>
                )}
                {msg.senderType === 'bot' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-500/20 text-purple-400 border-purple-500/30">
                    AI
                  </Badge>
                )}
                <span className="text-[10px] text-slate-500">
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed break-words whitespace-pre-wrap">{msg.message}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions Bar (Staff Only) */}
      {isStaff && (
        <div className="relative z-10 backdrop-blur-xl bg-black/30 border-t border-white/10 px-4 py-2">
          <div className="flex items-center justify-around">
            <button
              onClick={() => handleCommandExecute('/intro')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-white/5 rounded-lg transition-all active:scale-95"
              data-testid="quick-intro"
            >
              <MessageSquare size={20} className="text-blue-400" />
              <span className="text-[10px] text-slate-400">Welcome</span>
            </button>
            <button
              onClick={() => handleCommandExecute('/auth')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-white/5 rounded-lg transition-all active:scale-95"
              data-testid="quick-auth"
            >
              <Lock size={20} className="text-indigo-400" />
              <span className="text-[10px] text-slate-400">Auth</span>
            </button>
            <button
              onClick={() => handleCommandExecute('/help')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-white/5 rounded-lg transition-all active:scale-95"
              data-testid="quick-help"
            >
              <HelpCircle size={20} className="text-cyan-400" />
              <span className="text-[10px] text-slate-400">Help</span>
            </button>
            <button
              onClick={() => handleCommandExecute('/close')}
              className="flex flex-col items-center gap-1 p-2 hover:bg-white/5 rounded-lg transition-all active:scale-95"
              data-testid="quick-close"
            >
              <XCircle size={20} className="text-slate-400" />
              <span className="text-[10px] text-slate-400">Close</span>
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="relative z-10 backdrop-blur-xl bg-black/40 border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="w-full bg-white/10 backdrop-blur-sm text-white placeholder-slate-400 px-4 py-3 rounded-full border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              data-testid="input-message"
            />
          </div>

          <button
            onClick={handleSend}
            className="p-3 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full text-white hover:shadow-lg hover:shadow-indigo-500/50 transition-all active:scale-95"
            data-testid="button-send"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
