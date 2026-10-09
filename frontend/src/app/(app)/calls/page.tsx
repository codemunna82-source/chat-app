'use client';

import MainLayout from '@/components/MainLayout';
import CallsHeader from '@/components/calls/CallsHeader';
import CallHistoryList from '@/components/calls/CallHistoryList';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useWebRTCStore } from '@/store/useWebRTCStore';
import ConfirmModal from '@/components/ConfirmModal';

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const { user } = useAuthStore();
  const { initiateCall } = useWebRTCStore();
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    const fetchCalls = async () => {
      try {
        const { data } = await api.get('/call');
        setCalls(data);
      } catch (err) {
        console.error('Failed to fetch call history', err);
      }
    };
    fetchCalls();
  }, []);

  const deleteCallHistoryItem = async (id: string) => {
    try {
      await api.delete(`/call/${id}`);
      setCalls((prev) => prev.filter((c) => c._id !== id));
    } catch (err) {
      console.error('Failed to delete call history item', err);
    }
  };

  const clearCallHistory = async () => {
    if (calls.length === 0) return;
    setIsClearing(true);
    try {
      await api.delete('/call');
      setCalls([]);
      setClearModalOpen(false);
    } catch (err) {
      console.error('Failed to clear call history', err);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col">
        <CallsHeader
          canClear={calls.length > 0}
          isClearing={isClearing}
          onClearAll={() => setClearModalOpen(true)}
        />
        <CallHistoryList
          calls={calls}
          userId={user?._id || ''}
          onCall={initiateCall}
          onDelete={deleteCallHistoryItem}
        />
      </div>
      <ConfirmModal
        isOpen={clearModalOpen}
        title="Clear call history?"
        description="This will remove all your call history. This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        variant="danger"
        onConfirm={clearCallHistory}
        onCancel={() => setClearModalOpen(false)}
      />
    </MainLayout>
  );
}
