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
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_model_1 = __importDefault(require("./models/user.model"));
const chat_model_1 = __importDefault(require("./models/chat.model"));
const message_model_1 = __importDefault(require("./models/message.model"));
dotenv_1.default.config();
const TERRY_AVATAR = 'https://randomuser.me/api/portraits/men/32.jpg';
const AMY_AVATAR = 'https://randomuser.me/api/portraits/women/44.jpg';
const JAKE_AVATAR = 'https://randomuser.me/api/portraits/men/90.jpg';
const seedDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-clone';
        yield mongoose_1.default.connect(mongoURI);
        console.log('MongoDB connected for seeding...\n');
        // 1. Clear existing dummy data strictly by email if needed, or clear all (using clear all for clean slate)
        console.log('Clearing existing database...');
        yield user_model_1.default.deleteMany();
        yield chat_model_1.default.deleteMany();
        yield message_model_1.default.deleteMany();
        // 2. Create Users
        console.log('Creating users...');
        const salt = yield bcrypt_1.default.genSalt(10);
        const password = yield bcrypt_1.default.hash('password123', salt);
        const users = yield user_model_1.default.insertMany([
            {
                name: 'Terry Jeffords',
                email: 'terry@test.com',
                password, // already hashed
                avatar: TERRY_AVATAR,
                about: 'Loves yogurt.',
            },
            {
                name: 'Amy Santiago',
                email: 'amy@test.com',
                password,
                avatar: AMY_AVATAR,
                about: 'Organized and ready.',
            },
            {
                name: 'Jake Peralta',
                email: 'jake@test.com',
                password,
                avatar: JAKE_AVATAR,
                about: 'Cool, cool, cool, cool, cool. No doubt, no doubt.',
            },
            {
                name: 'Ray Holt',
                email: 'ray@test.com',
                password,
                avatar: 'https://randomuser.me/api/portraits/men/82.jpg',
                about: 'I am a human male.',
            }
        ]);
        console.log(`Created ${users.length} users.`);
        const [terry, amy, jake, ray] = users;
        // 3. Create a 1-on-1 Chat
        console.log('Creating chats...');
        const chat1 = yield chat_model_1.default.create({
            chatName: 'sender',
            isGroupChat: false,
            users: [terry._id, amy._id],
        });
        const chat2 = yield chat_model_1.default.create({
            chatName: 'sender',
            isGroupChat: false,
            users: [jake._id, amy._id],
        });
        // 4. Create a Group Chat
        const groupChat = yield chat_model_1.default.create({
            chatName: 'The Nine-Nine',
            isGroupChat: true,
            users: [terry._id, amy._id, jake._id, ray._id],
            groupAdmin: ray._id,
        });
        // 5. Create Messages
        console.log('Creating messages...');
        const msg1 = yield message_model_1.default.create({
            sender: terry._id,
            content: 'Amy, did you eat my yogurt?',
            chat: chat1._id,
        });
        const msg2 = yield message_model_1.default.create({
            sender: amy._id,
            content: 'No Terry, I think it was Hitchcock.',
            chat: chat1._id,
        });
        // Link latest message to chat1
        yield chat_model_1.default.findByIdAndUpdate(chat1._id, { latestMessage: msg2._id });
        // Group chat messages
        const msg3 = yield message_model_1.default.create({
            sender: ray._id,
            content: 'Meeting in the briefing room in 5 minutes.',
            chat: groupChat._id,
        });
        const msg4 = yield message_model_1.default.create({
            sender: jake._id,
            content: 'Can we make it 10? I am eating a breakfast burrito.',
            chat: groupChat._id,
        });
        // Link latest message to group chat
        yield chat_model_1.default.findByIdAndUpdate(groupChat._id, { latestMessage: msg4._id });
        console.log('Database seeded successfully!');
        process.exit();
    }
    catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
});
seedDatabase();
