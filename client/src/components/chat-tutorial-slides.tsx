/**
 * Chat Tutorial Slides - Welcome & Education
 * Shows new users how to use the chat system
 * Explains symbols, roles, and proper usage
 */

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";

interface TutorialSlide {
  title: string;
  content: string;
  image?: string;
  symbols?: Array<{ symbol: string; meaning: string }>;
}

const tutorialSlides: TutorialSlide[] = [
  {
    title: "Welcome to CoAIleague HelpDesk!",
    content: "This quick tutorial will help you understand how to use our professional support chat system effectively.",
  },
  {
    title: "Understanding User Roles",
    content: "Different users have different roles. Here's how to identify them:",
    symbols: [
      { symbol: "👑 Crown + WF Logo", meaning: "Platform Staff (Root Admin) - Highest authority" },
      { symbol: "⚡ Lightning + WF Logo", meaning: "Deputy Admin - Senior support staff" },
      { symbol: "🛡️ Shield + WF Logo", meaning: "Support Staff - Here to help you" },
      { symbol: "🤖 Robot Icon", meaning: "HelpAI AI Assistant - Automated help" },
      { symbol: "👤 User Icon", meaning: "Regular User/Customer - That's you!" },
    ]
  },
  {
    title: "How to Get Help",
    content: "Getting support is easy! Here's what to do:",
    symbols: [
      { symbol: "1️⃣", meaning: "Wait in the queue - You'll see your position" },
      { symbol: "2️⃣", meaning: "Watch for staff to greet you" },
      { symbol: "3️⃣", meaning: "Explain your issue clearly" },
      { symbol: "4️⃣", meaning: "Follow staff instructions" },
      { symbol: "5️⃣", meaning: "Say thanks when resolved!" },
    ]
  },
  {
    title: "Chat Commands & Tips 💡",
    content: "Useful commands and features:",
    symbols: [
      { symbol: "/staff", meaning: "See who's online to help" },
      { symbol: "/queue", meaning: "Check your position in line" },
      { symbol: "/help", meaning: "View all available commands" },
      { symbol: "🔔 Banner", meaning: "Watch the top banner for updates" },
      { symbol: "✨ HelpAI", meaning: "Our AI can answer quick questions" },
    ]
  },
  {
    title: "Chat Etiquette 🤝",
    content: "Please be respectful and professional:",
    symbols: [
      { symbol: "✅ Do", meaning: "Be patient and polite" },
      { symbol: "✅ Do", meaning: "Provide clear information" },
      { symbol: "✅ Do", meaning: "Follow staff guidance" },
      { symbol: "❌ Don't", meaning: "Spam or flood messages" },
      { symbol: "❌ Don't", meaning: "Share sensitive info publicly" },
      { symbol: "❌ Don't", meaning: "Argue with staff decisions" },
    ]
  },
  {
    title: "Ready to Chat! 🎉",
    content: "You're all set! Click 'Enter Chat' to join the HelpDesk and get the support you need.",
  },
];

interface ChatTutorialSlidesProps {
  open: boolean;
  onComplete: () => void;
}

export function ChatTutorialSlides({ open, onComplete }: ChatTutorialSlidesProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    if (currentSlide < tutorialSlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const slide = tutorialSlides[currentSlide];
  const isLastSlide = currentSlide === tutorialSlides.length - 1;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl">
        <div className="py-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {tutorialSlides.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? 'w-8 bg-blue-600'
                    : index < currentSlide
                    ? 'w-2 bg-blue-600'
                    : 'w-2 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Slide Content */}
          <div className="min-h-[300px] flex flex-col items-center text-center px-4">
            <h2 className="text-2xl font-bold mb-4">{slide.title}</h2>
            <p className="text-muted-foreground mb-6">{slide.content}</p>

            {/* Symbols/Meanings Grid */}
            {slide.symbols && (
              <div className="w-full max-w-lg space-y-3">
                {slide.symbols.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-left"
                  >
                    <div className="text-2xl flex-shrink-0">{item.symbol}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.meaning}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              onClick={prevSlide}
              disabled={currentSlide === 0}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            <div className="text-sm text-muted-foreground">
              {currentSlide + 1} of {tutorialSlides.length}
            </div>

            <Button
              onClick={nextSlide}
              className="gap-2"
              data-testid="button-next-slide"
            >
              {isLastSlide ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Enter Chat
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
