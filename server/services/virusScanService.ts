/**
 * Virus Scanning Service
 * ======================
 * CRITICAL SECURITY: Scans uploaded files for malware and viruses.
 *
 * Implementation Strategy:
 * 1. Quick local signature check for known malware patterns
 * 2. Cloud-based scanning via VirusTotal API (if configured)
 * 3. Magic byte validation to detect disguised malicious files
 * 4. Comprehensive audit logging of all scan results
 *
 * Configuration:
 * - VIRUSTOTAL_API_KEY: API key for VirusTotal cloud scanning
 * - VIRUS_SCAN_ENABLED: Set to 'true' to enable scanning (default: true)
 * - VIRUS_SCAN_MODE: 'strict' (block on any detection) or 'standard' (block on confirmed threats)
 */

import crypto from 'crypto';
import { createLogger } from '../lib/logger';
const log = createLogger('virusScanService');


// Scan result types
export type ScanStatus = 'pending' | 'scanning' | 'clean' | 'infected' | 'suspicious' | 'error';

export interface ScanResult {
  status: ScanStatus;
  threatName?: string;
  confidence: number; // 0-100
  scanDuration: number; // milliseconds
  scanMethod: 'local' | 'cloud' | 'hybrid';
  details: string;
  sha256Hash: string;
  timestamp: Date;
}

export interface ScanLogEntry {
  fileId?: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploaderId: string;
  workspaceId: string;
  scanResult: ScanResult;
  ipAddress?: string;
  userAgent?: string;
}

// Known malware signatures (SHA256 hashes of known malware samples)
// These are commonly known test signatures - EICAR test file and variants
const KNOWN_MALWARE_SIGNATURES = new Set([
  // EICAR test file - standard antivirus test signature
  '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
  // EICAR test file variants
  '44d88612fea8a8f36de82e1278abb02f', // MD5 (for reference)
]);

// Malicious file magic bytes patterns
const MALICIOUS_MAGIC_PATTERNS = [
  // PE executable trying to masquerade as other file types
  { pattern: Buffer.from([0x4d, 0x5a]), name: 'PE Executable', dangerousIn: ['image/', 'text/', 'application/pdf'] },
  // ELF binary masquerading
  { pattern: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), name: 'ELF Binary', dangerousIn: ['image/', 'text/', 'application/pdf'] },
  // Mach-O binary
  { pattern: Buffer.from([0xfe, 0xed, 0xfa, 0xce]), name: 'Mach-O Binary', dangerousIn: ['image/', 'text/', 'application/pdf'] },
  { pattern: Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), name: 'Mach-O 64-bit', dangerousIn: ['image/', 'text/', 'application/pdf'] },
  // Shell script in non-text file
  { pattern: Buffer.from('#!/bin/sh'), name: 'Shell Script', dangerousIn: ['image/', 'application/pdf'] },
  { pattern: Buffer.from('#!/bin/bash'), name: 'Bash Script', dangerousIn: ['image/', 'application/pdf'] },
];

// Dangerous embedded content patterns
const DANGEROUS_CONTENT_PATTERNS = [
  // JavaScript in non-JS files (potential XSS payloads)
  { pattern: /<script[\s>]/i, name: 'Embedded JavaScript', dangerousIn: ['image/svg+xml'] },
  // VBScript
  { pattern: /<vbscript/i, name: 'Embedded VBScript', dangerousIn: ['image/svg+xml', 'text/html'] },
  // Event handlers in SVG
  { pattern: /on(load|error|click|mouseover)=/i, name: 'SVG Event Handler', dangerousIn: ['image/svg+xml'] },
  // PHP code
  { pattern: /<\?php/i, name: 'Embedded PHP', dangerousIn: ['image/', 'application/pdf'] },
  // EICAR test string (antivirus test pattern)
  { pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/, name: 'EICAR Test File', dangerousIn: ['*'] },
];

// Valid file magic bytes for common types
const VALID_MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'image/webp': [Buffer.from('RIFF')], // WebP starts with RIFF
  'application/pdf': [Buffer.from('%PDF')],
  'application/zip': [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06])],
};

// Scan logs stored in memory for audit (should be persisted to database in production)
const scanLogs: ScanLogEntry[] = [];

