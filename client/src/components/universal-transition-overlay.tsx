import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AutoForceAFLogo } from "./autoforce-af-logo";
import { 
  Loader2, CheckCircle, XCircle, AlertCircle, 
  Activity, Zap, Shield, Database, CloudUpload,
  RefreshCw, BarChart3, FileText, DollarSign
} from "lucide-react";

export type TransitionStatus = "loading" | "success" | "error" | "info" | "denied";
export type AnimationType = 
  | "spinner" | "progress-bar" | "waves" | "dots" | "pulse" 
  | "gradient" | "orbit" | "skeleton" | "ripple" | "bounce";

export type ScenarioType = 
  | "login" | "logout" | "schedule" | "invoice" | "payroll" 
  | "email" | "analytics" | "upload" | "general";

interface UniversalTransitionOverlayProps {
  isVisible: boolean;
  status?: TransitionStatus;
  animationType?: AnimationType;
  scenario?: ScenarioType;
  message?: string;
  submessage?: string;
  progress?: number; // 0-100
  duration?: number;
  onComplete?: () => void;
  onDenied?: () => void; // Called when access is denied
}

// Animation Components
function SpinnerAnimation({ color }: { color: string }) {
  return (
    <motion.div
      className={`w-16 h-16 border-4 ${color} border-t-transparent rounded-full`}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    />
  );
}

