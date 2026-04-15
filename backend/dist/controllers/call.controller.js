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
exports.clearCallHistory = exports.deleteCallHistoryItem = exports.fetchCallHistory = exports.logCall = void 0;
const call_model_1 = __importDefault(require("../models/call.model"));
const logCall = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { receiverId, status, callType, duration } = req.body;
    try {
        const newCall = yield call_model_1.default.create({
            caller: req.user._id,
            receiver: receiverId,
            status,
            callType,
            duration
        });
        const populatedCall = yield newCall.populate('caller receiver', 'name avatar email');
        res.json(populatedCall);
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
exports.logCall = logCall;
const fetchCallHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const calls = yield call_model_1.default.find({
            $or: [{ caller: req.user._id }, { receiver: req.user._id }]
        })
            .populate('caller receiver', 'name avatar email')
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(calls);
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
exports.fetchCallHistory = fetchCallHistory;
const deleteCallHistoryItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const call = yield call_model_1.default.findById(req.params.id);
        if (!call) {
            res.status(404).json({ message: 'Call history item not found' });
            return;
        }
        const isParticipant = call.caller.toString() === req.user._id.toString() ||
            call.receiver.toString() === req.user._id.toString();
        if (!isParticipant) {
            res.status(403).json({ message: 'Not authorized to delete this call' });
            return;
        }
        yield call_model_1.default.deleteOne({ _id: call._id });
        res.json({ message: 'Call history item deleted', id: call._id });
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
exports.deleteCallHistoryItem = deleteCallHistoryItem;
const clearCallHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield call_model_1.default.deleteMany({
            $or: [{ caller: req.user._id }, { receiver: req.user._id }]
        });
        res.json({ message: 'Call history cleared', deletedCount: result.deletedCount });
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
exports.clearCallHistory = clearCallHistory;
