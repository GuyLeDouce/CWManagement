'use client';
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
export function Pwa() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production')
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline ? (
    <div className="offline" role="alert">
      <WifiOff size={19} /> Internet connection required to record time.
    </div>
  ) : null;
}