/**
 * Check if virus scanning is enabled
 */
export function isVirusScanEnabled(): boolean {
  const enabled = process.env.VIRUS_SCAN_ENABLED;
  // Default to enabled for security
  return enabled !== 'false';
}

/**
 * Get scan mode (strict or standard)
 */
function getScanMode(): 'strict' | 'standard' {
  return process.env.VIRUS_SCAN_MODE === 'strict' ? 'strict' : 'standard';
}

/**
 * Calculate SHA256 hash of file buffer
 */
function calculateSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check file against known malware signatures
 */
function checkKnownSignatures(sha256Hash: string): { isKnown: boolean; threatName?: string } {
  if (KNOWN_MALWARE_SIGNATURES.has(sha256Hash)) {
    return { isKnown: true, threatName: 'Known Malware Signature' };
  }
  return { isKnown: false };
}

/**
 * Validate file magic bytes match declared MIME type
 */
function validateMagicBytes(buffer: Buffer, declaredMimeType: string): { valid: boolean; actualType?: string } {
  const validMagics = VALID_MAGIC_BYTES[declaredMimeType];

  if (!validMagics) {
    // Unknown MIME type - can't validate magic bytes
    return { valid: true };
  }

  for (const magic of validMagics) {
    if (buffer.subarray(0, magic.length).equals(magic)) {
      return { valid: true };
    }
  }

  // Try to identify actual type
  for (const [mimeType, magics] of Object.entries(VALID_MAGIC_BYTES)) {
    for (const magic of magics) {
      if (buffer.subarray(0, magic.length).equals(magic)) {
        return { valid: false, actualType: mimeType };
      }
    }
  }

  return { valid: false, actualType: 'unknown' };
}

/**
 * Check for malicious magic bytes (executables masquerading as other files)
 */
function checkMaliciousMagic(buffer: Buffer, declaredMimeType: string): { isMalicious: boolean; threatName?: string } {
  for (const pattern of MALICIOUS_MAGIC_PATTERNS) {
    if (buffer.subarray(0, pattern.pattern.length).equals(pattern.pattern)) {
      // Check if this is dangerous for the declared MIME type
      for (const dangerousMime of pattern.dangerousIn) {
        if (declaredMimeType.startsWith(dangerousMime)) {
          return {
            isMalicious: true,
            threatName: `${pattern.name} disguised as ${declaredMimeType}`
          };
        }
      }
    }
  }
  return { isMalicious: false };
}

/**
 * Check for dangerous embedded content
 */
function checkDangerousContent(buffer: Buffer, declaredMimeType: string): { isDangerous: boolean; threatName?: string } {
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 65536)); // Check first 64KB

  for (const pattern of DANGEROUS_CONTENT_PATTERNS) {
    const regex = pattern.pattern instanceof RegExp ? pattern.pattern : new RegExp(pattern.pattern);
    if (regex.test(content)) {
      // Check if dangerous for this MIME type
      for (const dangerousMime of pattern.dangerousIn) {
        if (dangerousMime === '*' || declaredMimeType.startsWith(dangerousMime)) {
          return {
            isDangerous: true,
            threatName: pattern.name
          };
        }
      }
    }
  }
  return { isDangerous: false };
}

/**
 * Cloud-based scan via VirusTotal API
 * Note: This is an async operation that may take time
 */
