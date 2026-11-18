
import { getSupabase } from "./supabase";
import { ensureUser, type PawnColor } from "./rooms";

// ==========================================
// CITYROLL — SPRAWDZANIE PIONKÓW
// ==========================================

export interface RoomAvailability {
  code: string;
  found: boolean;
  status: "waiting" | "playing" | "missing";
  takenPawns: PawnColor[];
}

interface AvailabilityRow {
  room_found: boolean;
  room_status: string;
  taken_pawns: string[];
}

const VALID_PAWNS: PawnColor[] = [
  "purple",
  "blue",
  "green",
  "orange",
];

function isPawnColor(value: string): value is PawnColor {
  return VALID_PAWNS.includes(value as PawnColor);
}

// ==========================================
// POBIERANIE ZAJĘTYCH KOLORÓW
// ==========================================

export async function getRoomAvailability(
  code: string
): Promise<RoomAvailability> {
  const normalizedCode = code.trim().toUpperCase();

  if (!/^[A-F0-9]{6}$/.test(normalizedCode)) {
    throw new Error("Nieprawidłowy kod pokoju.");
  }

  await ensureUser();

  const { data, error } = await getSupabase().rpc(
    "cityroll_check_room",
    {
      p_code: normalizedCode,
    }
  );

  if (error) {
    throw new Error(
      "Nie udało się sprawdzić pokoju: " + error.message
    );
  }

  const row = (data as AvailabilityRow[] | null)?.[0];

  if (!row) {
    throw new Error("Brak odpowiedzi z Supabase.");
  }

  return {
    code: normalizedCode,
    found: row.room_found,
    status: row.room_status as RoomAvailability["status"],
    takenPawns: (row.taken_pawns ?? []).filter(isPawnColor),
  };
}
