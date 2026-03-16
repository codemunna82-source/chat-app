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
exports.deleteChat = exports.markAsRead = exports.fetchChats = exports.accessChat = void 0;
const chat_model_1 = __importDefault(require("../models/chat.model"));
const user_model_1 = __importDefault(require("../models/user.model"));
const message_model_1 = __importDefault(require("../models/message.model"));
// @desc    Access or create a 1-on-1 chat
// @route   POST /api/chat
// @access  Private
const accessChat = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    if (!userId) {
        res.status(400).json({ message: 'UserId param not sent with request' });
        return;
    }
    try {
        let isChat = yield chat_model_1.default.find({
            isGroupChat: false,
            $and: [
                { users: { $elemMatch: { $eq: req.user._id } } },
                { users: { $elemMatch: { $eq: userId } } },
            ],
        })
            .populate('users', '-password')
            .populate('latestMessage');
        isChat = (yield user_model_1.default.populate(isChat, {
            path: 'latestMessage.sender',
            select: 'name avatar email',
        }));
        if (isChat.length > 0) {
            res.send(isChat[0]);
        }
        else {
            var chatData = {
                chatName: 'sender',
                isGroupChat: false,
                users: [req.user._id, userId],
            };
            const createdChat = yield chat_model_1.default.create(chatData);
            const FullChat = yield chat_model_1.default.findOne({ _id: createdChat._id }).populate('users', '-password');
            res.status(200).json(FullChat);
        }
    }
    catch (error) {
        console.error("Access Chat Error:", error);
        res.status(500).json({ message: 'Internal Server Error while accessing chat', error: error.message });
    }
});
exports.accessChat = accessChat;
// @desc    Fetch all chats for a user
// @route   GET /api/chat
// @access  Private
const fetchChats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let results = yield chat_model_1.default.find({ users: { $elemMatch: { $eq: req.user._id } } })
            .populate('users', '-password')
            .populate('latestMessage')
            .sort({ updatedAt: -1 });
        results = (yield user_model_1.default.populate(results, {
            path: 'latestMessage.sender',
            select: 'name avatar email',
        }));
        res.status(200).send(results);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.fetchChats = fetchChats;
// @desc    Mark chat as read
// @route   PUT /api/chat/:chatId/read
// @access  Private
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chat = yield chat_model_1.default.findById(req.params.chatId);
        if (!chat) {
            res.status(404).json({ message: 'Chat not found' });
            return;
        }
        // Reset unread counts for this user
        if (!chat.unreadCounts)
            chat.unreadCounts = new Map();
        chat.unreadCounts.set(req.user._id.toString(), 0);
        yield chat.save();
        // Mark all unread messages as read
        const updateResult = yield message_model_1.default.updateMany({ chat: req.params.chatId, sender: { $ne: req.user._id }, status: { $ne: 'read' } }, { $set: { status: 'read' }, $addToSet: { readBy: req.user._id } });
        if (updateResult.modifiedCount > 0) {
            const io = req.app.get('io');
            if (io) {
                io.to(req.params.chatId).emit('messages read'); // Tell everyone in the chat room
            }
        }
        res.status(200).json(chat);
    }
    catch (error) {
        res.status(400).json({ message: error.message });
    }
});
exports.markAsRead = markAsRead;
// @desc    Delete a chat and all its messages
// @route   DELETE /api/chat/:chatId
// @access  Private
const deleteChat = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const chatId = req.params.chatId;
        // Check if chat exists and user is part of it
        const chat = yield chat_model_1.default.findOne({
            _id: chatId,
            users: { $elemMatch: { $eq: req.user._id } },
        });
        if (!chat) {
            res.status(404).json({ message: 'Chat not found or you do not have permission' });
            return;
        }
        // Delete all messages associated with this chat
        yield message_model_1.default.deleteMany({ chat: chatId });
        // Notify other users in the chat via socket (personal rooms)
        const io = req.app.get('io');
        if (io) {
            chat.users.forEach((uId) => {
                io.to(uId.toString()).emit('chat deleted', chatId);
            });
        }
        // Delete the chat itself
        yield chat_model_1.default.findByIdAndDelete(chatId);
        res.status(200).json({ message: 'Chat and messages deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
});
exports.deleteChat = deleteChat;
