import { Response } from 'express';
import Status from '../models/status.model';
import User from '../models/user.model';

// @desc    Create new status
// @route   POST /api/status
// @access  Private
export const createStatus = async (req: any, res: Response): Promise<void> => {
  const { caption, mediaType } = req.body;
  let mediaUrl = '';

  if (req.file) {
    mediaUrl = `/uploads/${req.file.filename}`;
  } else {
    res.status(400).json({ message: 'Media file is required for status' });
    return;
  }

  try {
    const status = await Status.create({
      user: req.user._id,
      mediaUrl,
      mediaType,
      caption,
    });

    const populatedStatus = await status.populate('user', 'name avatar');
    res.status(201).json(populatedStatus);
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};

// @desc    Get all active statuses from contacts (everyone for this demo)
// @route   GET /api/status
// @access  Private
export const getStatuses = async (req: any, res: Response): Promise<void> => {
  try {
    const statuses = await Status.find()
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(statuses);
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};

// @desc    Mark status as viewed
// @route   PUT /api/status/:id/view
// @access  Private
export const viewStatus = async (req: any, res: Response): Promise<void> => {
  try {
    const status = await Status.findById(req.params.id);

    if (!status) {
      res.status(404).json({ message: 'Status not found' });
      return;
    }

    if (!status.views.includes(req.user._id)) {
      status.views.push(req.user._id);
      await status.save();
    }

    res.json(status);
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
};
