import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface BackButtonProps {
  to?: string;
  label?: string;
  onClick?: () => void;
  variant?: "default" | "ghost" | "outline" | "secondary";
  className?: string;
}

/**
 * Reusable back button component for page navigation
 * @param to - Optional custom route to navigate to (defaults to browser history back)
 * @param label - Optional label text (defaults to "Back")
 * @param onClick - Optional custom click handler (takes precedence over navigation)
 * @param variant - Button variant (defaults to "ghost")
 * @param className - Additional CSS classes
 */
export function BackButton({ 
  to, 
  label = "Back", 
  onClick, 
  variant = "ghost",
  className = "" 
}: BackButtonProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      setLocation(to);
    } else {
      window.history.back();
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleClick}
      className={`gap-2 ${className}`}
      data-testid="button-back"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
