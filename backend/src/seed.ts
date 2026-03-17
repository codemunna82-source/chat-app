import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import User from './models/user.model';
import Chat from './models/chat.model';
import Message from './models/message.model';

dotenv.config();

const TERRY_AVATAR = 'https://randomuser.me/api/portraits/men/32.jpg';
const AMY_AVATAR = 'https://randomuser.me/api/portraits/women/44.jpg';
const JAKE_AVATAR = 'https://randomuser.me/api/portraits/men/90.jpg';

const seedDatabase = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in environment');
    }
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected for seeding...\n');

    // 1. Clear existing dummy data strictly by email if needed, or clear all (using clear all for clean slate)
    console.log('Clearing existing database...');
    await User.deleteMany();
    await Chat.deleteMany();
    await Message.deleteMany();

    // 2. Create Users
    console.log('Creating users...');
    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash('password123', salt);

    const users = await User.insertMany([
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
    const chat1 = await Chat.create({
      chatName: 'sender',
      isGroupChat: false,
      users: [terry._id, amy._id],
    });

    const chat2 = await Chat.create({
        chatName: 'sender',
        isGroupChat: false,
        users: [jake._id, amy._id],
    });

    // 4. Create a Group Chat
    const groupChat = await Chat.create({
      chatName: 'The Nine-Nine',
      isGroupChat: true,
      users: [terry._id, amy._id, jake._id, ray._id],
      groupAdmin: ray._id,
    });
    
    // 5. Create Messages
    console.log('Creating messages...');
    const msg1 = await Message.create({
      sender: terry._id,
      content: 'Amy, did you eat my yogurt?',
      chat: chat1._id,
    });

    const msg2 = await Message.create({
      sender: amy._id,
      content: 'No Terry, I think it was Hitchcock.',
      chat: chat1._id,
    });

    // Link latest message to chat1
    await Chat.findByIdAndUpdate(chat1._id, { latestMessage: msg2._id });

    // Group chat messages
    const msg3 = await Message.create({
        sender: ray._id,
        content: 'Meeting in the briefing room in 5 minutes.',
        chat: groupChat._id,
    });

    const msg4 = await Message.create({
        sender: jake._id,
        content: 'Can we make it 10? I am eating a breakfast burrito.',
        chat: groupChat._id,
    });

    // Link latest message to group chat
    await Chat.findByIdAndUpdate(groupChat._id, { latestMessage: msg4._id });

    console.log('Database seeded successfully!');
    process.exit();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
