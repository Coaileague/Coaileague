import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AutoForceAFLogo } from "./autoforce-af-logo";
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
      icon: <Loader2 className="w-12 h-12 text-primary animate-spin" />,
      color: "from-primary/20 to-green-500/20",
      borderColor: "border-primary/30"
    },
    success: {
      icon: <CheckCircle className="w-12 h-12 text-primary" />,
      color: "from-primary/20 to-green-500/20",
      borderColor: "border-primary/30"
    },
    error: {
      icon: <XCircle className="w-12 h-12 text-red-400" />,
      color: "from-red-500/20 to-rose-500/20",
      borderColor: "border-red-500/30"
    },
    info: {
      icon: <AlertCircle className="w-12 h-12 text-primary" />,
      color: "from-primary/20 to-green-500/20",
      borderColor: "border-primary/30"
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
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          {/* Animated gradient background - emergency green theme */}
          <div className="absolute inset-0 opacity-20">
            <motion.div 
              className="absolute top-1/4 left-1/4 w-96 h-96 bg-muted/30 rounded-full filter blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.4, 0.2]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div 
              className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-600 rounded-full filter blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.2, 0.4, 0.2]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1.5
              }}
            />
          </div>

          <motion.div
            initial={{ scale: 0.8, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: -30, opacity: 0 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 150,
              duration: 0.8
            }}
            className={`relative backdrop-blur-xl bg-gradient-to-br ${config.color} border ${config.borderColor} rounded-2xl sm:rounded-3xl p-8 sm:p-10 w-[90vw] max-w-[380px] sm:max-w-[480px] mx-auto shadow-2xl`}
          >
            {/* Logo with animation - responsive sizing */}
            <div className="flex justify-center mb-6 sm:mb-8">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  delay: 0.2, 
                  type: "spring",
                  damping: 20,
                  stiffness: 150
                }}
                className="flex flex-col items-center gap-3 sm:gap-4"
              >
                {/* New simplified AF logo */}
                <AutoForceAFLogo 
                  variant="icon" 
                  size="lg" 
                  animated={status === "loading"}
                />
                
                {/* Brand Name */}
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-baseline gap-1 justify-center">
                    <span className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                      AutoForce
                    </span>
                    <span className="text-[10px] font-black text-primary align-super">™</span>
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold text-slate-300 text-center leading-tight px-2">
                    Autonomous Workforce Management Solutions
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Message - responsive text sizing */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ 
                  delay: 0.6,
                  duration: 0.5,
                  ease: "easeOut"
                }}
                className="text-center space-y-3"
              >
                <h3 className="text-white font-bold text-lg sm:text-xl leading-tight px-4 break-words">
                  {message}
                </h3>
                {submessage && (
                  <motion.p 
                    className="text-slate-300 text-sm sm:text-base leading-relaxed px-4 break-words"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.5 }}
                  >
                    {submessage}
                  </motion.p>
                )}
              </motion.div>
            )}

            {/* Loading dots animation - emergency green theme */}
            {status === "loading" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="flex justify-center gap-3 mt-8"
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 sm:w-4 sm:h-4 bg-primary rounded-full"
                    animate={{
                      scale: [1, 1.8, 1],
                      opacity: [0.4, 1, 0.4]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </motion.div>
            )}
            
            {/* Status icon for non-loading states */}
            {status !== "loading" && (
              <div className="flex justify-center mt-6">
                <motion.div
                  initial={{ scale: 0, rotate: -360 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    delay: 0.6, 
                    type: "spring", 
                    damping: 15,
                    duration: 0.8
                  }}
                  className="[&>svg]:w-12 [&>svg]:h-12 sm:[&>svg]:w-14 sm:[&>svg]:h-14"
                >
                  {config.icon}
                </motion.div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
