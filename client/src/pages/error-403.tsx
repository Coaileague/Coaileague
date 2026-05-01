import { UniversalErrorPage } from "@/components/universal-error-page";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const error403Config: CanvasPageConfig = {
  id: 'error-403',
  title: 'Access Denied',
  category: 'system',
  variant: 'centered',
  showHeader: false,
};

export default function Error403() {
  const errorDetails = [
    `Restricted Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`
  ].join('\n');

  return (
    <CanvasHubPage config={error403Config}>
      <UniversalErrorPage type="403" errorDetails={errorDetails} />
    </CanvasHubPage>
  );
}
