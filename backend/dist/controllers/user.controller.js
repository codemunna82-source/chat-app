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
exports.updateProfile = exports.allUsers = exports.authUser = exports.registerUser = void 0;
const user_model_1 = __importDefault(require("../models/user.model"));
const generateToken_1 = __importDefault(require("../config/generateToken"));
// @desc    Register new user
// @route   POST /api/users
// @access  Public
const registerUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { name, email, password, avatar } = req.body;
    if (!name || !email || !password) {
        res.status(400).json({ message: 'Please enter all fields' });
        return;
    }
    const userExists = yield user_model_1.default.findOne({ email });
    if (userExists) {
        res.status(400).json({ message: 'User already exists' });
        return;
    }
    const user = yield user_model_1.default.create({
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
        res.status(201).json(Object.assign(Object.assign({}, newUserData), { token: (0, generateToken_1.default)(user._id) }));
    }
    else {
        res.status(400).json({ message: 'Failed to create user' });
    }
});
exports.registerUser = registerUser;
// @desc    Auth user & get token
// @route   POST /api/users/login
// @access  Public
const authUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password } = req.body;
    const user = yield user_model_1.default.findOne({ email });
    if (user && (yield user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
            about: user.about,
            token: (0, generateToken_1.default)(user._id),
        });
    }
    else {
        res.status(401).json({ message: 'Invalid email or password' });
    }
});
exports.authUser = authUser;
// @desc    Get all users (search)
// @route   GET /api/users
// @access  Private
const allUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const keyword = req.query.search
        ? {
            $or: [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } },
            ],
        }
        : {};
    const users = yield user_model_1.default.find(keyword).find({ _id: { $ne: req.user._id } }).select('-password');
    res.json(users);
});
exports.allUsers = allUsers;
// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.default.findById(req.user._id);
    if (user) {
        user.name = req.body.name || user.name;
        user.about = req.body.about || user.about;
        user.avatar = req.body.avatar || user.avatar;
        if (req.body.password) {
            user.password = req.body.password;
        }
        const updatedUser = yield user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            avatar: updatedUser.avatar,
            about: updatedUser.about,
            token: (0, generateToken_1.default)(updatedUser._id),
        });
    }
    else {
        res.status(404).json({ message: 'User not found' });
    }
});
exports.updateProfile = updateProfile;
