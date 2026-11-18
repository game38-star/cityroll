
import { ensureUser } from "./rooms";
import { getSupabase } from "./supabase";

// ==========================================
// TYPY GRY
// ==========================================

export type GameActionName =
  | "roll"
  | "buy"
  | "auction"
  | "bid"
  | "finish_auction"
  | "end"
  | "build"
  | "sell"
  | "sell_building"
  | "skip"
  | "pay_jail"
  | "bankrupt";

export type GamePhase =
  | "pre_roll"
  | "after_roll"
  | "await_purchase"
  | "auction"
  | "debt"
  | "finished";

export type PawnColor =
  | "purple"
  | "blue"
  | "green"
  | "orange";

export type FieldKind =
  | "start"
  | "city"
  | "special"
  | "card"
  | "jail";

export interface GameSettings {
  starting_cash: number;
  start_bonus: number;
  win_wealth: number;
  bankruptcy_cash: number;
  auction_seconds: number;
  auction_increment: number;
}

export interface GameField {
  number: number;
  name: string;
  kind: FieldKind;
  price: number | null;
  rent0: number;
  rent1: number;
  rent2: number;
  rent3: number;
  building_cost: number;
  sell_price: number;
  owner_id: string | null;
  buildings: number;
}

export interface GamePlayer {
  user_id: string;
  nickname: string;
  pawn: PawnColor;
  cash: number;
  position: number;
  jail_turns: number;
  eliminated: boolean;
}

export interface GameState {
  room_id: string;
  turn_user_id: string;
  phase: GamePhase;
  last_roll: number | null;
  extra_roll: boolean;
  pending_tile: number | null;
  auction_tile: number | null;
  auction_ends_at: string | null;
  auction_high_bid: number;
  auction_leader: string | null;
  winner_id: string | null;
  last_message: string;
  turn_deadline: string | null;
}

export interface GameEvent {
  id: number;
  message: string;
}

export interface GameSnapshot {
  config: GameSettings;
  fields: GameField[];
  players: GamePlayer[];
  state: GameState;
  events: GameEvent[];
  myId: string;

  // Czy aktualny gracz spasował?
  passedAuction: boolean;

  // Czy pozostali aktywni gracze spasowali?
  canFinishAuction: boolean;
}

export const PAWN_COLORS: Record<PawnColor, string> = {
  purple: "#9B77F5",
  blue: "#58A5F7",
  green: "#54C9A4",
  orange: "#FFAB66",
};

// ==========================================
// POBIERANIE STANU GRY
// ==========================================

