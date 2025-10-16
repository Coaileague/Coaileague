/**
 * Staff Name Display Component
 * Replaces staff marker (🔨) with WorkforceOS logo
 */

import { StaffGavelIcon } from "./staff-gavel-icon";

interface StaffNameDisplayProps {
  name: string;
  className?: string;
}

export function StaffNameDisplay({ name, className = "" }: StaffNameDisplayProps) {
  // Check if name has staff logo marker
  const hasStaffMarker = name.includes('🔨');
  
  if (!hasStaffMarker) {
    return <span className={className}>{name}</span>;
  }
  
  // Replace 🔨 marker with WorkforceOS logo
  const cleanName = name.replace('🔨 ', '').trim();
  
  return (
    <span className={className}>
      <StaffGavelIcon className="mr-1" />
      {cleanName}
    </span>
  );
}
