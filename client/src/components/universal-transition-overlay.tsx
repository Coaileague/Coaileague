import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WorkforceOSLogo } from "./workforceos-logo";
import { Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export type TransitionStatus = "loading" | "success" | "error" | "info";

interface UniversalTransitionOverlayProps {
  isVisible: boolean;
  status?: TransitionStatus;
  message?: string;
  submessage?: string;
  duration?: number; // Auto-hide after X ms
  onComplete?: () => void;
}

export function UniversalTransitionOverlay({
  isVisible,
  status = "loading",
  message,
  submessage,
  duration,
  onComplete
}: UniversalTransitionOverlayProps) {
  
  useEffect(() => {
    if (isVisible && duration && onComplete) {
      const timer = setTimeout(onComplete, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onComplete]);

  const statusConfig = {
    loading: {
      icon: <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />,
      color: "from-blue-500/20 to-indigo-500/20",
      borderColor: "border-blue-500/30"
    },
    success: {
      icon: <CheckCircle className="w-12 h-12 text-emerald-400" />,
      color: "from-emerald-500/20 to-green-500/20",
      borderColor: "border-emerald-500/30"
    },
    error: {
      icon: <XCircle className="w-12 h-12 text-red-400" />,
      color: "from-red-500/20 to-rose-500/20",
      borderColor: "border-red-500/30"
    },
    info: {
      icon: <AlertCircle className="w-12 h-12 text-cyan-400" />,
      color: "from-cyan-500/20 to-blue-500/20",
      borderColor: "border-cyan-500/30"
    }
  };

  const config = statusConfig[status];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>

          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
            className={`relative backdrop-blur-xl bg-gradient-to-br ${config.color} border ${config.borderColor} rounded-3xl p-8 max-w-md mx-4 shadow-2xl`}
          >
            {/* Logo with animation */}
            <div className="flex justify-center mb-6">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring" }}
              >
                <WorkforceOSLogo className="h-16" />
              </motion.div>
            </div>

            {/* Status icon */}
            <div className="flex justify-center mb-4">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", damping: 15 }}
              >
                {config.icon}
              </motion.div>
            </div>

            {/* Message */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <h3 className="text-white font-semibold text-lg mb-2">
                  {message}
                </h3>
                {submessage && (
                  <p className="text-slate-300 text-sm">
                    {submessage}
                  </p>
                )}
              </motion.div>
            )}

            {/* Loading dots animation */}
            {status === "loading" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex justify-center gap-2 mt-6"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-blue-400 rounded-full"
                    animate={{
                      scale: [1, 1.5, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                  />
                ))}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
