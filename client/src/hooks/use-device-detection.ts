import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function useDeviceDetection(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>(() => {
    // Initial detection on mount
    if (typeof window === 'undefined') return 'desktop';
    return getDeviceType();
  });

  useEffect(() => {
    const handleResize = () => {
      setDeviceType(getDeviceType());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return deviceType;
}

function getDeviceType(): DeviceType {
  const width = window.innerWidth;
  
  // Mobile: 0-767px
  if (width < 768) return 'mobile';
  
  // Tablet: 768-1023px
  if (width < 1024) return 'tablet';
  
  // Desktop: 1024px+
  return 'desktop';
}

export function isMobileDevice(): boolean {
  return getDeviceType() === 'mobile';
}

export function isDesktopDevice(): boolean {
  return getDeviceType() === 'desktop';
}
