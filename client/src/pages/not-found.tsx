import { UniversalErrorPage } from "@/components/universal-error-page";

export default function NotFound() {
  const errorDetails = [
    `Missing Route: ${window.location.pathname}`,
    `Full URL: ${window.location.href}`,
    `Referrer: ${document.referrer || 'Direct navigation'}`,
    `Timestamp: ${new Date().toISOString()}`,
    `User Agent: ${navigator.userAgent}`
  ].join('\n');

  return <UniversalErrorPage type="404" errorDetails={errorDetails} />;
}
