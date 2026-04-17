import ChatWindow from '@/components/ChatWindow';
import MainLayout from '@/components/MainLayout';

export default function Home() {
  return (
    <MainLayout>
      <div className="relative z-10 flex h-full min-h-0 w-full max-w-full flex-1 flex-col">
        <ChatWindow />
      </div>
    </MainLayout>
  );
}
