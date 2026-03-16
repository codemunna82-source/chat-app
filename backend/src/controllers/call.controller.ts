import { Response } from 'express';
import CallHistory from '../models/call.model';

export const logCall = async (req: any, res: Response): Promise<void> => {
  const { receiverId, status, callType, duration } = req.body;
  try {
    const newCall = await CallHistory.create({
      caller: req.user._id,
      receiver: receiverId,
      status,
      callType,
      duration
    });
    const populatedCall = await newCall.populate('caller receiver', 'name avatar email');
    res.json(populatedCall);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const fetchCallHistory = async (req: any, res: Response): Promise<void> => {
  try {
    const calls = await CallHistory.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }]
    })
      .populate('caller receiver', 'name avatar email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(calls);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const deleteCallHistoryItem = async (req: any, res: Response): Promise<void> => {
  try {
    const call = await CallHistory.findById(req.params.id);
    if (!call) {
      res.status(404).json({ message: 'Call history item not found' });
      return;
    }

    const isParticipant =
      call.caller.toString() === req.user._id.toString() ||
      call.receiver.toString() === req.user._id.toString();

    if (!isParticipant) {
      res.status(403).json({ message: 'Not authorized to delete this call' });
      return;
    }

    await CallHistory.deleteOne({ _id: call._id });
    res.json({ message: 'Call history item deleted', id: call._id });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};

export const clearCallHistory = async (req: any, res: Response): Promise<void> => {
  try {
    const result = await CallHistory.deleteMany({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }]
    });
    res.json({ message: 'Call history cleared', deletedCount: result.deletedCount });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
};
