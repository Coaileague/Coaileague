/**
 * CODEBASE AWARENESS ENGINE
 * =========================
 * Indexes the codebase so Trinity can answer "where is X implemented?"
 * Extends SharedKnowledgeGraph with file, function, class, and component entities.
 * 
 * Part of Phase 1B: Platform Consciousness Roadmap
 */

import fs from 'fs';
import path from 'path';
import { sharedKnowledgeGraph, KnowledgeEntity, EntityType, RelationshipType } from './sharedKnowledgeGraph';
import { aiBrainService } from './aiBrainService';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export type CodeEntityType = 
  | 'file'
  | 'function'
  | 'class'
  | 'component'
  | 'endpoint'
  | 'hook'
  | 'service'
  | 'type'
  | 'interface';

export type CodeRelationshipType =
  | 'implements'
  | 'exports'
  | 'imports'
  | 'calls'
  | 'renders'
  | 'extends';

export interface CodeEntity {
  id: string;
  type: CodeEntityType;
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  description: string;
  signature?: string;
  exports?: string[];
  imports?: string[];
  dependencies?: string[];
  indexedAt: Date;
}

export interface CodeRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: CodeRelationshipType;
  filePath: string;
}

export interface CodeQueryResult {
  entities: CodeEntity[];
  answer: string;
  confidence: number;
  relevantFiles: string[];
}

export interface ScanOptions {
  rootDir: string;
  includePatterns: string[];
  excludePatterns: string[];
  maxDepth: number;
}

// ============================================================================
// CODEBASE AWARENESS SERVICE
// ============================================================================

class CodebaseAwareness {
  private static instance: CodebaseAwareness;
  
  private codeEntities: Map<string, CodeEntity> = new Map();
  private codeRelationships: Map<string, CodeRelationship> = new Map();
  private fileIndex: Map<string, Set<string>> = new Map(); // filePath -> entity IDs
  private nameIndex: Map<string, Set<string>> = new Map(); // name -> entity IDs
  
  private lastScanAt: Date | null = null;
  private scanning = false;
  
  private readonly DEFAULT_SCAN_OPTIONS: ScanOptions = {
    rootDir: process.cwd(),
    includePatterns: ['**/*.ts', '**/*.tsx'],
    excludePatterns: ['node_modules', 'dist', '.git', '.next', 'build'],
    maxDepth: 10,
  };

  static getInstance(): CodebaseAwareness {
    if (!this.instance) {
      this.instance = new CodebaseAwareness();
    }
    return this.instance;
  }

  // ============================================================================
  // CODEBASE SCANNING
  // ============================================================================

