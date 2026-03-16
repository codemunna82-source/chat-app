import { Request, Response } from 'express';
import Chat from '../models/chat.model';
import User from '../models/user.model';
import Message from '../models/message.model';

// @desc    Access or create a 1-on-1 chat
// @route   POST /api/chat
// @access  Private
export const accessChat = async (req: any, res: Response): Promise<void> => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ message: 'UserId param not sent with request' });
    return;
  }

  try {
    let isChat = await Chat.find({
      isGroupChat: false,
      $and: [
        { users: { $elemMatch: { $eq: req.user._id } } },
        { users: { $elemMatch: { $eq: userId } } },
      ],
    })
      .populate('users', '-password')
      .populate('latestMessage');

    isChat = await User.populate(isChat, {
      path: 'latestMessage.sender',
      select: 'name avatar email',
    }) as any;

    if (isChat.length > 0) {
      res.send(isChat[0]);
    } else {
      var chatData = {
        chatName: 'sender',
        isGroupChat: false,
        users: [req.user._id, userId],
      };

      const createdChat = await Chat.create(chatData);
      const FullChat = await Chat.findOne({ _id: createdChat._id }).populate(
        'users',
        '-password'
      );
      res.status(200).json(FullChat);
    }
  } catch (error: any) {
    console.error("Access Chat Error:", error);
    res.status(500).json({ message: 'Internal Server Error while accessing chat', error: error.message });
  }
};

// @desc    Fetch all chats for a user
// @route   GET /api/chat
// @access  Private
export const fetchChats = async (req: any, res: Response): Promise<void> => {
  try {
    let results = await Chat.find({ users: { $elemMatch: { $eq: req.user._id } } })
      .populate('users', '-password')
      .populate('latestMessage')
      .sort({ updatedAt: -1 });

    results = await User.populate(results, {
      path: 'latestMessage.sender',
      select: 'name avatar email',
    }) as any;

    res.status(200).send(results);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Mark chat as read
// @route   PUT /api/chat/:chatId/read
// @access  Private
export const markAsRead = async (req: any, res: Response): Promise<void> => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      res.status(404).json({ message: 'Chat not found' });
      return;
    }

    // Reset unread counts for this user
    if (!chat.unreadCounts) chat.unreadCounts = new Map();
    chat.unreadCounts.set(req.user._id.toString(), 0);
    await chat.save();

    // Mark all unread messages as read
    const updateResult = await Message.updateMany(
      { chat: req.params.chatId, sender: { $ne: req.user._id }, status: { $ne: 'read' } },
      { $set: { status: 'read' }, $addToSet: { readBy: req.user._id } }
    );

    if (updateResult.modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to(req.params.chatId).emit('messages read'); // Tell everyone in the chat room
      }
    }

    res.status(200).json(chat);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};
// @desc    Delete a chat and all its messages
// @route   DELETE /api/chat/:chatId
// @access  Private
export const deleteChat = async (req: any, res: Response): Promise<void> => {
  try {
    const chatId = req.params.chatId;
    
    // Check if chat exists and user is part of it
    const chat = await Chat.findOne({
      _id: chatId,
      users: { $elemMatch: { $eq: req.user._id } },
    });

    if (!chat) {
      res.status(404).json({ message: 'Chat not found or you do not have permission' });
      return;
    }

    // Delete all messages associated with this chat
    await Message.deleteMany({ chat: chatId });

    // Notify other users in the chat via socket (personal rooms)
    const io = req.app.get('io');
    if (io) {
      chat.users.forEach((uId: any) => {
        io.to(uId.toString()).emit('chat deleted', chatId);
      });
    }

    // Delete the chat itself
    await Chat.findByIdAndDelete(chatId);

    res.status(200).json({ message: 'Chat and messages deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
