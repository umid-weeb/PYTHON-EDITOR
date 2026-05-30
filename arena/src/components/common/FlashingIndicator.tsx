import { useEffect, useState } from 'react';

type Props = {
  userId: string;
  topic: string;
  pollIntervalMs?: number;
};

export default function FlashingIndicator({ userId, topic, pollIntervalMs = 30000 }: Props) {
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchState() {
      try {
        const res = await fetch(`/api/learning-patterns/${userId}/${encodeURIComponent(topic)}`);
        if (!mounted) return;
        if (!res.ok) return;
        const data = await res.json();
        setIsLocked(Boolean(data?.is_locked));
      } catch (e) {
        // network issue — keep silent to avoid UI noise
      }
    }
    fetchState();
    const id = setInterval(fetchState, pollIntervalMs);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [userId, topic, pollIntervalMs]);

  if (!isLocked) return null;

  return (
    <span className="relative inline-block">
      <span className="absolute -top-1 -right-1 inline-flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600 border-2 border-white" />
      </span>
    </span>
  );
}
