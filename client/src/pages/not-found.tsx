import { UniversalErrorPage } from "@/components/universal-error-page";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const notFoundConfig: CanvasPageConfig = {
  id: 'not-found',
  title: 'Page Not Found',
  category: 'system',
  variant: 'centered',
  showHeader: false,
};

export default function NotFound() {
  const errorDetails = [
    `Missing Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`
  ].join('\n');

  return (
    <CanvasHubPage config={notFoundConfig}>
      <UniversalErrorPage type="404" errorDetails={errorDetails} />
    </CanvasHubPage>
  );
}
