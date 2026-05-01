/**
 * AI Brain File System Tools Service
 * 
 * Provides comprehensive file system access for AI Brain:
 * - Read files with line range support
 * - Write/Create files with validation
 * - Edit files with search/replace
 * - Delete files with confirmation
 * - List directories with filtering
 * - Search across files with regex
 * - Diff generation between files
 * - File metadata retrieval
 * 
 * Security: Protected paths, allowed extensions, path traversal prevention
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '../../../db';
import { systemAuditLogs } from '@shared/schema';
import { createLogger } from '../../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../../billing/billingConstants';
const log = createLogger('aiBrainFileSystemTools');

const WORKSPACE_ROOT = process.cwd();

const ALLOWED_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.scss', 
  '.html', '.md', '.txt', '.sql', '.yaml', '.yml', '.env.example'
];

const PROTECTED_PATHS = [
  'node_modules', '.git', 'dist', 'build', '.env', 
  'package-lock.json', '.replit', '.config'
];

const READ_ONLY_PATHS = [
  'shared/schema.ts', 'drizzle.config.ts', 'package.json',
  'tsconfig.json', 'vite.config.ts'
];

export interface FileReadOptions {
  startLine?: number;
  endLine?: number;
  encoding?: BufferEncoding;
}

export interface FileWriteOptions {
  createDirectories?: boolean;
  backup?: boolean;
}

export interface FileSearchOptions {
  pattern: string;
  filePattern?: string;
  caseSensitive?: boolean;
  maxResults?: number;
  includeLineNumbers?: boolean;
}

export interface FileListOptions {
  recursive?: boolean;
  maxDepth?: number;
  includeHidden?: boolean;
  filePattern?: string;
  excludePatterns?: string[];
}

export interface FileSystemResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  path?: string;
  metadata?: {
    size?: number;
    modified?: Date;
    created?: Date;
    isDirectory?: boolean;
    lineCount?: number;
  };
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  content: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  extension?: string;
}

class AIBrainFileSystemTools {
  private static instance: AIBrainFileSystemTools;

  static getInstance(): AIBrainFileSystemTools {
    if (!this.instance) {
      this.instance = new AIBrainFileSystemTools();
    }
    return this.instance;
  }

  private validatePath(filePath: string): { valid: boolean; error?: string; isReadOnly?: boolean } {
    if (path.isAbsolute(filePath)) {
      return { valid: false, error: 'Absolute paths are not allowed' };
    }
    
    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');
    
    if (normalizedPath.includes('..')) {
      return { valid: false, error: 'Path traversal not allowed' };
    }
    
    if (normalizedPath.startsWith('/') || normalizedPath.startsWith('\\')) {
      return { valid: false, error: 'Paths starting with / or \\ are not allowed' };
    }

    const resolvedPath = path.resolve(WORKSPACE_ROOT, normalizedPath);
    if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
      return { valid: false, error: 'Path escapes workspace root' };
    }

    for (const protectedPath of PROTECTED_PATHS) {
      if (normalizedPath.includes(protectedPath)) {
        return { valid: false, error: `Cannot access protected path: ${protectedPath}` };
      }
    }

    const isReadOnly = READ_ONLY_PATHS.some(p => normalizedPath.endsWith(p));
    return { valid: true, isReadOnly };
  }

  private validateExtension(filePath: string, forWrite: boolean = false): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) {
      return !forWrite;
    }
    return ALLOWED_EXTENSIONS.includes(ext);
  }

  private getFullPath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new Error('Absolute paths are not allowed');
    }
    
    const normalized = path.normalize(relativePath).replace(/\\/g, '/');
    if (normalized.startsWith('..') || normalized.startsWith('/')) {
      throw new Error('Invalid path: must be relative to workspace');
    }
    
    const fullPath = path.resolve(WORKSPACE_ROOT, normalized);
    
    if (!fullPath.startsWith(WORKSPACE_ROOT)) {
      throw new Error('Path escapes workspace root');
    }
    
    return fullPath;
  }

  private async logAction(
    action: string, 
    filePath: string, 
    userId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId,
        action: `ai_brain_filesystem:${action}`,
        ipAddress: 'ai-brain-internal',
        metadata: { targetType: 'file', targetId: filePath,
        details: {
          ...details,
          timestamp: new Date().toISOString(),
        } },
      });
    } catch (error) {
      log.error('[AIBrainFS] Failed to log action:', error);
    }
  }

  /**
   * Read file contents with optional line range
   */
  async readFile(
    filePath: string,
    options: FileReadOptions = {},
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult<string>> {
    try {
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: filePath };
      }

      const fullPath = this.getFullPath(filePath);
      
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Path is a directory, not a file', path: filePath };
      }

      const content = await fs.readFile(fullPath, options.encoding || 'utf-8');
      const lines = content.split('\n');
      
      let resultContent = content;
      let lineCount = lines.length;

      if (options.startLine !== undefined || options.endLine !== undefined) {
        const start = Math.max(0, (options.startLine || 1) - 1);
        const end = options.endLine || lines.length;
        resultContent = lines.slice(start, end).join('\n');
        lineCount = end - start;
      }

      await this.logAction('read', filePath, userId, {
        startLine: options.startLine,
        endLine: options.endLine,
        lineCount,
      });

      return {
        success: true,
        data: resultContent,
        path: filePath,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          lineCount,
        },
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'File not found', path: filePath };
      }
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: filePath };
    }
  }

  /**
   * Write content to a file
   */
  async writeFile(
    filePath: string,
    content: string,
    options: FileWriteOptions = {},
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult> {
    try {
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: filePath };
      }
      if (validation.isReadOnly) {
        return { success: false, error: 'File is read-only and cannot be modified', path: filePath };
      }

      if (!this.validateExtension(filePath, true)) {
        return { success: false, error: 'File extension not allowed for writing', path: filePath };
      }

      const fullPath = this.getFullPath(filePath);
      const dir = path.dirname(fullPath);

      if (options.createDirectories) {
        await fs.mkdir(dir, { recursive: true });
      }

      if (options.backup) {
        try {
          const existingContent = await fs.readFile(fullPath, 'utf-8');
          const backupPath = `${fullPath}.backup.${Date.now()}`;
          await fs.writeFile(backupPath, existingContent);
        } catch {
          // File may not exist yet - backup not needed for new files
        }
      }

      await fs.writeFile(fullPath, content, 'utf-8');

      const stats = await fs.stat(fullPath);

      await this.logAction('write', filePath, userId, {
        size: stats.size,
        lineCount: content.split('\n').length,
        backup: options.backup,
      });

      return {
        success: true,
        path: filePath,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
          lineCount: content.split('\n').length,
        },
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: filePath };
    }
  }

  /**
   * Edit file with search/replace operations
   */
  async editFile(
    filePath: string,
    searchPattern: string,
    replacement: string,
    options: { all?: boolean; regex?: boolean } = {},
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult<{ matchCount: number; newContent: string }>> {
    try {
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: filePath };
      }
      if (validation.isReadOnly) {
        return { success: false, error: 'File is read-only', path: filePath };
      }
      
      if (!this.validateExtension(filePath, true)) {
        return { 
          success: false, 
          error: 'Cannot edit files without extension or with disallowed extension', 
          path: filePath 
        };
      }
      
      const readResult = await this.readFile(filePath, {}, userId);
      if (!readResult.success || !readResult.data) {
        return { success: false, error: readResult.error, path: filePath };
      }

      let content = readResult.data;
      let matchCount = 0;

      if (options.regex) {
        const regex = new RegExp(searchPattern, options.all ? 'g' : '');
        const matches = content.match(regex);
        matchCount = matches ? matches.length : 0;
        content = content.replace(regex, replacement);
      } else {
        if (options.all) {
          const escapedPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escapedPattern, 'g');
          const matches = content.match(regex);
          matchCount = matches ? matches.length : 0;
          content = content.replace(regex, replacement);
        } else {
          if (content.includes(searchPattern)) {
            matchCount = 1;
            content = content.replace(searchPattern, replacement);
          }
        }
      }

      if (matchCount === 0) {
        return { 
          success: false, 
          error: 'Pattern not found in file', 
          path: filePath,
          data: { matchCount: 0, newContent: readResult.data }
        };
      }

      const writeResult = await this.writeFile(filePath, content, { backup: true }, userId);
      if (!writeResult.success) {
        return { success: false, error: writeResult.error, path: filePath };
      }

      await this.logAction('edit', filePath, userId, {
        searchPattern,
        matchCount,
        regex: options.regex,
        all: options.all,
      });

      return {
        success: true,
        data: { matchCount, newContent: content },
        path: filePath,
        metadata: writeResult.metadata,
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: filePath };
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(
    filePath: string,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult> {
    try {
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: filePath };
      }
      if (validation.isReadOnly) {
        return { success: false, error: 'Cannot delete read-only file', path: filePath };
      }
      
      if (!this.validateExtension(filePath, true)) {
        return { 
          success: false, 
          error: 'Cannot delete files without extension or with disallowed extension', 
          path: filePath 
        };
      }

      const fullPath = this.getFullPath(filePath);
      
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Cannot delete directory with this method', path: filePath };
      }

      const backupPath = `${fullPath}.deleted.${Date.now()}`;
      await fs.rename(fullPath, backupPath);

      await this.logAction('delete', filePath, userId, {
        backupPath: backupPath.replace(WORKSPACE_ROOT, ''),
        size: stats.size,
      });

      return {
        success: true,
        path: filePath,
        metadata: {
          size: stats.size,
        },
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'File not found', path: filePath };
      }
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: filePath };
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(
    dirPath: string,
    options: FileListOptions = {},
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult<DirectoryEntry[]>> {
    try {
      const validation = this.validatePath(dirPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: dirPath };
      }

      const fullPath = this.getFullPath(dirPath);
      const entries: DirectoryEntry[] = [];

      const processDirectory = async (currentPath: string, depth: number): Promise<void> => {
        if (options.maxDepth !== undefined && depth > options.maxDepth) return;

        const items = await fs.readdir(currentPath, { withFileTypes: true });

        for (const item of items) {
          if (!options.includeHidden && item.name.startsWith('.')) continue;

          const itemPath = path.join(currentPath, item.name);
          const relativePath = itemPath.replace(WORKSPACE_ROOT + '/', '');

          const shouldExclude = options.excludePatterns?.some(pattern => 
            relativePath.includes(pattern) || item.name.includes(pattern)
          );
          if (shouldExclude) continue;

          if (options.filePattern && item.isFile()) {
            const regex = new RegExp(options.filePattern.replace(/\*/g, '.*'));
            if (!regex.test(item.name)) continue;
          }

          let stats;
          try {
            stats = await fs.stat(itemPath);
          } catch {
            // Skip entries that can't be stat'd (deleted, permission issues)
            continue;
          }

          entries.push({
            name: item.name,
            path: relativePath,
            type: item.isDirectory() ? 'directory' : 'file',
            size: item.isFile() ? stats.size : undefined,
            modified: stats.mtime,
            extension: item.isFile() ? path.extname(item.name) : undefined,
          });

          if (item.isDirectory() && options.recursive) {
            await processDirectory(itemPath, depth + 1);
          }
        }
      };

      await processDirectory(fullPath, 0);

      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      await this.logAction('list', dirPath, userId, {
        recursive: options.recursive,
        entryCount: entries.length,
      });

      return {
        success: true,
        data: entries,
        path: dirPath,
        metadata: {
          isDirectory: true,
        },
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'Directory not found', path: dirPath };
      }
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: dirPath };
    }
  }

  /**
   * Search for pattern across files
   */
  async searchFiles(
    searchPath: string,
    options: FileSearchOptions,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult<SearchMatch[]>> {
    try {
      const validation = this.validatePath(searchPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: searchPath };
      }

      const matches: SearchMatch[] = [];
      const maxResults = options.maxResults || 100;

      const listResult = await this.listDirectory(searchPath, {
        recursive: true,
        filePattern: options.filePattern || '*.ts|*.tsx|*.js|*.jsx',
        excludePatterns: ['node_modules', '.git', 'dist'],
      });

      if (!listResult.success || !listResult.data) {
        return { success: false, error: listResult.error, path: searchPath };
      }

      const files = listResult.data.filter(e => e.type === 'file');

      const searchRegex = new RegExp(
        options.pattern,
        options.caseSensitive ? 'g' : 'gi'
      );

      for (const file of files) {
        if (matches.length >= maxResults) break;

        try {
          const readResult = await this.readFile(file.path);
          if (!readResult.success || !readResult.data) continue;

          const lines = readResult.data.split('\n');
          
          for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            const line = lines[i];
            let match;
            
            searchRegex.lastIndex = 0;
            while ((match = searchRegex.exec(line)) !== null && matches.length < maxResults) {
              const result: SearchMatch = {
                file: file.path,
                line: i + 1,
                column: match.index + 1,
                content: line.trim(),
              };

              if (options.includeLineNumbers) {
                result.context = {
                  before: lines.slice(Math.max(0, i - 2), i).map(l => l.trim()),
                  after: lines.slice(i + 1, Math.min(lines.length, i + 3)).map(l => l.trim()),
                };
              }

              matches.push(result);
            }
          }
        } catch {
          // Skip files that can't be read during search
        }
      }

      await this.logAction('search', searchPath, userId, {
        pattern: options.pattern,
        matchCount: matches.length,
        filesSearched: files.length,
      });

      return {
        success: true,
        data: matches,
        path: searchPath,
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: searchPath };
    }
  }

  /**
   * Get file or directory stats
   */
  async getStats(
    filePath: string,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult> {
    try {
      const validation = this.validatePath(filePath);
      if (!validation.valid) {
        return { success: false, error: validation.error, path: filePath };
      }

      const fullPath = this.getFullPath(filePath);
      const stats = await fs.stat(fullPath);

      let lineCount: number | undefined;
      if (stats.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        lineCount = content.split('\n').length;
      }

      return {
        success: true,
        path: filePath,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          isDirectory: stats.isDirectory(),
          lineCount,
        },
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { success: false, error: 'Path not found', path: filePath };
      }
      return { success: false, error: (error instanceof Error ? error.message : String(error)), path: filePath };
    }
  }

  /**
   * Generate diff between two files or file versions
   */
  async generateDiff(
    file1: string,
    file2OrContent: string,
    isContent: boolean = false,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult<string>> {
    try {
      const read1 = await this.readFile(file1);
      if (!read1.success || !read1.data) {
        return { success: false, error: `Failed to read first file: ${read1.error}`, path: file1 };
      }

      let content2: string;
      if (isContent) {
        content2 = file2OrContent;
      } else {
        const read2 = await this.readFile(file2OrContent);
        if (!read2.success || !read2.data) {
          return { success: false, error: `Failed to read second file: ${read2.error}` };
        }
        content2 = read2.data;
      }

      const lines1 = read1.data.split('\n');
      const lines2 = content2.split('\n');

      let diff = `--- ${file1}\n+++ ${isContent ? '(proposed)' : file2OrContent}\n`;
      
      const maxLen = Math.max(lines1.length, lines2.length);
      let changeStart = -1;
      let changes: string[] = [];

      for (let i = 0; i < maxLen; i++) {
        const line1 = lines1[i];
        const line2 = lines2[i];

        if (line1 !== line2) {
          if (changeStart === -1) changeStart = i;
          if (line1 !== undefined) changes.push(`-${line1}`);
          if (line2 !== undefined) changes.push(`+${line2}`);
        } else if (changes.length > 0) {
          diff += `@@ -${changeStart + 1} +${changeStart + 1} @@\n`;
          diff += changes.join('\n') + '\n';
          changes = [];
          changeStart = -1;
        }
      }

      if (changes.length > 0) {
        diff += `@@ -${changeStart + 1} +${changeStart + 1} @@\n`;
        diff += changes.join('\n') + '\n';
      }

      await this.logAction('diff', file1, userId, {
        compareWith: isContent ? '(content)' : file2OrContent,
      });

      return {
        success: true,
        data: diff,
        path: file1,
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy a file
   */
  async copyFile(
    sourcePath: string,
    destPath: string,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult> {
    try {
      const sourceValidation = this.validatePath(sourcePath);
      if (!sourceValidation.valid) {
        return { success: false, error: sourceValidation.error, path: sourcePath };
      }

      const destValidation = this.validatePath(destPath);
      if (!destValidation.valid) {
        return { success: false, error: destValidation.error, path: destPath };
      }

      const sourceFullPath = this.getFullPath(sourcePath);
      const destFullPath = this.getFullPath(destPath);

      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      await fs.copyFile(sourceFullPath, destFullPath);

      const stats = await fs.stat(destFullPath);

      await this.logAction('copy', sourcePath, userId, {
        destination: destPath,
        size: stats.size,
      });

      return {
        success: true,
        path: destPath,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
        },
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Move/rename a file
   */
  async moveFile(
    sourcePath: string,
    destPath: string,
    userId: string = 'ai-brain'
  ): Promise<FileSystemResult> {
    try {
      const sourceValidation = this.validatePath(sourcePath);
      if (!sourceValidation.valid) {
        return { success: false, error: sourceValidation.error, path: sourcePath };
      }
      if (sourceValidation.isReadOnly) {
        return { success: false, error: 'Cannot move read-only file', path: sourcePath };
      }

      const destValidation = this.validatePath(destPath);
      if (!destValidation.valid) {
        return { success: false, error: destValidation.error, path: destPath };
      }

      const sourceFullPath = this.getFullPath(sourcePath);
      const destFullPath = this.getFullPath(destPath);

      await fs.mkdir(path.dirname(destFullPath), { recursive: true });
      await fs.rename(sourceFullPath, destFullPath);

      const stats = await fs.stat(destFullPath);

      await this.logAction('move', sourcePath, userId, {
        destination: destPath,
        size: stats.size,
      });

      return {
        success: true,
        path: destPath,
        metadata: {
          size: stats.size,
          modified: stats.mtime,
        },
      };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }
}

export const aiBrainFileSystemTools = AIBrainFileSystemTools.getInstance();
export { AIBrainFileSystemTools };
