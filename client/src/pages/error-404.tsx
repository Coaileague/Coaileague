import { UniversalErrorPage } from "@/components/universal-error-page";
import { CanvasHubPage, type CanvasPageConfig } from "@/components/canvas-hub";

const error404Config: CanvasPageConfig = {
  id: 'error-404',
  title: 'Page Not Found',
  category: 'system',
  variant: 'centered',
  showHeader: false,
};

export default function Error404() {
  const errorDetails = [
    `Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`
  ].join('\n');

  return (
    <CanvasHubPage config={error404Config}>
      <UniversalErrorPage type="404" errorDetails={errorDetails} />
    </CanvasHubPage>
  );
}
