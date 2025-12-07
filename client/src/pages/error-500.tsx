import { UniversalErrorPage } from "@/components/universal-error-page";

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

  return <UniversalErrorPage type="500" errorDetails={errorDetails} />;
}
