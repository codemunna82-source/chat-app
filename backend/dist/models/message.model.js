"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const messageSchema = new mongoose_1.Schema({
    sender: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, trim: true },
    chat: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Chat' },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ['image', 'video', 'audio', 'document'] },
    readBy: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    reactions: [
        {
            emoji: { type: String, required: true },
            user: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true }
        }
    ],
}, { timestamps: true });
// Indexes tuned for pagination and lookups
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ chat: 1, _id: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'reactions.user': 1 });
const Message = mongoose_1.default.model('Message', messageSchema);
exports.default = Message;
