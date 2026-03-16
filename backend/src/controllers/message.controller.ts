import { Response } from 'express';
import Message from '../models/message.model';
import User from '../models/user.model';
import Chat from '../models/chat.model';

// @desc    Get all messages
// @route   GET /api/message/:chatId
// @access  Private
export const allMessages = async (req: any, res: Response): Promise<void> => {
  try {
    // Optional pagination queries (limit and before Cursor)
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const before = req.query.before as string | undefined;

    const filter: any = { chat: req.params.chatId };
    if (before) {
      filter._id = { $lt: before };
    }

    const messages = await Message.find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .populate('sender', 'name avatar email')
      .lean();

    res.json({
      items: messages.reverse(),
      hasMore: messages.length === limit,
      cursor: messages.length ? messages[messages.length - 1]._id : null,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Create new message
// @route   POST /api/message
// @access  Private
export const sendMessage = async (req: any, res: Response): Promise<void> => {
  const { content, chatId, mediaType } = req.body;
  let mediaUrl = '';

  if (req.file) {
    mediaUrl = `/uploads/${req.file.filename}`;
  }

  if (!chatId) {
    res.status(400).json({ message: 'Invalid data passed into request' });
    return;
  }

  if (!content && !req.file) {
      res.status(400).json({ message: 'Please provide content or media' });
      return;
  }

  var newMessage = {
    sender: req.user._id,
    content: content || '',
    chat: chatId,
    mediaUrl: mediaUrl,
    mediaType: mediaType,
  };

  try {
    let messageDoc = await Message.create(newMessage);

    messageDoc = await messageDoc.populate('sender', 'name avatar');
    messageDoc = await messageDoc.populate('chat');
    messageDoc = await User.populate(messageDoc, {
      path: 'chat.users',
      select: 'name avatar email',
    }) as any;

    const chatDoc = await Chat.findById(req.body.chatId);
    if (chatDoc) {
      if (!chatDoc.unreadCounts) chatDoc.unreadCounts = new Map();
      chatDoc.users.forEach(userId => {
        if (userId.toString() !== req.user._id.toString()) {
          const currentCount = chatDoc.unreadCounts.get(userId.toString()) || 0;
          chatDoc.unreadCounts.set(userId.toString(), currentCount + 1);
        }
      });
      chatDoc.latestMessage = messageDoc._id as any;
      await chatDoc.save();
    }

    res.json(messageDoc);
  } catch (error: any) {
    console.error("Message Send Error:", error);
    res.status(500).json({ message: 'Internal Server Error while sending message', error: error.message });
  }
};

// @desc    Delete message (Mark as deleted)
// @route   DELETE /api/message/:id
// @access  Private
export const deleteMessage = async (req: any, res: Response): Promise<void> => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      res.status(401).json({ message: 'Not authorized to delete this message' });
      return;
    }

    message.content = '🚫 This message was deleted';
    message.mediaUrl = undefined;
    message.mediaType = undefined;
    await message.save();

    const io = req.app.get('io');
    if (io && message.chat) {
      io.to(message.chat.toString()).emit('message deleted', message._id);
    }

    res.json(message);
  } catch (error: any) {
    console.error("Message Delete Error:", error);
    res.status(500).json({ message: 'Failed to delete message', error: error.message });
  }
};

// @desc    Add or Remove a reaction to a message
// @route   PUT /api/message/:id/react
// @access  Private
export const toggleReaction = async (req: any, res: Response): Promise<void> => {
  try {
    const { emoji } = req.body;
    const messageId = req.params.id;
    const userId = req.user._id;

    if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
      res.status(400).json({ message: 'Emoji is required' });
      return;
    }

    const message = await Message.findById(messageId);
    if (!message) {
      res.status(404).json({ message: 'Message not found' });
      return;
    }

    if (!message.reactions) {
      message.reactions = [];
    }

    // Check if the user already reacted with this emoji
    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingIndex > -1) {
      // Remove reaction
      message.reactions.splice(existingIndex, 1);
    } else {
      // Add reaction
      message.reactions.push({ emoji, user: userId });
    }

    const updatedMessage = await message.save();

    const io = req.app.get('io');
    if (io && typeof io.to === 'function') {
      // Broadcast to the chat room
      io.to(message.chat.toString()).emit('message reacted', {
        messageId: message._id,
        reactions: message.reactions,
        userId,
        emoji,
      });
    }

    res.json(updatedMessage);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Clear all messages in a chat (keeps chat, removes history)
// @route   DELETE /api/message/chat/:chatId
// @access  Private
export const clearChatMessages = async (req: any, res: Response): Promise<void> => {
  try {
    const chatId = req.params.chatId;

    const chat = await Chat.findOne({
      _id: chatId,
      users: { $elemMatch: { $eq: req.user._id } },
    });

    if (!chat) {
      res.status(404).json({ message: 'Chat not found or you do not have permission' });
      return;
    }

    await Message.deleteMany({ chat: chatId });

    chat.latestMessage = undefined as any;
    chat.unreadCounts = new Map();
    await chat.save();

    const io = req.app.get('io');
    if (io) {
      chat.users.forEach((uId: any) => {
        io.to(uId.toString()).emit('chat cleared', chatId);
      });
    }

    res.status(200).json({ message: 'Chat cleared successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
