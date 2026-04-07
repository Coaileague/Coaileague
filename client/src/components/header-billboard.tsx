import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, PartyPopper, Gift, Cake, Zap, Star, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME as string) || "CoAIleague";

interface Announcement {
  id: string;
  message: string;
  type: "update" | "celebration" | "alert" | "info";
  icon?: string;
}

export function HeaderBillboard() {
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [greeting, setGreeting] = useState("Hello");
  const [isBirthday, setIsBirthday] = useState(false);

  const { data: workspace } = useQuery<{ name?: string }>({ 
    queryKey: ['/api/workspace'] 
  });

  const { data: announcements } = useQuery<Announcement[]>({ 
    queryKey: ['/api/platform/announcements'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const firstName = user?.firstName || user?.email?.split('@')[0] || 'User';
  const workspaceName = workspace?.name || "CoAIleague";

  // Update greeting based on time of day
  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) {
        setGreeting("Good morning");
      } else if (hour < 18) {
        setGreeting("Good afternoon");
      } else {
        setGreeting("Good evening");
      }
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Check if today is user's birthday
  useEffect(() => {
    const userWithBirthday = user as any;
    if (userWithBirthday?.dateOfBirth) {
      const today = new Date();
      const birthDate = new Date(userWithBirthday.dateOfBirth);
      setIsBirthday(
        today.getMonth() === birthDate.getMonth() &&
        today.getDate() === birthDate.getDate()
      );
    }
  }, [user]);

  // Build slides array
  const slides: Array<{
    id: string;
    type: "update" | "celebration" | "alert" | "info";
    content: JSX.Element;
  }> = [];

  // Birthday slide (highest priority)
  if (isBirthday) {
    slides.push({
      id: 'birthday',
      type: 'celebration' as const,
      content: (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Cake className="h-5 w-5 text-cyan-300 animate-bounce" />
            <PartyPopper className="h-3 w-3 text-blue-400 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <span className="font-bold bg-gradient-to-r from-cyan-300 via-blue-300 to-teal-300 bg-clip-text text-transparent">
            Happy Birthday, {firstName}!
          </span>
          <Gift className="h-4 w-4 text-primary animate-pulse" />
        </div>
      ),
    });
  }

  // Announcements
  if (announcements && announcements.length > 0) {
    announcements.forEach((announcement) => {
      const Icon = announcement.type === 'celebration' ? PartyPopper :
                   announcement.type === 'alert' ? Zap :
                   announcement.type === 'update' ? TrendingUp :
                   Star;
      
      slides.push({
        id: announcement.id,
        type: announcement.type,
        content: (
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${
              announcement.type === 'celebration' ? 'text-pink-400 animate-bounce' :
              announcement.type === 'alert' ? 'text-yellow-400 animate-pulse' :
              announcement.type === 'update' ? 'text-primary' :
              'text-blue-400'
            }`} />
            <span className="text-sm font-medium">{announcement.message}</span>
          </div>
        ),
      });
    });
  }

  // Default greeting slide
  slides.push({
    id: 'greeting',
    type: 'info' as const,
    content: (
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">{greeting}, {firstName}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{workspaceName}</span>
        </div>
      </div>
    ),
  });

  // Auto-rotate slides
  useEffect(() => {
    if (slides.length > 1) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, isBirthday ? 3000 : 5000); // Faster rotation on birthday
      return () => clearInterval(interval);
    }
  }, [slides.length, isBirthday]);

  const currentSlideData = slides[currentSlide] || slides[0];
  
  let bgClass = 'bg-gradient-to-r from-primary/10 to-emerald-500/10 border-primary/20';
  if (currentSlideData.type === 'celebration') {
    bgClass = 'bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-teal-500/10 border-cyan-500/20';
  } else if (currentSlideData.type === 'alert') {
    bgClass = 'bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border-cyan-500/20';
  } else if (currentSlideData.type === 'update') {
    bgClass = 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-blue-500/20';
  }

  return (
    <div 
      className={`relative px-4 py-2 rounded-md ${bgClass} border backdrop-blur-sm overflow-hidden`}
      data-testid="header-billboard"
    >
      {/* Birthday confetti background */}
      {isBirthday && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                background: ['#fbbf24', '#ec4899', '#8b5cf6', 'hsl(158, 34%, 32%)'][i % 4],
                left: `${Math.random() * 100}%`,
                top: -10,
              }}
              animate={{
                y: [0, 400],
                rotate: [0, 360],
                opacity: [1, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.3,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}

      {/* Content with slide animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlideData.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 flex items-center justify-center min-h-[40px]"
        >
          {currentSlideData.content}
        </motion.div>
      </AnimatePresence>

      {/* Slide indicators */}
      {slides.length > 1 && (
        <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 flex gap-1">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === currentSlide 
                  ? 'bg-primary w-4' 
                  : 'bg-muted-foreground/30'
              }`}
              data-testid={`billboard-indicator-${index}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
