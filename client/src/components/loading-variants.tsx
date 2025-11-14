/**
 * 6 Universal Loading Variants for AutoForce™
 * 3 Desktop + 3 Mobile variants with different animations
 * All variants show percentage (0-100%), random messages
 * Dismissal is handled by overlay controller, not variants
 */

import { motion } from "framer-motion";
import { useLoadingState } from "@/hooks/useLoadingState";
import { IsometricLoader } from "./isometric-loader";
import { Cpu, Zap, Database } from "lucide-react";

interface LoadingVariantProps {
  externalProgress?: number;
  message?: string;
}

/**
 * DESKTOP VARIANT 1: Isometric Cubes with Horizontal Progress Bar
 */
export function DesktopLoadingVariant1({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900/95 dark:via-indigo-950/95 dark:to-slate-900/95 backdrop-blur-xl px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <IsometricLoader size="lg" />
        
        <div className="w-full space-y-3">
          <div className="h-3 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-[length:200%_100%]"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #3b82f6 0%, #22d3ee 25%, #3b82f6 50%, #22d3ee 75%, #3b82f6 100%)',
              }}
              animate={{ backgroundPosition: ["0% 0%", "100% 0%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-3xl font-bold text-blue-600 dark:text-cyan-400" data-testid="loading-percentage-desktop-1">
              {progress}%
            </div>
            <div className="text-base text-gray-700 dark:text-white/90 font-medium" data-testid="loading-message-desktop-1">
              {displayMessage}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DESKTOP VARIANT 2: Circular Progress with Pulsing Icons
 */
export function DesktopLoadingVariant2({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  const circumference = 2 * Math.PI * 80;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 dark:from-indigo-950/95 dark:via-purple-950/95 dark:to-slate-900/95 backdrop-blur-xl px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <div className="relative w-48 h-48">
          {/* Background circle */}
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="80"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              className="text-gray-200 dark:text-slate-800"
            />
            <motion.circle
              cx="96"
              cy="96"
              r="80"
              stroke="url(#gradient)"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.3s ease" }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Cpu className="w-12 h-12 text-blue-600 dark:text-cyan-400" />
            </motion.div>
            <div className="text-3xl font-bold text-blue-600 dark:text-cyan-400 mt-2" data-testid="loading-percentage-desktop-2">
              {progress}%
            </div>
          </div>
        </div>
        
        <div className="text-center">
          <div className="text-base text-gray-700 dark:text-white/90 font-medium" data-testid="loading-message-desktop-2">
            {displayMessage}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DESKTOP VARIANT 3: Wave Animation with Floating Icons
 */
export function DesktopLoadingVariant3({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 dark:from-slate-900/95 dark:via-cyan-950/95 dark:to-teal-950/95 backdrop-blur-xl px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        {/* Floating Icons */}
        <div className="relative w-full h-32">
          <motion.div
            className="absolute left-1/4"
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Zap className="w-12 h-12 text-blue-500" />
          </motion.div>
          <motion.div
            className="absolute left-1/2 -translate-x-1/2"
            animate={{ y: [10, -10, 10] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Database className="w-16 h-16 text-cyan-500" />
          </motion.div>
          <motion.div
            className="absolute right-1/4"
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <Cpu className="w-10 h-10 text-teal-500" />
          </motion.div>
        </div>
        
        <div className="w-full space-y-3">
          {/* Wave progress bar */}
          <div className="relative h-4 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-0 bg-[length:200%_100%]"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #3b82f6, #22d3ee, #14b8a6, #22d3ee, #3b82f6)',
              }}
              animate={{ backgroundPosition: ["0% 0%", "100% 0%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400" data-testid="loading-percentage-desktop-3">
              {progress}%
            </div>
            <div className="text-base text-gray-700 dark:text-white/90 font-medium" data-testid="loading-message-desktop-3">
              {displayMessage}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * MOBILE VARIANT 1: Compact Circular Progress
 */
export function MobileLoadingVariant1({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage, userName } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  const circumference = 2 * Math.PI * 60;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900/95 via-indigo-950/95 to-slate-900/95 backdrop-blur-xl px-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90">
            <circle cx="72" cy="72" r="60" stroke="currentColor" strokeWidth="8" fill="none" className="text-slate-800" />
            <motion.circle
              cx="72"
              cy="72"
              r="60"
              stroke="url(#mobileGradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.3s ease" }}
            />
            <defs>
              <linearGradient id="mobileGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-3xl font-bold text-blue-500" data-testid="loading-percentage-mobile-1">
              {progress}%
            </div>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <div className="text-sm text-white/70 font-medium" data-testid="loading-message-mobile-1">
            {progress < 20 ? `Welcome back, ${userName}...` : displayMessage}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * MOBILE VARIANT 2: Minimalist Horizontal Bar
 */
export function MobileLoadingVariant2({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage, userName } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900/95 via-purple-900/95 to-slate-900/95 backdrop-blur-xl px-6">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <div className="w-20 h-20 rounded-full border-4 border-transparent border-t-blue-500 border-r-cyan-500" />
        </motion.div>
        
        <div className="w-full space-y-3">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500"
              style={{ width: `${progress}%` }}
              animate={{ opacity: [0.8, 1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-2xl font-bold text-blue-400" data-testid="loading-percentage-mobile-2">
              {progress}%
            </div>
            <div className="text-sm text-white/70 font-medium" data-testid="loading-message-mobile-2">
              {progress < 20 ? `Welcome back, ${userName}...` : displayMessage}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * MOBILE VARIANT 3: Dots Animation
 */
export function MobileLoadingVariant3({ externalProgress, message }: LoadingVariantProps) {
  const { progress, message: displayMessage, userName } = useLoadingState({
    externalProgress,
    customMessage: message,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-cyan-900/95 via-teal-900/95 to-slate-900/95 backdrop-blur-xl px-6">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Animated Dots */}
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500"
              animate={{ y: [-10, 0, -10], opacity: [1, 0.5, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
        
        <div className="w-full space-y-3">
          <div className="h-3 bg-slate-800/50 rounded-full overflow-hidden border border-cyan-500/30">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-teal-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-2xl font-bold text-cyan-400" data-testid="loading-percentage-mobile-3">
              {progress}%
            </div>
            <div className="text-sm text-white/70 font-medium" data-testid="loading-message-mobile-3">
              {progress < 20 ? `Welcome back, ${userName}...` : displayMessage}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
