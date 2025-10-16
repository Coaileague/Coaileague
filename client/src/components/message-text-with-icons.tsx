/**
 * Message Text with Icons
 * Replaces staff marker (🔨) with WorkforceOS logo in any text
 */

import { StaffGavelIcon } from "./staff-gavel-icon";

interface MessageTextWithIconsProps {
  text: string;
  className?: string;
}

export function MessageTextWithIcons({ text, className = "" }: MessageTextWithIconsProps) {
  // Check if text has staff logo marker
  const hasStaffMarker = text.includes('🔨');
  
  if (!hasStaffMarker) {
    return <span className={className}>{text}</span>;
  }
  
  // Split text by staff marker and render with actual logo
  const parts = text.split('🔨');
  
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && <StaffGavelIcon className="mr-1" />}
          {part}
        </span>
      ))}
    </span>
  );
}
