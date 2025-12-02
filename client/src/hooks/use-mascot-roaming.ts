/**
 * useMascotRoaming - Autonomous random movement controller for the mascot
 * 
 * Features:
 * - Random destination selection with UI avoidance
 * - Smooth requestAnimationFrame-based animation
 * - Pauses during user drag, resumes after
 * - Configurable intervals and movement duration
 * - Fallback positions when no safe zones available
 */

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import MASCOT_CONFIG from '@/config/mascotConfig';
import { uiAvoidanceSystem } from '@/lib/mascot/UIAvoidanceSystem';
import { thoughtManager } from '@/lib/mascot/ThoughtManager';

interface Position {
  x: number;
  y: number;
}

interface RoamingState {
  isRoaming: boolean;
  targetPosition: Position | null;
  progress: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getRandomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomReaction(reactions: string[]): string {
  return reactions[Math.floor(Math.random() * reactions.length)];
}

const THOUGHT_COOLDOWN_MS = 10000;

export function useMascotRoaming(
  currentPosition: Position,
  setPosition: (pos: Position) => void,
  bubbleSize: number,
  isDragging: boolean,
  isExpanded: boolean
) {
  const { roaming } = MASCOT_CONFIG;
  const [state, setState] = useState<RoamingState>({
    isRoaming: false,
    targetPosition: null,
    progress: 0,
  });
  
  const roamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const startPositionRef = useRef<Position>(currentPosition);
  const animationStartTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(false);
  const lastDragStateRef = useRef<boolean>(isDragging);
  const lastThoughtTimeRef = useRef<number>(0);
  const isInitializedRef = useRef<boolean>(false);
  const currentPositionRef = useRef<Position>(currentPosition);
  
  currentPositionRef.current = currentPosition;
  
  const triggerThoughtWithCooldown = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastThoughtTimeRef.current >= THOUGHT_COOLDOWN_MS) {
      thoughtManager.triggerAIInsight(message, 'low');
      lastThoughtTimeRef.current = now;
    }
  }, []);
  
  const findSafeDestination = useCallback((): Position => {
    if (typeof window === 'undefined') return currentPositionRef.current;
    
    const padding = roaming.boundsPadding;
    const maxX = window.innerWidth - bubbleSize - padding;
    const maxY = window.innerHeight - bubbleSize - padding;
    const minPos = padding;
    
    const fallbackCorners: Position[] = [
      { x: minPos, y: minPos },
      { x: maxX, y: minPos },
      { x: minPos, y: maxY },
      { x: maxX, y: maxY },
      { x: (maxX - minPos) / 2 + minPos, y: minPos },
      { x: (maxX - minPos) / 2 + minPos, y: maxY },
    ];
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidateX = getRandomInRange(minPos, maxX);
      const candidateY = getRandomInRange(minPos, maxY);
      
      const safePos = uiAvoidanceSystem.findSafePosition(
        { x: candidateX, y: candidateY }
      );
      
      if (safePos) {
        const distance = Math.sqrt(
          Math.pow(safePos.x - currentPositionRef.current.x, 2) +
          Math.pow(safePos.y - currentPositionRef.current.y, 2)
        );
        if (distance > 50) {
          return safePos;
        }
      }
    }
    
    const randomCorner = fallbackCorners[Math.floor(Math.random() * fallbackCorners.length)];
    return randomCorner;
  }, [bubbleSize, roaming.boundsPadding]);
  
  const stopRoaming = useCallback(() => {
    isActiveRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setState({
      isRoaming: false,
      targetPosition: null,
      progress: 0,
    });
  }, []);
  
  const scheduleNextRoam = useCallback(() => {
    if (roamingTimerRef.current) {
      clearTimeout(roamingTimerRef.current);
      roamingTimerRef.current = null;
    }
    
    const delay = getRandomInRange(roaming.interval.min, roaming.interval.max);
    roamingTimerRef.current = setTimeout(() => {
      if (!lastDragStateRef.current && roaming.enabled) {
        const target = findSafeDestination();
        startPositionRef.current = { ...currentPositionRef.current };
        animationStartTimeRef.current = performance.now();
        isActiveRef.current = true;
        
        setState({
          isRoaming: true,
          targetPosition: target,
          progress: 0,
        });
        
        if (Math.random() > 0.7) {
          const reaction = getRandomReaction(roaming.reactions.startMoving);
          triggerThoughtWithCooldown(reaction);
        }
      }
    }, delay);
  }, [roaming.interval, roaming.enabled, roaming.reactions.startMoving, findSafeDestination, triggerThoughtWithCooldown]);
  
  useLayoutEffect(() => {
    if (!roaming.enabled || isInitializedRef.current) return;
    
    uiAvoidanceSystem.start();
    isInitializedRef.current = true;
    
    return () => {
      uiAvoidanceSystem.stop();
      isInitializedRef.current = false;
    };
  }, [roaming.enabled]);
  
  useEffect(() => {
    if (!roaming.enabled || !isInitializedRef.current) return;
    
    const initialDelay = getRandomInRange(5000, 10000);
    const initialTimer = setTimeout(() => {
      scheduleNextRoam();
    }, initialDelay);
    
    return () => {
      clearTimeout(initialTimer);
      if (roamingTimerRef.current) {
        clearTimeout(roamingTimerRef.current);
        roamingTimerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [roaming.enabled]);
  
  useEffect(() => {
    if (!state.isRoaming || !state.targetPosition || isDragging) return;
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - animationStartTimeRef.current;
      const progress = Math.min(elapsed / roaming.moveDuration, 1);
      const easedProgress = easeInOutCubic(progress);
      
      const newX = lerp(startPositionRef.current.x, state.targetPosition!.x, easedProgress);
      const newY = lerp(startPositionRef.current.y, state.targetPosition!.y, easedProgress);
      
      setPosition({ x: newX, y: newY });
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        if (Math.random() > 0.6) {
          const reaction = getRandomReaction(roaming.reactions.reachedDestination);
          triggerThoughtWithCooldown(reaction);
        }
        
        stopRoaming();
        scheduleNextRoam();
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.isRoaming, state.targetPosition, isDragging, roaming.moveDuration, roaming.reactions.reachedDestination, setPosition, stopRoaming, scheduleNextRoam, triggerThoughtWithCooldown]);
  
  useEffect(() => {
    const wasDragging = lastDragStateRef.current;
    const nowDragging = isDragging;
    
    if (nowDragging && !wasDragging) {
      stopRoaming();
      if (roamingTimerRef.current) {
        clearTimeout(roamingTimerRef.current);
        roamingTimerRef.current = null;
      }
      if (dragResumeTimerRef.current) {
        clearTimeout(dragResumeTimerRef.current);
        dragResumeTimerRef.current = null;
      }
    } else if (!nowDragging && wasDragging) {
      if (dragResumeTimerRef.current) {
        clearTimeout(dragResumeTimerRef.current);
      }
      dragResumeTimerRef.current = setTimeout(() => {
        scheduleNextRoam();
        dragResumeTimerRef.current = null;
      }, 2000);
    }
    
    lastDragStateRef.current = nowDragging;
  }, [isDragging, stopRoaming, scheduleNextRoam]);
  
  useEffect(() => {
    return () => {
      if (dragResumeTimerRef.current) {
        clearTimeout(dragResumeTimerRef.current);
        dragResumeTimerRef.current = null;
      }
    };
  }, []);
  
  return {
    isRoaming: state.isRoaming,
    targetPosition: state.targetPosition,
    triggerRoam: useCallback(() => {
      if (!roaming.enabled || isDragging || isActiveRef.current) return;
      
      const target = findSafeDestination();
      startPositionRef.current = { ...currentPositionRef.current };
      animationStartTimeRef.current = performance.now();
      isActiveRef.current = true;
      
      setState({
        isRoaming: true,
        targetPosition: target,
        progress: 0,
      });
    }, [roaming.enabled, isDragging, findSafeDestination]),
  };
}

export default useMascotRoaming;
