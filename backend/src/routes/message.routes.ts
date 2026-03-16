import express from 'express';
import { protect } from '../middlewares/auth.middleware';
import { sendMessage, allMessages, deleteMessage, toggleReaction, clearChatMessages } from '../controllers/message.controller';
import { upload } from '../middlewares/upload.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { z } from 'zod';

const router = express.Router();

const reactSchema = z.object({
  emoji: z.string().min(1).max(8),
});

router.route('/:chatId').get(protect, allMessages);
router.route('/chat/:chatId').delete(protect, clearChatMessages);
router.route('/:id').delete(protect, deleteMessage);
router.route('/:id/react').put(protect, validateBody(reactSchema), toggleReaction);
router.route('/').post(protect, upload.single('media'), sendMessage);

export default router;
