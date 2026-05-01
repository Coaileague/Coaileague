/**
 * pdfResponseHeaders — single source of truth for PDF download headers.
 *
 * Every endpoint that streams a PDF (vault, pay stub, tax form, compliance
 * report, DAR, contract, proposal, form submission, etc.) should call
 * `writeHardenedPdfHeaders(res, opts)` immediately before `res.send(buffer)`
 * so we get a consistent security posture across the platform:
 *
 *   - X-Frame-Options DENY (or SAMEORIGIN for inline preview) — blocks
 *     other origins from embedding our PDF in an iframe to steal it via
 *     a clickjacking shell.
 *   - Content-Security-Policy default-src 'none'; script-src 'none'; … —
 *     PDFs may contain JavaScript; this disables script execution and
 *     blocks the PDF from making outbound requests to anything.
 *   - Referrer-Policy no-referrer — the PDF URL contains the document id;
 *     never leak it via the Referer header to outbound links rendered
 *     inside the PDF.
 *   - Cache-Control private, no-store, max-age=0 + Pragma no-cache —
 *     never let shared proxies or browser disk-cache hold a copy of a
 *     legally-sensitive document. Each download requires re-auth.
 *   - X-Content-Type-Options nosniff — browsers must trust our
 *     Content-Type and not try to render the bytes as HTML/script.
 *   - X-Permitted-Cross-Domain-Policies none — locks down legacy Adobe
 *     reader cross-domain shenanigans.
 *
 * Filename is sanitized: only [A-Za-z0-9._-] survives. Anything else is
 * replaced with `_` so the header is always valid and never lets a crafted
 * title break out into additional Content-Disposition parameters.
 */

import type { Response } from "express";

export type PdfDispositionMode = "attachment" | "inline";

export interface HardenedPdfOptions {
  /** Filename surfaced in the Content-Disposition header (will be sanitized). */
  filename: string;
  /** Byte length of the PDF buffer; sets Content-Length. */
  size: number;
  /** "attachment" forces a download; "inline" allows in-app preview embed. */
  mode?: PdfDispositionMode;
  /** Optional MIME override — defaults to application/pdf. */
  contentType?: string;
}

const SAFE_FILENAME_RE = /[^A-Za-z0-9._-]/g;

export function writeHardenedPdfHeaders(res: Response, opts: HardenedPdfOptions): void {
  const mode: PdfDispositionMode = opts.mode ?? "attachment";
  const safeName = (opts.filename || "document.pdf").replace(SAFE_FILENAME_RE, "_");

  res.setHeader("Content-Type", opts.contentType || "application/pdf");
  res.setHeader("Content-Length", String(opts.size));
  res.setHeader("Content-Disposition", `${mode}; filename="${safeName}"`);

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", mode === "inline" ? "SAMEORIGIN" : "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'self'",
  );
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
}