export async function loadGame(
  roomId: string
): Promise<GameSnapshot> {
  const user = await ensureUser();
  const db = getSupabase();

  const [
    configRes,
    stateRes,
    fieldsRes,
    propertyRes,
    playersRes,
    profilesRes,
    eventsRes,
    passesRes,
  ] = await Promise.all([
    db
      .from("cityroll_game_config")
      .select("*")
      .eq("id", 1)
      .single(),

    db
      .from("cityroll_game_state")
      .select("*")
      .eq("room_id", roomId)
      .single(),

    db
      .from("cityroll_game_fields")
      .select("*")
      .order("number"),

    db
      .from("cityroll_game_properties")
      .select("*")
      .eq("room_id", roomId),

    db
      .from("cityroll_game_players")
      .select("*")
      .eq("room_id", roomId),

    db
      .from("cityroll_players")
      .select("user_id,nickname,pawn")
      .eq("room_id", roomId),

    db
      .from("cityroll_game_events")
      .select("id,message")
      .eq("room_id", roomId)
      .order("id", { ascending: false })
      .limit(5),

    db
      .from("cityroll_game_auction_passes")
      .select("user_id,auction_ends_at")
      .eq("room_id", roomId),
  ]);

  const results = [
    configRes,
    stateRes,
    fieldsRes,
    propertyRes,
    playersRes,
    profilesRes,
    eventsRes,
    passesRes,
  ];

  const failure = results.find((result) => result.error);

  if (failure?.error) {
    throw new Error(failure.error.message);
  }

  if (!stateRes.data) {
    throw new Error("Rozgrywka jeszcze nie rozpoczęła się.");
  }

  const state = stateRes.data as GameState;

  // ========================================
  // PROFILE GRACZY
  // ========================================

  const profileMap = new Map(
    (profilesRes.data ?? []).map((profile) => [
      profile.user_id,
      profile,
    ])
  );

  const ownerMap = new Map(
    (propertyRes.data ?? []).map((property) => [
      property.tile_number,
      property,
    ])
  );

  const players: GamePlayer[] = (
    playersRes.data ?? []
  ).map((player) => {
    const profile = profileMap.get(player.user_id);

    return {
      user_id: player.user_id,
      nickname: profile?.nickname ?? "Gracz",
      pawn: (profile?.pawn ?? "purple") as PawnColor,
      cash: player.cash,
      position: player.position,
      jail_turns: player.jail_turns,
      eliminated: player.eliminated,
    };
  });

  // ========================================
  // POLA PLANSZY
  // ========================================

  const fields: GameField[] = (
    fieldsRes.data ?? []
  ).map((field) => ({
    ...field,
    owner_id:
      ownerMap.get(field.number)?.owner_id ?? null,
    buildings:
      ownerMap.get(field.number)?.buildings ?? 0,
  }));

  // ========================================
  // PASOWANIE W AKTUALNEJ LICYTACJI
  // ========================================

  const currentPasses = (
    passesRes.data ?? []
  ).filter(
    (pass) =>
      state.phase === "auction" &&
      state.auction_ends_at !== null &&
      pass.auction_ends_at === state.auction_ends_at
  );

  const passedUserIds = new Set(
    currentPasses.map((pass) => pass.user_id)
  );

  const passedAuction = passedUserIds.has(user.id);

  // ========================================
  // CZY MOŻNA ZAKOŃCZYĆ LICYTACJĘ?
  // ========================================

  const activePlayers = players.filter(
    (player) => !player.eliminated
  );

  const canFinishAuction =
    state.phase === "auction" &&
    state.auction_leader !== null &&
    state.auction_high_bid > 0 &&
    activePlayers
      .filter(
        (player) =>
          player.user_id !== state.auction_leader
      )
      .every((player) =>
        passedUserIds.has(player.user_id)
      );

  return {
    config: configRes.data as GameSettings,
    state,
    fields,
    players,
    events: (eventsRes.data ?? []) as GameEvent[],
    myId: user.id,
    passedAuction,
    canFinishAuction,
  };
}

// ==========================================
// AKCJE GRY
// ==========================================

export async function gameAction(
  roomId: string,
  action: GameActionName,
  tile?: number,
  amount?: number
): Promise<string> {
  const { data, error } = await getSupabase().rpc(
    "cityroll_game_action",
    {
      p_room_id: roomId,
      p_action: action,
      p_tile: tile ?? null,
      p_amount: amount ?? null,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "string"
    ? data
    : "Zapisano zmianę.";
}

// ==========================================
// MAJĄTEK GRACZA
// ==========================================

export function playerWealth(
  player: GamePlayer,
  fields: GameField[]
): number {
  const propertyValue = fields
    .filter(
      (field) => field.owner_id === player.user_id
    )
    .reduce(
      (sum, field) =>
        sum +
        field.sell_price +
        Math.floor(field.building_cost / 2) *
          field.buildings,
      0
    );

  return player.cash + propertyValue;
}

// ==========================================
// ROZPOCZĘCIE GRY
// ==========================================

export async function ensureGame(
  roomId: string
): Promise<void> {
  await ensureUser();

  const { error } = await getSupabase().rpc(
    "cityroll_game_ensure",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

// ==========================================
// PASOWANIE
// ==========================================

export async function passAuction(
  roomId: string
): Promise<string> {
  const { data, error } = await getSupabase().rpc(
    "cityroll_auction_pass",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "string"
    ? data
    : "Spasowano.";
}
