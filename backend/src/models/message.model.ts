import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  content: string;
  chat: mongoose.Types.ObjectId;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  readBy: mongoose.Types.ObjectId[];
  status: 'sent' | 'delivered' | 'read';
  reactions?: Array<{ emoji: string; user: mongoose.Types.ObjectId }>;
}

const messageSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, trim: true },
    chat: { type: Schema.Types.ObjectId, ref: 'Chat' },
    mediaUrl: { type: String },
    mediaType: { type: String, enum: ['image', 'video', 'audio', 'document'] },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    reactions: [
      {
        emoji: { type: String, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true }
      }
    ],
  },
  { timestamps: true }
);

// Indexes tuned for pagination and lookups
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ chat: 1, _id: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ 'reactions.user': 1 });

const Message = mongoose.model<IMessage>('Message', messageSchema);
export default Message;
