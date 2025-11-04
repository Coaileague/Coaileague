import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AutoForceLogo } from "./workforceos-logo";
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
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          {/* Animated gradient background - slower pulse */}
          <div className="absolute inset-0 opacity-30">
            <motion.div 
              className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div 
              className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full filter blur-3xl"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3]
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
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ 
                  delay: 0.3, 
                  type: "spring",
                  damping: 20,
                  stiffness: 150
                }}
                className="w-full max-w-[200px] sm:max-w-[240px]"
              >
                <div className="flex flex-col items-center gap-3 sm:gap-4">
                  {/* Icon */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20">
                    <svg 
                      viewBox="0 0 100 100" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-full h-full"
                    >
                      <defs>
                        <linearGradient id="autoforce-gradient-overlay" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#3B82F6" />
                          <stop offset="50%" stopColor="#8B5CF6" />
                          <stop offset="100%" stopColor="#06B6D4" />
                        </linearGradient>
                        <filter id="glow-overlay">
                          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <circle cx="50" cy="50" r="45" fill="url(#autoforce-gradient-overlay)" opacity="0.1" />
                      <path 
                        d="M55 20 L35 55 L45 55 L40 80 L65 45 L55 45 Z" 
                        fill="url(#autoforce-gradient-overlay)"
                        filter="url(#glow-overlay)"
                        className="animate-pulse"
                      />
                      <text 
                        x="50" y="90" fontSize="14" fontWeight="900" 
                        fill="url(#autoforce-gradient-overlay)"
                        textAnchor="middle"
                        fontFamily="system-ui, -apple-system, sans-serif"
                      >
                        AF
                      </text>
                    </svg>
                  </div>
                  
                  {/* Brand Name */}
                  <div className="flex flex-col items-center gap-1 w-full">
                    <div className="flex items-baseline gap-1 justify-center">
                      <span className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
                        AutoForce
                      </span>
                      <span className="text-[10px] font-black text-blue-500 align-super">™</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-300 text-center leading-tight px-2 break-words">
                      Autonomous Workforce<br className="sm:hidden" /> Management Solutions
                    </span>
                  </div>
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

            {/* Loading dots animation - slower and more visible */}
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
                    className="w-3 h-3 sm:w-4 sm:h-4 bg-blue-400 rounded-full"
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
