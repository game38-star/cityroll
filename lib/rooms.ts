
import { getSupabase } from "./supabase";

// ==========================================
// CITYROLL — TYPY
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
// SESJA GRACZA
// ==========================================

export async function ensureUser() {
  const supabase = getSupabase();

  // Sprawdzamy, czy przeglądarka ma sesję.
  // Brak sesji jest normalny przy pierwszej
  // wizycie na nowym adresie.

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (sessionData.session) {
    // Weryfikujemy istniejącą sesję.

    const { data, error } =
      await supabase.auth.getUser();

    if (data.user && !error) {
      return data.user;
    }

    // Sesja wygasła lub została usunięta.
    // Inne błędy (np. sieci) nie powinny
    // tworzyć nowego użytkownika.

    if (
      error &&
      error.name !== "AuthSessionMissingError" &&
      error.code !== "session_not_found" &&
      error.code !== "session_expired" &&
      error.code !== "invalid_token"
    ) {
      throw new Error(error.message);
    }
  }

  // Brak aktywnej sesji:
  // tworzymy anonimowego użytkownika.

  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(
      "Nie udało się zalogować gracza: " +
        error.message
    );
  }

  if (!data.user) {
    throw new Error(
      "Nie udało się utworzyć sesji gracza."
    );
  }

  return data.user;
}

// ==========================================
// TWORZENIE POKOJU
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

  if (error) {
    throw new Error(error.message);
  }

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
// DOŁĄCZANIE DO POKOJU
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

  if (error) {
    throw new Error(error.message);
  }

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
// POBIERANIE POKOJU
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
    throw new Error("Nie można otworzyć pokoju.");
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
// GOTOWOŚĆ GRACZA
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

  if (error) {
    throw new Error(error.message);
  }
}

// ==========================================
// ROZPOCZĘCIE GRY
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

  if (error) {
    throw new Error(error.message);
  }
}

// ==========================================
// OPUSZCZANIE POKOJU
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

  if (error) {
    throw new Error(error.message);
  }
}
