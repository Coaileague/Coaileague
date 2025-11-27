import { CoAIleagueAFLogo } from "./coaileague-af-logo";

// Re-export with old name for backward compatibility
export function AnimatedCoAIleagueLogo(props: Parameters<typeof CoAIleagueAFLogo>[0]) {
  return <CoAIleagueAFLogo {...props} />;
}
