import mongoose, { Schema, Document } from 'mongoose';

export interface ICall extends Document {
  caller: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  status: 'missed' | 'accepted' | 'rejected';
  callType: 'audio' | 'video';
  duration?: number;
}

const callSchema = new Schema(
  {
    caller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['missed', 'accepted', 'rejected'], default: 'missed' },
    callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
    duration: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const CallHistory = mongoose.model<ICall>('CallHistory', callSchema);
export default CallHistory;