async function scanWithVirusTotal(buffer: Buffer, sha256Hash: string): Promise<ScanResult | null> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;

  if (!apiKey) {
    log.info('[VirusScan] VirusTotal API key not configured - skipping cloud scan');
    return null;
  }

  const startTime = Date.now();

  try {
    // First, check if file is already analyzed (by hash)
    const checkResponse = await fetch(`https://www.virustotal.com/api/v3/files/${sha256Hash}`, {
      method: 'GET',
      headers: {
        'x-apikey': apiKey,
      },
    });

    if (checkResponse.ok) {
      const data = await checkResponse.json();
      const stats = data.data?.attributes?.last_analysis_stats;

      if (stats) {
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        const total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless;

        if (malicious > 0) {
          return {
            status: 'infected',
            threatName: `Detected by ${malicious}/${total} scanners`,
            confidence: Math.min(100, (malicious / total) * 100 + 50),
            scanDuration: Date.now() - startTime,
            scanMethod: 'cloud',
            details: `VirusTotal: ${malicious} malicious, ${suspicious} suspicious detections`,
            sha256Hash,
            timestamp: new Date(),
          };
        } else if (suspicious > 0) {
          return {
            status: 'suspicious',
            threatName: `Flagged by ${suspicious}/${total} scanners`,
            confidence: Math.min(80, (suspicious / total) * 100 + 20),
            scanDuration: Date.now() - startTime,
            scanMethod: 'cloud',
            details: `VirusTotal: ${suspicious} suspicious detections`,
            sha256Hash,
            timestamp: new Date(),
          };
        } else {
          return {
            status: 'clean',
            confidence: 95,
            scanDuration: Date.now() - startTime,
            scanMethod: 'cloud',
            details: `VirusTotal: Clean (${total} scanners)`,
            sha256Hash,
            timestamp: new Date(),
          };
        }
      }
    } else if (checkResponse.status === 404) {
      // File not in VirusTotal database - would need to upload
      // For now, return null to indicate cloud scan inconclusive
      log.info('[VirusScan] File not in VirusTotal database');
      return null;
    }

    return null;
  } catch (error) {
    log.error('[VirusScan] VirusTotal API error:', error);
    return null;
  }
}

/**
 * Perform local signature-based scan
 */
function performLocalScan(buffer: Buffer, mimeType: string): ScanResult {
  const startTime = Date.now();
  const sha256Hash = calculateSha256(buffer);

  // Check known malware signatures
  const signatureCheck = checkKnownSignatures(sha256Hash);
  if (signatureCheck.isKnown) {
    return {
      status: 'infected',
      threatName: signatureCheck.threatName,
      confidence: 100,
      scanDuration: Date.now() - startTime,
      scanMethod: 'local',
      details: 'Matched known malware signature',
      sha256Hash,
      timestamp: new Date(),
    };
  }

  // Check for malicious magic bytes
  const magicCheck = checkMaliciousMagic(buffer, mimeType);
  if (magicCheck.isMalicious) {
    return {
      status: 'infected',
      threatName: magicCheck.threatName,
      confidence: 95,
      scanDuration: Date.now() - startTime,
      scanMethod: 'local',
      details: 'Executable disguised as non-executable file',
      sha256Hash,
      timestamp: new Date(),
    };
  }

  // Check for dangerous embedded content
  const contentCheck = checkDangerousContent(buffer, mimeType);
  if (contentCheck.isDangerous) {
    return {
      status: 'suspicious',
      threatName: contentCheck.threatName,
      confidence: 80,
      scanDuration: Date.now() - startTime,
      scanMethod: 'local',
      details: 'Potentially dangerous embedded content detected',
      sha256Hash,
      timestamp: new Date(),
    };
  }

  // Validate magic bytes match MIME type
  const magicValidation = validateMagicBytes(buffer, mimeType);
  if (!magicValidation.valid) {
    return {
      status: 'suspicious',
      threatName: 'MIME Type Mismatch',
      confidence: 60,
      scanDuration: Date.now() - startTime,
      scanMethod: 'local',
      details: `Declared as ${mimeType} but appears to be ${magicValidation.actualType}`,
      sha256Hash,
      timestamp: new Date(),
    };
  }

  return {
    status: 'clean',
    confidence: 70, // Local scan alone has lower confidence
    scanDuration: Date.now() - startTime,
    scanMethod: 'local',
    details: 'No threats detected in local scan',
    sha256Hash,
    timestamp: new Date(),
  };
}

/**
 * Main scan function - performs comprehensive virus scan
 */
