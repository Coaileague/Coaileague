import { UniversalErrorPage } from "@/components/universal-error-page";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const error500Config: CanvasPageConfig = {
  id: 'error-500',
  title: 'Server Error',
  category: 'system',
  variant: 'centered',
  showHeader: false,
};

export default function Error500() {
  const errorDetails = [
    `Error Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`,
    '',
    'Note: This is a navigated error page. For stack traces, check GlobalErrorBoundary logs.'
  ].join('\n');

  return (
    <CanvasHubPage config={error500Config}>
      <UniversalErrorPage type="500" errorDetails={errorDetails} />
    </CanvasHubPage>
  );
}