  /**
   * Scan the entire codebase and index entities
   */
  async scanCodebase(options?: Partial<ScanOptions>): Promise<{
    filesScanned: number;
    entitiesFound: number;
    duration: number;
  }> {
    if (this.scanning) {
      console.log('[CodebaseAwareness] Scan already in progress');
      return { filesScanned: 0, entitiesFound: 0, duration: 0 };
    }

    const startTime = Date.now();
    this.scanning = true;
    const opts = { ...this.DEFAULT_SCAN_OPTIONS, ...options };
    
    console.log(`[CodebaseAwareness] Starting codebase scan from ${opts.rootDir}`);
    
    try {
      // Clear previous index
      this.codeEntities.clear();
      this.codeRelationships.clear();
      this.fileIndex.clear();
      this.nameIndex.clear();
      
      const files = await this.findFiles(opts.rootDir, opts);
      let entitiesFound = 0;
      
      for (const filePath of files) {
        const entities = await this.extractEntitiesFromFile(filePath);
        entitiesFound += entities.length;
        
        for (const entity of entities) {
          this.codeEntities.set(entity.id, entity);
          
          // Update file index
          const fileSet = this.fileIndex.get(filePath) || new Set();
          fileSet.add(entity.id);
          this.fileIndex.set(filePath, fileSet);
          
          // Update name index
          const nameKey = entity.name.toLowerCase();
          const nameSet = this.nameIndex.get(nameKey) || new Set();
          nameSet.add(entity.id);
          this.nameIndex.set(nameKey, nameSet);
          
          // Add to SharedKnowledgeGraph for cross-service access
          this.syncToKnowledgeGraph(entity);
        }
      }
      
      // Build relationships after all entities indexed
      await this.buildRelationships();
      
      this.lastScanAt = new Date();
      const duration = Date.now() - startTime;
      
      console.log(`[CodebaseAwareness] Scan complete: ${files.length} files, ${entitiesFound} entities in ${duration}ms`);
      
      return {
        filesScanned: files.length,
        entitiesFound,
        duration,
      };
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Find all TypeScript/TSX files in the codebase
   */
  private async findFiles(dir: string, opts: ScanOptions, depth = 0): Promise<string[]> {
    if (depth > opts.maxDepth) return [];
    
    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip excluded directories
        if (opts.excludePatterns.some(pattern => entry.name === pattern || fullPath.includes(pattern))) {
          continue;
        }
        
        if (entry.isDirectory()) {
          const subFiles = await this.findFiles(fullPath, opts, depth + 1);
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[CodebaseAwareness] Error reading directory ${dir}:`, error);
    }
    
    return files;
  }

  /**
   * Extract code entities from a single file
   */
  private async extractEntitiesFromFile(filePath: string): Promise<CodeEntity[]> {
    const entities: CodeEntity[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = path.relative(process.cwd(), filePath);
      
      // Create file entity
      const fileEntity: CodeEntity = {
        id: crypto.randomUUID(),
        type: 'file',
        name: path.basename(filePath),
        filePath: relativePath,
        lineStart: 1,
        lineEnd: lines.length,
        description: `Source file: ${relativePath}`,
        exports: [],
        imports: [],
        indexedAt: new Date(),
      };
      entities.push(fileEntity);
      
      // Parse and extract entities using regex patterns
      const extractedEntities = this.parseCodeEntities(content, relativePath, lines);
      entities.push(...extractedEntities);
      
    } catch (error) {
      console.error(`[CodebaseAwareness] Error parsing file ${filePath}:`, error);
    }
    
    return entities;
  }

  /**
   * Parse code content to extract entities
   */
  private parseCodeEntities(content: string, filePath: string, lines: string[]): CodeEntity[] {
    const entities: CodeEntity[] = [];
    
    // Function patterns
    const functionPatterns = [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?:=>|:\s*\w+\s*=>)/g,
      /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g,
    ];
    
    for (const pattern of functionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        entities.push({
          id: crypto.randomUUID(),
          type: 'function',
          name: match[1],
          filePath,
          lineStart: lineNum,
          lineEnd: lineNum + 10, // Estimate
          description: `Function ${match[1]} in ${filePath}`,
          signature: match[0].substring(0, 100),
          indexedAt: new Date(),
        });
      }
    }
    
    // Class patterns
    const classPattern = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(\w+))?/g;
    let classMatch;
    while ((classMatch = classPattern.exec(content)) !== null) {
      const lineNum = this.getLineNumber(content, classMatch.index);
      entities.push({
        id: crypto.randomUUID(),
        type: 'class',
        name: classMatch[1],
        filePath,
        lineStart: lineNum,
        lineEnd: lineNum + 50, // Estimate
        description: `Class ${classMatch[1]}${classMatch[2] ? ` extends ${classMatch[2]}` : ''} in ${filePath}`,
        signature: classMatch[0],
        indexedAt: new Date(),
      });
    }
    
    // React component patterns
    const componentPatterns = [
      /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*\(/g,
      /(?:export\s+)?const\s+([A-Z]\w+)\s*(?::\s*\w+)?\s*=\s*(?:\([^)]*\)|React\.FC|FC)/g,
    ];
    
    for (const pattern of componentPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        if (!entities.some(e => e.name === match![1] && e.type === 'component')) {
          entities.push({
            id: crypto.randomUUID(),
            type: 'component',
            name: match[1],
            filePath,
            lineStart: lineNum,
            lineEnd: lineNum + 30,
            description: `React component ${match[1]} in ${filePath}`,
            signature: match[0].substring(0, 100),
            indexedAt: new Date(),
          });
        }
      }
    }
    
    // API endpoint patterns
    const endpointPatterns = [
      /app\.(get|post|put|patch|delete)\s*\(['"`]([^'"`]+)['"`]/gi,
      /router\.(get|post|put|patch|delete)\s*\(['"`]([^'"`]+)['"`]/gi,
    ];
    
    for (const pattern of endpointPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        entities.push({
          id: crypto.randomUUID(),
          type: 'endpoint',
          name: `${match[1].toUpperCase()} ${match[2]}`,
          filePath,
          lineStart: lineNum,
          lineEnd: lineNum + 20,
          description: `API endpoint ${match[1].toUpperCase()} ${match[2]} in ${filePath}`,
          signature: match[0],
          indexedAt: new Date(),
        });
      }
    }
    
    // Hook patterns (custom React hooks)
    const hookPattern = /(?:export\s+)?(?:function|const)\s+(use[A-Z]\w+)/g;
    let hookMatch;
    while ((hookMatch = hookPattern.exec(content)) !== null) {
      const lineNum = this.getLineNumber(content, hookMatch.index);
      entities.push({
        id: crypto.randomUUID(),
        type: 'hook',
        name: hookMatch[1],
        filePath,
        lineStart: lineNum,
        lineEnd: lineNum + 20,
        description: `React hook ${hookMatch[1]} in ${filePath}`,
        indexedAt: new Date(),
      });
    }
    
    // Interface/Type patterns
    const typePatterns = [
      /(?:export\s+)?interface\s+(\w+)/g,
      /(?:export\s+)?type\s+(\w+)\s*=/g,
    ];
    
    for (const pattern of typePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const lineNum = this.getLineNumber(content, match.index);
        const entityType: CodeEntityType = pattern.source.includes('interface') ? 'interface' : 'type';
        entities.push({
          id: crypto.randomUUID(),
          type: entityType,
          name: match[1],
          filePath,
          lineStart: lineNum,
          lineEnd: lineNum + 10,
          description: `${entityType === 'interface' ? 'Interface' : 'Type'} ${match[1]} in ${filePath}`,
          indexedAt: new Date(),
        });
      }
    }
    
    // Service class patterns
    const servicePattern = /class\s+(\w+Service)\s*\{/g;
    let serviceMatch: RegExpExecArray | null;
    while ((serviceMatch = servicePattern.exec(content)) !== null) {
      const lineNum = this.getLineNumber(content, serviceMatch.index);
      if (!entities.some(e => e.name === serviceMatch![1])) {
        entities.push({
          id: crypto.randomUUID(),
          type: 'service',
          name: serviceMatch[1],
          filePath,
          lineStart: lineNum,
          lineEnd: lineNum + 100,
          description: `Service class ${serviceMatch[1]} in ${filePath}`,
          indexedAt: new Date(),
        });
      }
    }
    
    return entities;
  }

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  /**
   * Build relationships between code entities
   */
  private async buildRelationships(): Promise<void> {
    // This is a simplified version - in production you'd use a proper AST parser
    console.log('[CodebaseAwareness] Building code relationships...');
    
    // For now, we build basic import relationships based on file names
    for (const [filePath, entityIds] of this.fileIndex.entries()) {
      try {
        const content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf-8');
        const importMatches = content.matchAll(/import\s+.*?from\s+['"`]([^'"`]+)['"`]/g);
        
        for (const match of importMatches) {
          const importPath = match[1];
          // Find target file entity
          const targetFile = Array.from(this.codeEntities.values()).find(
            e => e.type === 'file' && e.filePath.includes(importPath.replace(/^\.\//, ''))
          );
          
          if (targetFile) {
            const sourceFileEntity = Array.from(entityIds)
              .map(id => this.codeEntities.get(id))
              .find(e => e?.type === 'file');
            
            if (sourceFileEntity) {
              this.codeRelationships.set(crypto.randomUUID(), {
                id: crypto.randomUUID(),
                sourceId: sourceFileEntity.id,
                targetId: targetFile.id,
                type: 'imports',
                filePath,
              });
            }
          }
        }
      } catch {
        // Ignore file read errors
      }
    }
    
    console.log(`[CodebaseAwareness] Built ${this.codeRelationships.size} relationships`);
  }

  /**
   * Sync code entity to SharedKnowledgeGraph
   */
  private syncToKnowledgeGraph(entity: CodeEntity): void {
    // Map code entity type to knowledge graph entity type
    const typeMap: Record<CodeEntityType, EntityType> = {
      file: 'fact',
      function: 'procedure',
      class: 'concept',
      component: 'concept',
      endpoint: 'procedure',
      hook: 'procedure',
      service: 'concept',
      type: 'concept',
      interface: 'concept',
    };
    
    sharedKnowledgeGraph.addEntity({
      type: typeMap[entity.type] || 'fact',
      name: `[CODE] ${entity.name}`,
      description: entity.description,
      domain: 'general',
      attributes: {
        codeEntityType: entity.type,
        filePath: entity.filePath,
        lineStart: entity.lineStart,
        signature: entity.signature,
        isCodeEntity: true,
      },
      createdBy: 'codebase_awareness',
      confidence: 1.0,
    });
  }

  // ============================================================================
  // CODE QUERIES
  // ============================================================================

  /**
   * Query the codebase using natural language
   */
  async queryCode(question: string): Promise<CodeQueryResult> {
    console.log(`[CodebaseAwareness] Query: "${question}"`);
    
    // First, try keyword-based search
    const keywordResults = this.keywordSearch(question);
    
    if (keywordResults.length === 0) {
      return {
        entities: [],
        answer: "I couldn't find any code matching your query. Try being more specific or scanning the codebase first.",
        confidence: 0.2,
        relevantFiles: [],
      };
    }
    
    // Use AI to generate a natural language answer
    const answer = await this.generateAnswer(question, keywordResults);
    
    const relevantFiles = [...new Set(keywordResults.map(e => e.filePath))];
    
    return {
      entities: keywordResults.slice(0, 10),
      answer,
      confidence: Math.min(0.9, 0.5 + (keywordResults.length * 0.1)),
      relevantFiles,
    };
  }

  /**
   * Simple keyword-based search
   */
  private keywordSearch(query: string): CodeEntity[] {
    const keywords = query.toLowerCase()
      .replace(/[?.,!]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['the', 'is', 'where', 'how', 'what', 'which', 'find', 'show', 'implemented'].includes(w));
    
    const scored: Array<{ entity: CodeEntity; score: number }> = [];
    
    for (const entity of this.codeEntities.values()) {
      let score = 0;
      const nameL = entity.name.toLowerCase();
      const descL = entity.description.toLowerCase();
      const pathL = entity.filePath.toLowerCase();
      
      for (const keyword of keywords) {
        if (nameL.includes(keyword)) score += 3;
        if (nameL === keyword) score += 5;
        if (descL.includes(keyword)) score += 1;
        if (pathL.includes(keyword)) score += 2;
      }
      
      if (score > 0) {
        scored.push({ entity, score });
      }
    }
    
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20).map(s => s.entity);
  }

  /**
   * Generate natural language answer using AI
   */
  private async generateAnswer(question: string, entities: CodeEntity[]): Promise<string> {
    if (entities.length === 0) {
      return "I couldn't find any relevant code for your question.";
    }
    
    const entitySummary = entities.slice(0, 10).map(e => 
      `- ${e.type}: ${e.name} in ${e.filePath} (line ${e.lineStart})`
    ).join('\n');
    
    try {
      const response = await aiBrainService.enqueueJob({
        userId: 'system',
        workspaceId: 'system',
        skill: 'knowledge_query',
        priority: 'low',
        input: {
          query: `Answer this code question concisely based on the found code entities:

QUESTION: "${question}"

FOUND CODE ENTITIES:
${entitySummary}

Provide a helpful, conversational answer pointing to the relevant files and components.`
        },
      });
      
      return response.output?.response || response.output?.message || 'Code query processed.';
    } catch {
      // Fallback to simple answer
      const topEntity = entities[0];
      return `${topEntity.name} is implemented in ${topEntity.filePath} (starting at line ${topEntity.lineStart}). Found ${entities.length} related code entities.`;
    }
  }

  /**
   * Get entity by name
   */
  getEntityByName(name: string): CodeEntity[] {
    const nameKey = name.toLowerCase();
    const ids = this.nameIndex.get(nameKey) || new Set();
    return Array.from(ids).map(id => this.codeEntities.get(id)).filter(Boolean) as CodeEntity[];
  }

  /**
   * Get entities in a file
   */
  getEntitiesInFile(filePath: string): CodeEntity[] {
    const ids = this.fileIndex.get(filePath) || new Set();
    return Array.from(ids).map(id => this.codeEntities.get(id)).filter(Boolean) as CodeEntity[];
  }

  /**
   * Get scan status
   */
  getStatus(): {
    entityCount: number;
    relationshipCount: number;
    lastScanAt: Date | null;
    scanning: boolean;
  } {
    return {
      entityCount: this.codeEntities.size,
      relationshipCount: this.codeRelationships.size,
      lastScanAt: this.lastScanAt,
      scanning: this.scanning,
    };
  }

  /**
   * Incremental refresh for changed files
   */
  async refreshIndex(changedFiles: string[]): Promise<number> {
    let updatedCount = 0;
    
    for (const filePath of changedFiles) {
      // Remove old entities for this file
      const existingIds = this.fileIndex.get(filePath) || new Set();
      for (const id of existingIds) {
        this.codeEntities.delete(id);
      }
      this.fileIndex.delete(filePath);
      
      // Re-extract entities
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const entities = await this.extractEntitiesFromFile(fullPath);
        for (const entity of entities) {
          this.codeEntities.set(entity.id, entity);
          const fileSet = this.fileIndex.get(filePath) || new Set();
          fileSet.add(entity.id);
          this.fileIndex.set(filePath, fileSet);
          
          this.syncToKnowledgeGraph(entity);
        }
        updatedCount += entities.length;
      }
    }
    
    console.log(`[CodebaseAwareness] Refreshed ${changedFiles.length} files, ${updatedCount} entities`);
    return updatedCount;
  }
}

// Export singleton
export const codebaseAwareness = CodebaseAwareness.getInstance();
