import express from 'express';
import { protect } from '../middlewares/auth.middleware';
import {
  logCall,
  fetchCallHistory,
  deleteCallHistoryItem,
  clearCallHistory
} from '../controllers/call.controller';

const router = express.Router();

router.route('/').post(protect, logCall);
router.route('/').get(protect, fetchCallHistory);
router.route('/').delete(protect, clearCallHistory);
router.route('/:id').delete(protect, deleteCallHistoryItem);

export default router;
