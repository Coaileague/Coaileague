import { AutoForceAFLogo } from "./autoforce-af-logo";

interface AutoForceLogoProps {
  variant?: "nav" | "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  animated?: boolean;
  className?: string;
  lightMode?: boolean;
}

/**
 * AutoForceLogo - Delegates to modern AutoForceAFLogo with AF integrated into network
 */
export function AutoForceLogo({ 
  variant = "nav",
  size = "md",
  animated = true,
  className,
  lightMode = false
}: AutoForceLogoProps) {
  return <AutoForceAFLogo size={size} variant={variant as any} animated={animated} className={className} />;
}

export { AutoForceLogo as WorkforceOSLogo };
