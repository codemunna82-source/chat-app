import { create } from 'zustand';

export interface CallData {
  from: string; // User ID
  name: string;
  avatar?: string;
  signal: any;
  type: 'audio' | 'video';
}

interface WebRTCState {
  isCalling: boolean;
  isReceivingCall: boolean;
  callerData: CallData | null;
  callType: 'audio' | 'video' | null;
  userToCall: any | null; 
  callAccepted: boolean;
  
  initiateCall: (user: any, type: 'audio' | 'video') => void;
  receiveCall: (data: CallData) => void;
  setCallAccepted: (accepted: boolean) => void;
  resetCallState: () => void;
}

export const useWebRTCStore = create<WebRTCState>((set) => ({
  isCalling: false,
  isReceivingCall: false,
  callerData: null,
  callType: null,
  userToCall: null,
  callAccepted: false,
  
  initiateCall: (user, type) => set({ isCalling: true, userToCall: user, callType: type }),
  receiveCall: (data) => set({ isReceivingCall: true, callerData: data, callType: data.type }),
  setCallAccepted: (accepted) => set({ callAccepted: accepted }),
  resetCallState: () => set({ isCalling: false, isReceivingCall: false, callerData: null, callType: null, userToCall: null, callAccepted: false }),
}));
