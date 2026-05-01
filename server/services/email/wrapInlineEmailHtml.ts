/**
 * Mobile-responsive wrapper for hand-rolled inline-HTML email templates.
 *
 * The canonical `emailLayout()` in emailTemplateBase.ts already injects a
 * mobile-friendly <style> block. Several legacy templates (Trinity greeting,
 * onboarding invitation, drop notification, weekly schedule, paystub, etc.)
 * still build their HTML inline with hard-coded 600/640px containers and
 * 32px gutters. Rewriting every one to use emailLayout would be a 1500-line
 * change. Instead this helper wraps the inline HTML with a real <html><head>
 * including a viewport meta and a mobile @media block that targets common
 * inline-style patterns (max-width:6XXpx, padding:32px, font-size:26px) and
 * collapses them to phone-friendly values.
 *
 * Use: replace `return <html string>` with `return wrapInlineEmailHtml(<html string>)`.
 */
export function wrapInlineEmailHtml(innerHtml: string, opts?: { title?: string }): string {
  const title = opts?.title || 'CoAIleague';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="format-detection" content="telephone=no">
<title>${title}</title>
<style>
  /* Body reset */
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse !important; }
  img { -ms-interpolation-mode: bicubic; max-width: 100% !important; height: auto !important; }
  /* Phone breakpoint — collapses the 600/640px boxes that legacy inline
     templates use. Targets the most common patterns (max-width: 6Xpx;,
     padding: 24-40px) so we don't have to rewrite each template body. */
  @media only screen and (max-width: 600px) {
    .cl-wrap, .cl-wrap > div, .cl-wrap table {
      max-width: 100% !important;
      width: 100% !important;
    }
    .cl-wrap div[style*="max-width:600px"],
    .cl-wrap div[style*="max-width: 600px"],
    .cl-wrap div[style*="max-width:640px"],
    .cl-wrap div[style*="max-width: 640px"],
    .cl-wrap div[style*="max-width:700px"] {
      max-width: 100% !important;
      width: 100% !important;
    }
    .cl-wrap div[style*="padding:32px"],
    .cl-wrap div[style*="padding: 32px"],
    .cl-wrap td[style*="padding:32px"],
    .cl-wrap td[style*="padding: 32px"] {
      padding: 18px 16px !important;
    }
    .cl-wrap div[style*="padding:30px"],
    .cl-wrap div[style*="padding: 30px"],
    .cl-wrap div[style*="padding:28px"],
    .cl-wrap div[style*="padding: 28px"] {
      padding: 18px 16px !important;
    }
    .cl-wrap h1[style*="font-size:26px"],
    .cl-wrap h1[style*="font-size: 26px"],
    .cl-wrap h1[style*="font-size:25px"],
    .cl-wrap h1[style*="font-size: 25px"],
    .cl-wrap h1[style*="font-size:24px"],
    .cl-wrap h1[style*="font-size: 24px"] {
      font-size: 21px !important;
      line-height: 1.3 !important;
    }
    .cl-wrap h2[style*="font-size:22px"],
    .cl-wrap h2[style*="font-size: 22px"],
    .cl-wrap h2[style*="font-size:20px"],
    .cl-wrap h2[style*="font-size: 20px"] {
      font-size: 18px !important;
    }
    /* Force tables to behave as block-level on phones so nested grids stack */
    .cl-wrap table[width="100%"] td {
      word-break: break-word !important;
    }
    /* CTA buttons that use hard-coded huge horizontal padding shrink to fit */
    .cl-wrap a[style*="padding:14px 28px"],
    .cl-wrap a[style*="padding: 14px 28px"],
    .cl-wrap a[style*="padding:14px 36px"],
    .cl-wrap a[style*="padding: 14px 36px"],
    .cl-wrap a[style*="padding:14px 38px"],
    .cl-wrap a[style*="padding: 14px 38px"] {
      display: block !important;
      padding: 14px 16px !important;
      width: auto !important;
    }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<div class="cl-wrap" style="width:100%;">
${innerHtml}
</div>
</body>
</html>`;
}
