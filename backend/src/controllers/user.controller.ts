import { Request, Response } from 'express';
import User from '../models/user.model';
import generateToken from '../config/generateToken';

// @desc    Register new user
// @route   POST /api/users
// @access  Public
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, avatar } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ message: 'Please enter all fields' });
    return;
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400).json({ message: 'User already exists' });
    return;
  }

  const user = await User.create({
    name,
    email,
    password,
    avatar: avatar || 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg',
  });

  if (user) {
    const newUserData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      about: user.about,
    };
    
    // Broadcast the new user to all connected clients
    const io = req.app.get('io');
    if (io) {
       io.emit('new user registered', newUserData);
    }

    res.status(201).json({
      ...newUserData,
      token: generateToken(user._id as any),
    });
  } else {
    res.status(400).json({ message: 'Failed to create user' });
  }
};

// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
export const authUser = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      about: user.about,
      token: generateToken(user._id as any),
    });
  } else {
    res.status(401).json({ message: 'Invalid email or password' });
  }
};

// @desc    Get all users (search)
// @route   GET /api/users
// @access  Private
export const allUsers = async (req: any, res: Response): Promise<void> => {
  const keyword = req.query.search
    ? {
        $or: [
          { name: { $regex: req.query.search, $options: 'i' } },
          { email: { $regex: req.query.search, $options: 'i' } },
        ],
      }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user._id } }).select('-password');
  res.json(users);
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = async (req: any, res: Response): Promise<void> => {
  const user = await User.findById(req.user._id);

  if (user) {
    user.name = req.body.name || user.name;
    user.about = req.body.about || user.about;
    user.avatar = req.body.avatar || user.avatar;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      avatar: updatedUser.avatar,
      about: updatedUser.about,
      token: generateToken(updatedUser._id as any),
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};
