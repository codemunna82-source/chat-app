import express from 'express';
import { protect } from '../middlewares/auth.middleware';
import { createStatus, getStatuses, viewStatus } from '../controllers/status.controller';
import { upload } from '../middlewares/upload.middleware';

const router = express.Router();

router.route('/').get(protect, getStatuses);
router.route('/').post(protect, upload.single('media'), createStatus);
router.route('/:id/view').put(protect, viewStatus);

export default router;
