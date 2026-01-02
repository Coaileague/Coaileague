import { type ReactNode } from 'react';
import { useSimpleMode } from '@/contexts/SimpleModeContext';

interface SimpleModeProps {
  children: ReactNode;
  simple?: ReactNode;
}

export function SimpleMode({ children, simple }: SimpleModeProps) {
  const { isSimpleMode } = useSimpleMode();
  
  if (isSimpleMode && simple !== undefined) {
    return <>{simple}</>;
  }
  
  return <>{children}</>;
}

export function HideInSimpleMode({ children }: { children: ReactNode }) {
  const { isSimpleMode } = useSimpleMode();
  
  if (isSimpleMode) {
    return null;
  }
  
  return <>{children}</>;
}

export function ShowInSimpleMode({ children }: { children: ReactNode }) {
  const { isSimpleMode } = useSimpleMode();
  
  if (!isSimpleMode) {
    return null;
  }
  
  return <>{children}</>;
}
