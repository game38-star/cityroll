
import { getSupabase } from "./supabase";

// ==========================================
// CITYROLL — AKTYWNOŚĆ GRACZY
// ==========================================

// Sygnał do bazy co 30 sekund.
export const HEARTBEAT_INTERVAL_MS = 30_000;

// Po 75 sekundach bez sygnału
// oznaczamy gracza jako offline.
export const OFFLINE_AFTER_MS = 75_000;

// Po 3 minutach bez sygnału baza
// może usunąć nieaktywnego gracza.
// Ten limit jest ustawiony również w SQL.
export const GRACE_PERIOD_MS = 180_000;

// ==========================================
// WYSYŁANIE SYGNAŁU AKTYWNOŚCI
// ==========================================

export async function heartbeatRoom(
  roomId: string
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.rpc(
    "cityroll_heartbeat",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

// ==========================================
// SPRAWDZANIE STATUSU ONLINE
// ==========================================

export function isPlayerOnline(
  lastSeenAt: string,
  currentTime: number = Date.now()
): boolean {
  const timestamp = Date.parse(lastSeenAt);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return (
    currentTime - timestamp < OFFLINE_AFTER_MS
  );
}