function WavesAnimation({ color }: { color: string }) {
  return (
    <div className="flex gap-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className={`w-3 h-16 ${color} rounded-full`}
          animate={{
            scaleY: [1, 2, 0.5, 1],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

function DotsAnimation({ color }: { color: string }) {
  return (
    <div className="flex gap-3">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`w-4 h-4 ${color} rounded-full`}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.4, 1, 0.4]
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

function PulseAnimation({ color }: { color: string }) {
  return (
    <motion.div
      className={`w-20 h-20 ${color} rounded-full`}
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.3, 0.8, 0.3]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
}

function GradientAnimation() {
  return (
    <motion.div
      className="w-24 h-24 rounded-full"
      style={{
        background: "linear-gradient(135deg, #3b82f6 0%, #22d3ee 100%)"
      }}
      animate={{
        rotate: 360,
        scale: [1, 1.1, 1]
      }}
      transition={{
        rotate: { duration: 3, repeat: Infinity, ease: "linear" },
        scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
      }}
    />
  );
}

function OrbitAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-24 h-24">
      <motion.div
        className={`absolute top-1/2 left-1/2 w-4 h-4 ${color} rounded-full`}
        animate={{
          x: [0, 40, 0, -40, 0],
          y: [40, 0, -40, 0, 40]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ x: "-50%", y: "-50%" }}
      />
      <motion.div
        className={`absolute top-1/2 left-1/2 w-4 h-4 ${color} rounded-full opacity-60`}
        animate={{
          x: [-40, 0, 40, 0, -40],
          y: [0, -40, 0, 40, 0]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "linear"
        }}
        style={{ x: "-50%", y: "-50%" }}
      />
    </div>
  );
}

function SkeletonAnimation() {
  return (
    <div className="space-y-3 w-48">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-3 bg-gradient-to-r from-slate-600 to-slate-500 rounded"
          animate={{
            opacity: [0.3, 0.7, 0.3]
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
}

function RippleAnimation({ color }: { color: string }) {
  return (
    <div className="relative w-24 h-24">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`absolute inset-0 ${color} rounded-full opacity-20`}
          animate={{
            scale: [0, 1.5],
            opacity: [0.5, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
}

function BounceAnimation({ color }: { color: string }) {
  return (
    <motion.div
      className={`w-16 h-16 ${color} rounded-lg`}
      animate={{
        y: [-20, 20, -20],
        rotate: [0, 180, 360]
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
}

function ProgressBarAnimation({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="w-64 space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-slate-400">Processing</span>
        <span className="text-sm font-semibold text-white">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-4 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50 relative">
        <motion.div
          className={`h-full ${color} rounded-full relative overflow-hidden`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{
              x: ["-100%", "200%"]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "linear"
            }}
          />
        </motion.div>
      </div>
      <div className="flex gap-2 justify-center">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`w-2 h-2 ${color} rounded-full`}
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.4, 1, 0.4]
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function UniversalTransitionOverlay({
  isVisible,
  status = "loading",
  animationType = "spinner",
  scenario = "general",
  message,
  submessage,
  progress,
  duration,
  onComplete,
  onDenied
}: UniversalTransitionOverlayProps) {
  const [localProgress, setLocalProgress] = useState(progress || 0);

  useEffect(() => {
    if (progress !== undefined) {
      setLocalProgress(progress);
    }
  }, [progress]);

  useEffect(() => {
    if (isVisible && duration && onComplete) {
      const timer = setTimeout(onComplete, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onComplete]);

  useEffect(() => {
    if (status === "denied" && onDenied) {
      const timer = setTimeout(onDenied, 3000); // Show denial for 3s then callback
      return () => clearTimeout(timer);
    }
  }, [status, onDenied]);

  // Scenario-based color schemes
  const scenarioColors = {
    login: {
      bg: "from-blue-600/20 to-cyan-600/20",
      border: "border-blue-500/30",
      text: "text-blue-400",
      animation: "bg-blue-500"
    },
    logout: {
      bg: "from-slate-600/20 to-gray-600/20",
      border: "border-slate-500/30",
      text: "text-slate-400",
      animation: "bg-slate-500"
    },
    schedule: {
      bg: "from-green-600/20 to-emerald-600/20",
      border: "border-green-500/30",
      text: "text-green-400",
      animation: "bg-green-500"
    },
    invoice: {
      bg: "from-purple-600/20 to-violet-600/20",
      border: "border-purple-500/30",
      text: "text-purple-400",
      animation: "bg-purple-500"
    },
    payroll: {
      bg: "from-amber-600/20 to-yellow-600/20",
      border: "border-amber-500/30",
      text: "text-amber-400",
      animation: "bg-amber-500"
    },
    email: {
      bg: "from-sky-600/20 to-blue-600/20",
      border: "border-sky-500/30",
      text: "text-sky-400",
      animation: "bg-sky-500"
    },
    analytics: {
      bg: "from-indigo-600/20 to-purple-600/20",
      border: "border-indigo-500/30",
      text: "text-indigo-400",
      animation: "bg-indigo-500"
    },
    upload: {
      bg: "from-teal-600/20 to-cyan-600/20",
      border: "border-teal-500/30",
      text: "text-teal-400",
      animation: "bg-teal-500"
    },
    general: {
      bg: "from-primary/20 to-blue-500/20",
      border: "border-primary/30",
      text: "text-primary",
      animation: "bg-primary"
    }
  };

  const statusConfig = {
    loading: {
      icon: <Loader2 className={`w-12 h-12 ${scenarioColors[scenario].text} animate-spin`} />,
    },
    success: {
      icon: <CheckCircle className="w-12 h-12 text-green-400" />,
    },
    error: {
      icon: <XCircle className="w-12 h-12 text-red-400" />,
    },
    denied: {
      icon: <Shield className="w-12 h-12 text-red-400" />,
    },
    info: {
      icon: <AlertCircle className={`w-12 h-12 ${scenarioColors[scenario].text}`} />,
    }
  };

  const colors = status === "error" || status === "denied" 
    ? { bg: "from-red-500/20 to-rose-500/20", border: "border-red-500/30", animation: "bg-red-500" }
    : status === "success"
    ? { bg: "from-green-500/20 to-emerald-500/20", border: "border-green-500/30", animation: "bg-green-500" }
    : scenarioColors[scenario];

  const config = statusConfig[status];

  // Render appropriate animation
  const renderAnimation = () => {
    const animColor = colors.animation;
    switch (animationType) {
      case "spinner":
        return <SpinnerAnimation color={animColor} />;
      case "waves":
        return <WavesAnimation color={animColor} />;
      case "dots":
        return <DotsAnimation color={animColor} />;
      case "pulse":
        return <PulseAnimation color={animColor} />;
      case "gradient":
        return <GradientAnimation />;
      case "orbit":
        return <OrbitAnimation color={animColor} />;
      case "skeleton":
        return <SkeletonAnimation />;
      case "ripple":
        return <RippleAnimation color={animColor} />;
      case "bounce":
        return <BounceAnimation color={animColor} />;
      case "progress-bar":
        return <ProgressBarAnimation progress={localProgress} color={animColor} />;
      default:
        return <SpinnerAnimation color={animColor} />;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md"
          data-testid="universal-loading-overlay"
        >
          {/* Animated gradient background */}
          <div className="absolute inset-0 opacity-20">
            <motion.div 
              className={`absolute top-1/4 left-1/4 w-96 h-96 ${colors.animation} rounded-full filter blur-3xl`}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            <motion.div 
              className={`absolute bottom-1/4 right-1/4 w-96 h-96 ${colors.animation} rounded-full filter blur-3xl`}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 2
              }}
            />
          </div>

          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.85, y: -20, opacity: 0 }}
            transition={{ 
              type: "spring", 
              damping: 25, 
              stiffness: 200,
              duration: 0.5
            }}
            className={`relative backdrop-blur-xl bg-gradient-to-br ${colors.bg} border ${colors.border} rounded-2xl sm:rounded-3xl p-6 sm:p-8 w-[92vw] max-w-[420px] sm:max-w-[520px] mx-auto shadow-2xl`}
          >
            {/* Logo */}
            <div className="flex justify-center mb-5">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ 
                  delay: 0.1, 
                  type: "spring",
                  damping: 20,
                  stiffness: 200
                }}
                className="flex flex-col items-center gap-2"
              >
                <AutoForceAFLogo 
                  variant="icon" 
                  size="md" 
                  animated={status === "loading"}
                />
                <div className="flex items-baseline gap-1">
                  <span className="text-xl sm:text-2xl font-black bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                    AutoForce
                  </span>
                  <span className="text-[8px] font-black text-primary align-super">™</span>
                </div>
              </motion.div>
            </div>

            {/* Message */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-center space-y-2 mb-5"
              >
                <h3 className="text-white font-bold text-base sm:text-lg leading-tight px-2 break-words">
                  {message}
                </h3>
                {submessage && (
                  <motion.p 
                    className="text-slate-300 text-xs sm:text-sm leading-relaxed px-2 break-words"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.4 }}
                  >
                    {submessage}
                  </motion.p>
                )}
              </motion.div>
            )}

            {/* Animation */}
            <div className="flex justify-center mb-5">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4, type: "spring", damping: 15 }}
              >
                {status === "loading" ? renderAnimation() : config.icon}
              </motion.div>
            </div>

            {/* Progress Bar and Percentage */}
            {(progress !== undefined || animationType === "progress-bar") && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="space-y-2"
              >
                <div className="w-full h-3 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50">
                  <motion.div
                    className={`h-full ${colors.animation} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${localProgress}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
                <div className="text-center">
                  <span className={`text-sm font-semibold ${colors.text}`}>
                    {Math.round(localProgress)}%
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
