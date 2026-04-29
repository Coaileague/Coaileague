/**
 * ComingSoonPage — V1.1 Feature Flag
 * Shown for features that are UI-built but backend not yet wired.
 * Replace with real page when backend is implemented.
 */
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';

interface ComingSoonProps {
  feature?: string;
  returnPath?: string;
}

export default function ComingSoon({ feature = 'This feature', returnPath = '/dashboard' }: ComingSoonProps) {
  const [, setLocation] = useLocation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-3xl">🔧</span>
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold">{feature}</h2>
        <p className="text-muted-foreground">
          This feature is being finalized and will be available in the next release.
          Core platform features are fully operational.
        </p>
      </div>
      <Button onClick={() => setLocation(returnPath)} variant="outline">
        Return to Dashboard
      </Button>
    </div>
  );
}
