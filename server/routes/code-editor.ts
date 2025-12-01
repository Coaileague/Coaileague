/**
 * AI Brain Code Editor API Routes
 * 
 * Endpoints for staging, reviewing, and applying code changes
 * requested by AI Brain and HelpAI through the command console.
 */

import { Router, Request, Response } from 'express';
import { aiBrainCodeEditor, type CodeChangeRequest, type BatchChangeRequest } from '../services/ai-brain/aiBrainCodeEditor';
import { z } from 'zod';

const router = Router();

const PLATFORM_STAFF_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

function requirePlatformStaff(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const platformRole = user.platformRole || user.role;
  if (!PLATFORM_STAFF_ROLES.includes(platformRole)) {
    return res.status(403).json({ 
      error: 'Platform staff access required',
      requiredRoles: PLATFORM_STAFF_ROLES
    });
  }
  
  next();
}

const stageChangeSchema = z.object({
  filePath: z.string().min(1),
  changeType: z.enum(['create', 'modify', 'delete', 'rename']),
  proposedContent: z.string().optional(),
  newFilePath: z.string().optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  requestReason: z.string().optional(),
  conversationId: z.string().optional(),
  ticketId: z.string().optional(),
  category: z.string().optional(),
  affectedModule: z.string().optional(),
  priority: z.number().min(1).max(3).optional(),
});

const stageBatchSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  changes: z.array(stageChangeSchema),
  conversationId: z.string().optional(),
  whatsNewTitle: z.string().max(255).optional(),
  whatsNewDescription: z.string().optional(),
});

const reviewSchema = z.object({
  reviewNotes: z.string().optional(),
});

router.post('/stage', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const parsed = stageChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const user = (req as any).user;
    const requestedBy = user?.id || 'ai-brain';

    const result = await aiBrainCodeEditor.stageCodeChange(parsed.data as CodeChangeRequest, requestedBy);

    if (result.success) {
      res.json({ success: true, changeId: result.changeId, message: 'Code change staged for approval' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[CodeEditor] Error staging change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/stage-batch', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const parsed = stageBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors });
    }

    const user = (req as any).user;
    const requestedBy = user?.id || 'ai-brain';

    const result = await aiBrainCodeEditor.stageBatchChanges(parsed.data as BatchChangeRequest, requestedBy);

    if (result.success) {
      res.json({ 
        success: true, 
        batchId: result.batchId, 
        changeIds: result.changeIds,
        message: 'Batch changes staged for approval' 
      });
    } else {
      res.status(400).json({ success: false, errors: result.errors });
    }
  } catch (error) {
    console.error('[CodeEditor] Error staging batch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/pending', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const changes = await aiBrainCodeEditor.getPendingChanges();
    res.json({ success: true, changes, count: changes.length });
  } catch (error) {
    console.error('[CodeEditor] Error getting pending changes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/change/:id', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const change = await aiBrainCodeEditor.getChangeById(req.params.id);
    
    if (!change) {
      return res.status(404).json({ error: 'Change not found' });
    }

    res.json({ success: true, change });
  } catch (error) {
    console.error('[CodeEditor] Error getting change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change/:id/approve', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    const user = (req as any).user;

    const result = await aiBrainCodeEditor.approveChange(
      req.params.id,
      user.id,
      parsed.success ? parsed.data.reviewNotes : undefined
    );

    if (result.success) {
      res.json({ success: true, message: result.message, changeId: result.changeId });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    console.error('[CodeEditor] Error approving change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change/:id/reject', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    const user = (req as any).user;

    const result = await aiBrainCodeEditor.rejectChange(
      req.params.id,
      user.id,
      parsed.success ? parsed.data.reviewNotes : undefined
    );

    if (result.success) {
      res.json({ success: true, message: result.message, changeId: result.changeId });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    console.error('[CodeEditor] Error rejecting change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change/:id/apply', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const sendWhatsNew = req.body.sendWhatsNew !== false;

    const result = await aiBrainCodeEditor.applyChange(
      req.params.id,
      user.id,
      sendWhatsNew
    );

    if (result.success) {
      res.json({ 
        success: true, 
        message: result.message, 
        changeId: result.changeId,
        appliedAt: result.appliedAt
      });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    console.error('[CodeEditor] Error applying change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change/:id/rollback', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const result = await aiBrainCodeEditor.rollbackChange(req.params.id);

    if (result.success) {
      res.json({ success: true, message: result.message, changeId: result.changeId });
    } else {
      res.status(400).json({ success: false, error: result.message });
    }
  } catch (error) {
    console.error('[CodeEditor] Error rolling back change:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/file', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const result = await aiBrainCodeEditor.readFile(filePath);

    if (result.success) {
      res.json({ success: true, content: result.content, filePath });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[CodeEditor] Error reading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/files', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const directory = (req.query.directory as string) || '';
    
    const result = await aiBrainCodeEditor.listFiles(directory);

    if (result.success) {
      res.json({ success: true, files: result.files, directory });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('[CodeEditor] Error listing files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ai-request', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { instruction, targetFile, conversationId } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: 'Instruction required' });
    }

    const user = (req as any).user;

    let fileContent: string | undefined;
    if (targetFile) {
      const fileResult = await aiBrainCodeEditor.readFile(targetFile);
      if (fileResult.success) {
        fileContent = fileResult.content;
      }
    }

    const changeRequest: CodeChangeRequest = {
      filePath: targetFile || 'pending/ai-generated.ts',
      changeType: targetFile ? 'modify' : 'create',
      proposedContent: `// AI-generated code based on instruction:\n// ${instruction}\n// Original content preserved below\n${fileContent || '// New file'}`,
      title: `AI Request: ${instruction.substring(0, 50)}...`,
      description: `Requested by AI Brain via HelpAI command console.\n\nInstruction: ${instruction}`,
      requestReason: instruction,
      conversationId,
      category: 'ai-generated',
      affectedModule: 'ai-brain',
      priority: 2,
    };

    const result = await aiBrainCodeEditor.stageCodeChange(changeRequest, user?.id || 'helpai');

    res.json({
      success: true,
      message: 'AI code change request staged for approval',
      changeId: result.changeId,
      instruction,
      targetFile,
    });
  } catch (error) {
    console.error('[CodeEditor] Error processing AI request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
