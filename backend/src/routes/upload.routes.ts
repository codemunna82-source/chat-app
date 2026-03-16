import express from 'express';
import { protect } from '../middlewares/auth.middleware';
import { getPresignedUrl } from '../controllers/upload.controller';

const router = express.Router();

router.route('/presignedUrl').get(protect, getPresignedUrl);

export default router;
