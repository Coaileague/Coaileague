/**
 * Email Intelligence Page
 * 
 * Fortune 500-grade email client with Trinity AI integration
 * Uses Hub/Canvas architecture to prevent overlay conflicts
 */

import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";
import { EmailHubCanvas } from "@/components/email/EmailHubCanvas";
import { useIsMobile } from "@/hooks/use-mobile";

export default function EmailIntelligence() {
  const isMobile = useIsMobile();

  const pageConfig: CanvasPageConfig = {
    id: 'email-intelligence',
    title: 'Email Intelligence',
    subtitle: 'AI-powered email with Trinity insights',
    category: 'communication',
    maxWidth: 'full',
  };

  if (isMobile) {
    return (
      <div className="h-[calc(100vh-8rem)]">
        <EmailHubCanvas />
      </div>
    );
  }

  return (
    <CanvasHubPage config={pageConfig} className="h-[calc(100vh-8rem)]">
      <div className="h-full -mx-6 -mb-6">
        <EmailHubCanvas />
      </div>
    </CanvasHubPage>
  );
}
