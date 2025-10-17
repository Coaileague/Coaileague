import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle, AlertCircle, MessageSquare, Shield } from "lucide-react";

interface AnimatedStatusBarProps {
  isSilenced: boolean;
  isConnected: boolean;
  typingUser?: { name: string; isStaff: boolean } | null;
  justGotVoice?: boolean;
}

const SILENCED_MESSAGES = [
  { text: "You are silenced - Please wait until support staff helps you", icon: AlertCircle, color: "text-amber-600" },
  { text: "Please wait... A support representative will be with you shortly", icon: Clock, color: "text-blue-600" },
  { text: "We appreciate your patience - You'll be able to speak soon", icon: MessageSquare, color: "text-purple-600" },
  { text: "Support staff is reviewing your request", icon: Shield, color: "text-emerald-600" },
  { text: "Thank you for waiting - Help is on the way!", icon: CheckCircle, color: "text-indigo-600" },
];

export function AnimatedStatusBar({ 
  isSilenced, 
  isConnected, 
  typingUser,
  justGotVoice 
}: AnimatedStatusBarProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [showVoiceGranted, setShowVoiceGranted] = useState(false);

  useEffect(() => {
    if (isSilenced) {
      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % SILENCED_MESSAGES.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [isSilenced]);

  useEffect(() => {
    if (justGotVoice) {
      setShowVoiceGranted(true);
      const timer = setTimeout(() => setShowVoiceGranted(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [justGotVoice]);

  const currentMessage = SILENCED_MESSAGES[messageIndex];
  const IconComponent = currentMessage.icon;

  if (showVoiceGranted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 text-sm font-semibold text-green-600"
        data-testid="voice-granted-message"
      >
        <CheckCircle className="w-4 h-4 animate-pulse" />
        <span>You can speak now! Please type your message and hit Enter</span>
      </motion.div>
    );
  }

  if (typingUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 3 }}
        className={`flex items-center gap-2 text-sm ${
          typingUser.isStaff ? "text-emerald-600 font-semibold" : "text-blue-600"
        }`}
        data-testid="typing-status"
      >
        {typingUser.isStaff && <Shield className="w-4 h-4" />}
        <span>{typingUser.name}</span>
        <span>is typing</span>
        <div className="flex gap-1">
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              typingUser.isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              typingUser.isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
          />
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              typingUser.isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
          />
        </div>
      </motion.div>
    );
  }

  // Disconnected state - Critical warning
  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 text-sm font-semibold text-red-600"
        data-testid="disconnected-status"
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
        >
          <AlertCircle className="w-4 h-4" />
        </motion.div>
        <span>Disconnected - Attempting to reconnect...</span>
      </motion.div>
    );
  }

  if (isSilenced) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={messageIndex}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 10 }}
          transition={{ duration: 0.3 }}
          className={`flex items-center gap-2 text-sm font-medium ${currentMessage.color}`}
          data-testid="silenced-message"
        >
          <IconComponent className="w-4 h-4" />
          <span>{currentMessage.text}</span>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="default-status">
      <Clock className="w-4 h-4" />
      <span>Enter to send</span>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="ml-auto flex items-center gap-1.5 text-green-600"
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-green-500"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-xs font-medium">Connected</span>
      </motion.div>
    </div>
  );
}
