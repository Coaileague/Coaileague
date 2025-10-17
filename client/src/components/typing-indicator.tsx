import { motion, AnimatePresence } from "framer-motion";

interface TypingIndicatorProps {
  userName: string;
  userType?: "staff" | "user";
}

export function TypingIndicator({ userName, userType = "user" }: TypingIndicatorProps) {
  const isStaff = userType === "staff";
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className={`flex items-center gap-2 text-xs ${
          isStaff ? "text-emerald-600" : "text-blue-600"
        }`}
        data-testid="typing-indicator"
      >
        <span className="font-semibold">{userName}</span>
        <span>is typing</span>
        <div className="flex gap-1">
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
          />
          <motion.div
            className={`w-1.5 h-1.5 rounded-full ${
              isStaff ? "bg-emerald-500" : "bg-blue-500"
            }`}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
