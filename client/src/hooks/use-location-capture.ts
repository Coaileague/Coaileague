import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useLocationCapture() {
  const { toast } = useToast();
  const [locationData, setLocationData] = useState<{ lat: number; lng: number } | null>(null);

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: 'Location services not available on this device', variant: 'destructive' });
      return;
    }

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { id, update } = toast({ title: 'Capturing location...' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationData({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        update({ id, title: 'Location captured' });
      },
      (error) => {
        let message = 'Could not get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied. Please enable location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location unavailable. Please check that GPS/location services are enabled on your device.';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out. Please try again or move to an area with better signal.';
            break;
        }
        update({ id, title: message, variant: 'destructive' });
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  };

  return { locationData, setLocationData, captureLocation };
}
