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
exports.fetchCallHistory = exports.logCall = void 0;
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
