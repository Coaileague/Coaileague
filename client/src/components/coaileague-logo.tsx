import { CoAIleagueAFLogo } from "./coaileague-af-logo";

interface CoAIleagueLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
  lightMode?: boolean;
}

/**
 * CoAIleagueLogo - Delegates to modern CoAIleagueAFLogo with AF integrated into network
 */
export function CoAIleagueLogo({ 
  variant = "nav",
  size = "md",
  animated = true,
  className,
  lightMode = false
}: CoAIleagueLogoProps) {
  return <CoAIleagueAFLogo size={size} variant={variant as any} animated={animated} className={className} />;
}

export { CoAIleagueLogo as WorkforceOSLogo };
