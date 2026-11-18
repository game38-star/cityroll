'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '../../lib/supabase';

// Nie zmieniamy działającego ekranu poczekalni.
// Layout przełącza WSZYSTKICH graczy na planszę po starcie hosta.
// Realtime + sprawdzanie co 4 sekundy (awaryjnie).
export default function RoomLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get('id');
    if (!roomId) return;

    const db = getSupabase();
    let active = true;
    let redirected = false;
    let checking = false;

    async function check() {
      if (!active || redirected || checking) return;
      checking = true;
      try {
        const { data } = await db.from('cityroll_rooms')
          .select('status').eq('id', roomId).maybeSingle();
        if (active && !redirected && data?.status === 'playing') {
          redirected = true;
          router.replace(`/game?id=${roomId}`);
        }
      } finally {
        checking = false;
      }
    }

    void check();

    const channel = db.channel(`cityroll-start-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'cityroll_rooms',
        filter: `id=eq.${roomId}`,
      }, () => { void check(); })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void check();
      });

    const interval = window.setInterval(() => { void check(); }, 4000);
    const onFocus = () => { void check(); };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      void db.removeChannel(channel);
    };
  }, [router]);

  return <>{children}</>;
}
