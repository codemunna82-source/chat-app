"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearChatMessages = exports.toggleReaction = exports.deleteMessage = exports.sendMessage = exports.allMessages = void 0;
const message_model_1 = __importDefault(require("../models/message.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const chat_model_1 = __importDefault(require("../models/chat.model"));
// @desc    Get all messages
// @route   GET /api/message/:chatId
// @access  Private
const allMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Optional pagination queries (limit and before Cursor)
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const before = req.query.before;
        const filter = { chat: req.params.chatId };
        if (before) {
            filter._id = { $lt: before };
        }
        const messages = yield message_model_1.default.find(filter)
            .sort({ _id: -1 })
            .limit(limit)
            .populate('sender', 'name avatar email')
            .lean();
        res.json({
            items: messages.reverse(),
            hasMore: messages.length === limit,
            cursor: messages.length ? messages[messages.length - 1]._id : null,
        });
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.allMessages = allMessages;
// @desc    Create new message
// @route   POST /api/message
// @access  Private
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        let messageDoc = yield message_model_1.default.create(newMessage);
        messageDoc = yield messageDoc.populate('sender', 'name avatar');
        messageDoc = yield messageDoc.populate('chat');
        messageDoc = (yield user_model_1.default.populate(messageDoc, {
            path: 'chat.users',
            select: 'name avatar email',
        }));
        const chatDoc = yield chat_model_1.default.findById(req.body.chatId);
        if (chatDoc) {
            if (!chatDoc.unreadCounts)
                chatDoc.unreadCounts = new Map();
            chatDoc.users.forEach(userId => {
                if (userId.toString() !== req.user._id.toString()) {
                    const currentCount = chatDoc.unreadCounts.get(userId.toString()) || 0;
                    chatDoc.unreadCounts.set(userId.toString(), currentCount + 1);
                }
            });
            chatDoc.latestMessage = messageDoc._id;
            yield chatDoc.save();
        }
        res.json(messageDoc);
    }
    catch (error) {
        console.error("Message Send Error:", error);
        res.status(500).json({ message: 'Internal Server Error while sending message', error: error.message });
    }
});
exports.sendMessage = sendMessage;
// @desc    Delete message (Mark as deleted)
// @route   DELETE /api/message/:id
// @access  Private
const deleteMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const message = yield message_model_1.default.findById(req.params.id);
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
        yield message.save();
        const io = req.app.get('io');
        if (io && message.chat) {
            io.to(message.chat.toString()).emit('message deleted', message._id);
        }
        res.json(message);
    }
    catch (error) {
        console.error("Message Delete Error:", error);
        res.status(500).json({ message: 'Failed to delete message', error: error.message });
    }
});
exports.deleteMessage = deleteMessage;
// @desc    Add or Remove a reaction to a message
// @route   PUT /api/message/:id/react
// @access  Private
const toggleReaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { emoji } = req.body;
        const messageId = req.params.id;
        const userId = req.user._id;
        if (!emoji || typeof emoji !== 'string' || emoji.length > 8) {
            res.status(400).json({ message: 'Emoji is required' });
            return;
        }
        const message = yield message_model_1.default.findById(messageId);
        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }
        if (!message.reactions) {
            message.reactions = [];
        }
        // Check if the user already reacted with this emoji
        const existingIndex = message.reactions.findIndex((r) => r.user.toString() === userId.toString() && r.emoji === emoji);
        if (existingIndex > -1) {
            // Remove reaction
            message.reactions.splice(existingIndex, 1);
        }
        else {
            // Add reaction
            message.reactions.push({ emoji, user: userId });
        }
        const updatedMessage = yield message.save();
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
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.toggleReaction = toggleReaction;
// @desc    Clear all messages in a chat (keeps chat, removes history)
// @route   DELETE /api/message/chat/:chatId
// @access  Private
const clearChatMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chatId = req.params.chatId;
        const chat = yield chat_model_1.default.findOne({
            _id: chatId,
            users: { $elemMatch: { $eq: req.user._id } },
        });
        if (!chat) {
            res.status(404).json({ message: 'Chat not found or you do not have permission' });
            return;
        }
        yield message_model_1.default.deleteMany({ chat: chatId });
        chat.latestMessage = undefined;
        chat.unreadCounts = new Map();
        yield chat.save();
        const io = req.app.get('io');
        if (io) {
            chat.users.forEach((uId) => {
                io.to(uId.toString()).emit('chat cleared', chatId);
            });
        }
        res.status(200).json({ message: 'Chat cleared successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.clearChatMessages = clearChatMessages;
