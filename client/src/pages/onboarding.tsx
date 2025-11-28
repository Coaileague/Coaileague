import { useParams } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { CoAIleagueLogo } from '@/components/coailleague-logo';

export default function OnboardingPage() {
  const { token } = useParams();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8 text-center">
          <div className="flex justify-center mb-6">
            <CoAIleagueLogo width={200} height={50} showTagline={false} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to CoAIleague</h1>
          <p className="text-muted-foreground mb-6">
            Complete your onboarding to get started with our platform.
          </p>
          
          <div className="space-y-4">
            <Button className="w-full" size="lg" disabled>
              <ArrowRight className="w-4 h-4 mr-2" />
              Onboarding Flow (Token: {token?.slice(0, 8)}...)
            </Button>
            <p className="text-sm text-muted-foreground">
              Onboarding system is being initialized. Please try again shortly.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
