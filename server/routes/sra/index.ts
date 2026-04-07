/**
 * SRA Route Aggregator — Phase 33
 * Mounts all SRA sub-routers under /api/sra
 */

import { Router } from 'express';
import sraAuthRoutes from './sraAuthRoutes';
import sraDataRoutes from './sraDataRoutes';
import sraFindingsRoutes from './sraFindingsRoutes';
import sraTrinityRoutes from './sraTrinityRoutes';
import sraCompanyRoutes from './sraCompanyRoutes';

const router = Router();

router.use('/auth', sraAuthRoutes);
router.use('/data', sraDataRoutes);
router.use('/findings', sraFindingsRoutes);
router.use('/trinity', sraTrinityRoutes);
// Check 14: Company-side response endpoints (main CoAIleague auth, not SRA auth)
router.use('/company', sraCompanyRoutes);

export default router;
