import mongoose, { Schema, Document } from 'mongoose';

export interface IStatus extends Document {
  user: mongoose.Types.ObjectId;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  expiresAt: Date;
  views: mongoose.Types.ObjectId[];
}

const statusSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    caption: { type: String },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(+new Date() + 24 * 60 * 60 * 1000), // 24 hours from now
      index: { expires: '1m' }, // TTL index
    },
    views: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const Status = mongoose.model<IStatus>('Status', statusSchema);
export default Status;
