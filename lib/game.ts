import { ensureUser } from './rooms';
import { getSupabase } from './supabase';

export type GameActionName = 'roll' | 'buy' | 'auction' | 'bid' | 'finish_auction' |
  'end' | 'build' | 'sell' | 'sell_building' | 'skip' | 'pay_jail' | 'bankrupt';
export type GamePhase = 'pre_roll' | 'after_roll' | 'await_purchase' | 'auction' | 'debt' | 'finished';
export type PawnColor = 'purple' | 'blue' | 'green' | 'orange';
export type FieldKind = 'start' | 'city' | 'special' | 'card' | 'jail';

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
}

export const PAWN_COLORS: Record<PawnColor, string> = {
  purple: '#9B77F5',
  blue: '#58A5F7',
  green: '#54C9A4',
  orange: '#FFAB66',
};

// Dane i ceny pobieramy z serwera, NIE z kopii w kodzie strony.
export async function loadGame(roomId: string): Promise<GameSnapshot> {
  const user = await ensureUser();
  const db = getSupabase();
  const [configRes, stateRes, fieldsRes, propertyRes, playersRes, profilesRes, eventsRes] =
    await Promise.all([
      db.from('cityroll_game_config').select('*').eq('id', 1).single(),
      db.from('cityroll_game_state').select('*').eq('room_id', roomId).single(),
      db.from('cityroll_game_fields').select('*').order('number'),
      db.from('cityroll_game_properties').select('*').eq('room_id', roomId),
      db.from('cityroll_game_players').select('*').eq('room_id', roomId),
      db.from('cityroll_players').select('user_id,nickname,pawn').eq('room_id', roomId),
      db.from('cityroll_game_events').select('id,message').eq('room_id', roomId)
        .order('id', { ascending: false }).limit(5),
    ]);
  const results = [configRes, stateRes, fieldsRes, propertyRes, playersRes, profilesRes, eventsRes];
  const failure = results.find((res) => res.error);
  if (failure?.error) throw new Error(failure.error.message);
  if (!stateRes.data) throw new Error('Rozgrywka jeszcze nie rozpoczęła się.');

  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p]));
  const ownerMap = new Map((propertyRes.data ?? []).map((p) => [p.tile_number, p]));
  const players: GamePlayer[] = (playersRes.data ?? []).map((p) => {
    const profile = profileMap.get(p.user_id);
    return {
      user_id: p.user_id,
      nickname: profile?.nickname ?? 'Gracz',
      pawn: (profile?.pawn ?? 'purple') as PawnColor,
      cash: p.cash,
      position: p.position,
      jail_turns: p.jail_turns,
      eliminated: p.eliminated,
    };
  });
  const fields: GameField[] = (fieldsRes.data ?? []).map((f) => ({
    ...f,
    owner_id: ownerMap.get(f.number)?.owner_id ?? null,
    buildings: ownerMap.get(f.number)?.buildings ?? 0,
  }));
  return {
    config: configRes.data as GameSettings,
    state: stateRes.data as GameState,
    fields,
    players,
    events: (eventsRes.data ?? []) as GameEvent[],
    myId: user.id,
  };
}

// Żaden wynik kostki, oferta ani zakup nie są obliczane w przeglądarce.
export async function gameAction(
  roomId: string,
  action: GameActionName,
  tile?: number,
  amount?: number
): Promise<string> {
  const { data, error } = await getSupabase().rpc('cityroll_game_action', {
    p_room_id: roomId,
    p_action: action,
    p_tile: tile ?? null,
    p_amount: amount ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? data : 'Zapisano zmianę.';
}

export function playerWealth(player: GamePlayer, fields: GameField[]): number {
  const equity = fields
    .filter((f) => f.owner_id === player.user_id)
    .reduce((sum, f) => sum + f.sell_price +
      Math.floor(f.building_cost / 2) * f.buildings, 0);
  return player.cash + equity;
}

// Gracz powracający do już rozpoczętej gry może ją bezpiecznie odtworzyć.
// Przy normalnym starcie robi to trigger w Supabase.
export async function ensureGame(roomId: string): Promise<void> {
  await ensureUser();
  const { error } = await getSupabase().rpc('cityroll_game_ensure', {
    p_room_id: roomId,
  });
  if (error) throw new Error(error.message);
}
