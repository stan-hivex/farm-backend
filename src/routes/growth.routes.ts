import { Router } from 'express';
import { getGrowthHistory } from '../controllers/growth.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.get(
  '/history',
  authenticateUser,
  getGrowthHistory
);

export default router;