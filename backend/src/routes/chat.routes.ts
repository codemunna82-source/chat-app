import express from 'express';
import { protect } from '../middlewares/auth.middleware';
import { accessChat, fetchChats, markAsRead, deleteChat } from '../controllers/chat.controller';

const router = express.Router();

router.route('/').post(protect, accessChat);
router.route('/').get(protect, fetchChats);
router.route('/:chatId/read').put(protect, markAsRead);
router.route('/:chatId').delete(protect, deleteChat);

export default router;
