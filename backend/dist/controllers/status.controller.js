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
exports.viewStatus = exports.getStatuses = exports.createStatus = void 0;
const status_model_1 = __importDefault(require("../models/status.model"));
// @desc    Create new status
// @route   POST /api/status
// @access  Private
const createStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { caption, mediaType } = req.body;
    let mediaUrl = '';
    if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
    }
    else {
        res.status(400).json({ message: 'Media file is required for status' });
        return;
    }
    try {
        const status = yield status_model_1.default.create({
            user: req.user._id,
            mediaUrl,
            mediaType,
            caption,
        });
        const populatedStatus = yield status.populate('user', 'name avatar');
        res.status(201).json(populatedStatus);
    }
    catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
exports.createStatus = createStatus;
// @desc    Get all active statuses from contacts (everyone for this demo)
// @route   GET /api/status
// @access  Private
const getStatuses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const statuses = yield status_model_1.default.find()
            .populate('user', 'name avatar')
            .sort({ createdAt: -1 });
        res.json(statuses);
    }
    catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
exports.getStatuses = getStatuses;
// @desc    Mark status as viewed
// @route   PUT /api/status/:id/view
// @access  Private
const viewStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const status = yield status_model_1.default.findById(req.params.id);
        if (!status) {
            res.status(404).json({ message: 'Status not found' });
            return;
        }
        if (!status.views.includes(req.user._id)) {
            status.views.push(req.user._id);
            yield status.save();
        }
        res.json(status);
    }
    catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
exports.viewStatus = viewStatus;
