/**
 * Isometric 3D Loading Animation
 * Tech-themed isometric cube animation for AutoForce™
 * Based on CSS transform isometric projection
 */

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface IsometricLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function IsometricLoader({ size = "md", className = "" }: IsometricLoaderProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 5));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Size configuration
  const sizeConfig = {
    sm: { cube: 50, container: 100 },
    md: { cube: 80, container: 160 },
    lg: { cube: 120, container: 240 },
  };

  const config = sizeConfig[size];

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: config.container, height: config.container }}>
      {/* Outer Cube */}
      <div className="absolute" style={{ width: config.cube, height: config.cube }}>
        {/* Top face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube,
            height: config.cube,
            transform: `rotateZ(60deg) skewX(-30deg) translateX(-50%)`,
            background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
          }}
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        
        {/* Left face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube,
            height: config.cube,
            transform: `rotateZ(-60deg) skewX(-30deg) translateY(-100%)`,
            background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
          }}
          animate={{
            opacity: [0.8, 0.4, 0.8],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.4,
          }}
        />
        
        {/* Right face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube,
            height: config.cube,
            transform: `translateX(100%) rotateZ(-60deg) skewX(-30deg)`,
            background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
          }}
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8,
          }}
        />
      </div>

      {/* Inner Cube (Smaller, Rotated) */}
      <div 
        className="absolute" 
        style={{ 
          width: config.cube * 0.6, 
          height: config.cube * 0.6,
          transform: 'rotate(180deg)',
        }}
      >
        {/* Top face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube * 0.6,
            height: config.cube * 0.6,
            transform: `rotateZ(60deg) skewX(-30deg) translateX(-50%)`,
            background: "linear-gradient(135deg, #22d3ee 0%, #67e8f9 100%)",
          }}
          animate={{
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.2,
          }}
        />
        
        {/* Left face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube * 0.6,
            height: config.cube * 0.6,
            transform: `rotateZ(-60deg) skewX(-30deg) translateY(-100%)`,
            background: "linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)",
          }}
          animate={{
            opacity: [1, 0.6, 1],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.6,
          }}
        />
        
        {/* Right face */}
        <motion.div
          className="absolute origin-top-left"
          style={{
            width: config.cube * 0.6,
            height: config.cube * 0.6,
            transform: `translateX(100%) rotateZ(-60deg) skewX(-30deg)`,
            background: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
          }}
          animate={{
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1.0,
          }}
        />
      </div>
    </div>
  );
}
