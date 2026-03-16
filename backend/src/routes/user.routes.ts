import express from 'express';
import { registerUser, authUser, allUsers, updateProfile } from '../controllers/user.controller';
import { protect } from '../middlewares/auth.middleware';

const router = express.Router();

router.route('/').post(registerUser).get(protect, allUsers);
router.post('/login', authUser);
router.put('/profile', protect, updateProfile);

export default router;
