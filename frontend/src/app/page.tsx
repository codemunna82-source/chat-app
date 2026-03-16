import ChatWindow from '@/components/ChatWindow';
import MainLayout from '@/components/MainLayout';

export default function Home() {
  return (
    <MainLayout>
      <div className="relative z-10 flex-1 flex w-full h-full">
        <ChatWindow />
      </div>
    </MainLayout>
  );
}
