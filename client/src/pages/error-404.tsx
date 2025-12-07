import { UniversalErrorPage } from "@/components/universal-error-page";

export default function Error404() {
  const errorDetails = [
    `Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`
  ].join('\n');

  return <UniversalErrorPage type="404" errorDetails={errorDetails} />;
}