export async function scanFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  options?: {
    skipCloudScan?: boolean;
    timeout?: number;
  }
): Promise<ScanResult> {
  const startTime = Date.now();

  // Always perform local scan first (fast)
  const localResult = performLocalScan(buffer, mimeType);

  // If local scan found definite threat, return immediately
  if (localResult.status === 'infected') {
    log.info(`[VirusScan] THREAT DETECTED in ${filename}: ${localResult.threatName}`);
    return localResult;
  }

  // If cloud scan requested and local scan didn't find threat
  if (!options?.skipCloudScan && process.env.VIRUSTOTAL_API_KEY) {
    try {
      const cloudResult = await Promise.race([
        scanWithVirusTotal(buffer, localResult.sha256Hash),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), options?.timeout || 10000)
        ),
      ]);

      if (cloudResult) {
        // Combine results - prefer cloud result but note hybrid method
        return {
          ...cloudResult,
          scanMethod: 'hybrid',
          scanDuration: Date.now() - startTime,
          confidence: Math.max(localResult.confidence, cloudResult.confidence),
        };
      }
    } catch (error) {
      log.error('[VirusScan] Cloud scan error:', error);
    }
  }

  // Return local result if cloud scan unavailable or inconclusive
  return {
    ...localResult,
    scanDuration: Date.now() - startTime,
  };
}

/**
 * Log scan result for audit purposes
 */
export function logScanResult(entry: ScanLogEntry): void {
  // Add to in-memory log
  scanLogs.push(entry);

  // Keep only last 10000 entries in memory
  if (scanLogs.length > 10000) {
    scanLogs.shift();
  }

  // Log to console for external log aggregation
  const logLevel = entry.scanResult.status === 'infected' ? 'error' :
                   entry.scanResult.status === 'suspicious' ? 'warn' : 'info';

  const logMessage = {
    event: 'virus_scan',
    timestamp: entry.scanResult.timestamp.toISOString(),
    filename: entry.filename,
    fileSize: entry.fileSize,
    mimeType: entry.mimeType,
    uploaderId: entry.uploaderId,
    workspaceId: entry.workspaceId,
    status: entry.scanResult.status,
    threatName: entry.scanResult.threatName,
    confidence: entry.scanResult.confidence,
    scanMethod: entry.scanResult.scanMethod,
    scanDuration: entry.scanResult.scanDuration,
    sha256Hash: entry.scanResult.sha256Hash,
    ipAddress: entry.ipAddress,
  };

  if (logLevel === 'error') {
    log.error('[SECURITY] Virus detected:', JSON.stringify(logMessage));
  } else if (logLevel === 'warn') {
    log.warn('[SECURITY] Suspicious file:', JSON.stringify(logMessage));
  } else {
    log.info('[VirusScan] Scan complete:', JSON.stringify(logMessage));
  }
}

/**
 * Get scan logs for audit
 */
export function getScanLogs(options?: {
  workspaceId?: string;
  status?: ScanStatus;
  limit?: number;
  offset?: number;
}): ScanLogEntry[] {
  let logs = [...scanLogs];

  if (options?.workspaceId) {
    logs = logs.filter(l => l.workspaceId === options.workspaceId);
  }

  if (options?.status) {
    logs = logs.filter(l => l.scanResult.status === options.status);
  }

  // Sort by timestamp descending
  logs.sort((a, b) => b.scanResult.timestamp.getTime() - a.scanResult.timestamp.getTime());

  const offset = options?.offset || 0;
  const limit = options?.limit || 100;

  return logs.slice(offset, offset + limit);
}

/**
 * Get threat statistics
 */
export function getThreatStats(workspaceId?: string): {
  total: number;
  clean: number;
  infected: number;
  suspicious: number;
  errors: number;
  last24Hours: number;
} {
  let logs = workspaceId ? scanLogs.filter(l => l.workspaceId === workspaceId) : scanLogs;
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  return {
    total: logs.length,
    clean: logs.filter(l => l.scanResult.status === 'clean').length,
    infected: logs.filter(l => l.scanResult.status === 'infected').length,
    suspicious: logs.filter(l => l.scanResult.status === 'suspicious').length,
    errors: logs.filter(l => l.scanResult.status === 'error').length,
    last24Hours: logs.filter(l => l.scanResult.timestamp.getTime() > oneDayAgo).length,
  };
}

/**
 * Validate file before scanning (size, type checks)
 */
export function validateFileForScan(
  buffer: Buffer,
  mimeType: string,
  maxSizeBytes: number = 100 * 1024 * 1024 // 100MB default
): { valid: boolean; error?: string } {
  if (buffer.length === 0) {
    return { valid: false, error: 'File is empty' };
  }

  if (buffer.length > maxSizeBytes) {
    return { valid: false, error: `File exceeds maximum size of ${maxSizeBytes / 1024 / 1024}MB` };
  }

  return { valid: true };
}
