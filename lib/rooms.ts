
import { getSupabase } from "./supabase";

// ==========================================
// CITYROLL — TYPY DANYCH
// ==========================================

export type PawnColor =
  | "purple"
  | "blue"
  | "green"
  | "orange";

export type RoomStatus = "waiting" | "playing";

export interface RoomPlayer {
  user_id: string;
  nickname: string;
  pawn: PawnColor;
  ready: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  players: RoomPlayer[];
}

interface RoomResult {
  room_id: string;
  room_code: string;
}

// ==========================================
// 1. SESJA GRACZA
// ==========================================

export async function ensureUser() {
  const supabase = getSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (user) return user;

  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(
      "Nie udało się rozpocząć sesji: " +
        error.message
    );
  }

  if (!data.user) {
    throw new Error(
      "Nie udało się utworzyć gracza."
    );
  }

  return data.user;
}

// ==========================================
// 2. TWORZENIE POKOJU
// ==========================================

export async function createRoom(
  nickname: string,
  pawn: PawnColor
): Promise<RoomResult> {
  await ensureUser();

  const { data, error } = await getSupabase().rpc(
    "cityroll_create_room",
    {
      p_nickname: nickname.trim(),
      p_pawn: pawn,
    }
  );

  if (error) throw new Error(error.message);

  const result =
    (data as RoomResult[] | null)?.[0];

  if (!result) {
    throw new Error(
      "Nie udało się utworzyć pokoju."
    );
  }

  return result;
}

// ==========================================
// 3. DOŁĄCZANIE DO POKOJU
// ==========================================

export async function joinRoom(
  code: string,
  nickname: string,
  pawn: PawnColor
): Promise<RoomResult> {
  await ensureUser();

  const { data, error } = await getSupabase().rpc(
    "cityroll_join_room",
    {
      p_code: code.trim().toUpperCase(),
      p_nickname: nickname.trim(),
      p_pawn: pawn,
    }
  );

  if (error) throw new Error(error.message);

  const result =
    (data as RoomResult[] | null)?.[0];

  if (!result) {
    throw new Error(
      "Nie udało się dołączyć do pokoju."
    );
  }

  return result;
}

// ==========================================
// 4. POBIERANIE POKOJU
// ==========================================

export async function loadRoom(
  roomId: string
): Promise<RoomSnapshot> {
  const supabase = getSupabase();

  const { data: room, error: roomError } =
    await supabase
      .from("cityroll_rooms")
      .select("id, code, host_id, status")
      .eq("id", roomId)
      .single();

  if (roomError || !room) {
    throw new Error(
      "Nie można otworzyć pokoju."
    );
  }

  const { data: players, error: playersError } =
    await supabase
      .from("cityroll_players")
      .select(
        "user_id, nickname, pawn, ready, joined_at, last_seen_at"
      )
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

  if (playersError) {
    throw new Error(
      "Nie można pobrać listy graczy."
    );
  }

  return {
    id: room.id,
    code: room.code,
    host_id: room.host_id,
    status: room.status as RoomStatus,
    players: (players ?? []) as RoomPlayer[],
  };
}

// ==========================================
// 5. GOTOWOŚĆ GRACZA
// ==========================================

export async function setPlayerReady(
  roomId: string,
  ready: boolean
): Promise<void> {
  const { error } = await getSupabase().rpc(
    "cityroll_set_ready",
    {
      p_room_id: roomId,
      p_ready: ready,
    }
  );

  if (error) throw new Error(error.message);
}

// ==========================================
// 6. ROZPOCZYNANIE GRY
// ==========================================

export async function startRoom(
  roomId: string
): Promise<void> {
  const { error } = await getSupabase().rpc(
    "cityroll_start_room",
    {
      p_room_id: roomId,
    }
  );

  if (error) throw new Error(error.message);
}

// ==========================================
// 7. OPUSZCZANIE POKOJU
// ==========================================

export async function leaveRoom(
  roomId: string
): Promise<void> {
  const { error } = await getSupabase().rpc(
    "cityroll_leave_room",
    {
      p_room_id: roomId,
    }
  );

  if (error) throw new Error(error.message);
}
