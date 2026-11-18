'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import Board from '../../components/game/Board';
import PropertySheet from '../../components/game/PropertySheet';
import AuctionPanel from '../../components/game/AuctionPanel';
import { getSupabase } from '../../lib/supabase';
import {
  ensureGame, gameAction, loadGame, playerWealth,
  type GameActionName, type GameSnapshot,
} from '../../lib/game';
import styles from './Game.module.css';

export default function GamePage() {
  const router = useRouter();
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const auctionFinalizing = useRef(false);
  const roomId = game?.state.room_id ?? '';

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) { setError('Brak identyfikatora pokoju.'); return; }
    let active = true;
    let channel: RealtimeChannel | null = null;
    let refreshVersion = 0;
    async function refresh() {
      const version = ++refreshVersion;
      try {
        const snapshot = await loadGame(id!);
        if (active && version === refreshVersion) { setGame(snapshot); setError(''); }
      } catch (e) {
        if (active && version === refreshVersion) setError(e instanceof Error ? e.message : 'Błąd gry.');
      }
    }
    void ensureGame(id).then(refresh).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Nie można otworzyć gry.');
    });
    const db = getSupabase();
    channel = db.channel(`cityroll-game-${id}`);
    for (const table of ['cityroll_game_state','cityroll_game_players','cityroll_game_properties','cityroll_game_events']) {
      channel.on('postgres_changes', { event:'*', schema:'public', table,
        filter:`room_id=eq.${id}` }, () => { void refresh(); });
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 12000);
    // Czas pobieramy dopiero po zamontowaniu strony w przeglądarce.
    // Unikamy wywołania Date.now() podczas renderowania Next.js.
    const firstTick = window.requestAnimationFrame(() => setNow(Date.now()));
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearInterval(clock);
      window.cancelAnimationFrame(firstTick);
      if (channel) void db.removeChannel(channel);
    };
  }, []);

  // Gracz po rzucie trafia na wolne pole: otwieramy jego kartę automatycznie.
  useEffect(() => {
    if (game?.state.phase === 'await_purchase' && game.state.pending_tile &&
      game.state.turn_user_id === game.myId) {
      setSelected(game.state.pending_tile);
    }
  }, [game?.state.phase, game?.state.pending_tile, game?.state.turn_user_id, game?.myId]);

  async function act(action: GameActionName, tile?: number, amount?: number) {
    if (!roomId || busy) return;
    setBusy(true);
    setError('');
    try {
      await gameAction(roomId, action, tile, amount);
      setGame(await loadGame(roomId));
      if (['buy','auction','sell','sell_building','build','skip'].includes(action)) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wykonać akcji.');
    } finally { setBusy(false); }
  }

  // Zamykanie licytacji jest sprawdzane przez serwer po upływie czasu.
  useEffect(() => {
    if (!game || game.state.phase !== 'auction' || !game.state.auction_ends_at) {
      auctionFinalizing.current = false;
      return;
    }
    if (Date.parse(game.state.auction_ends_at) > now || auctionFinalizing.current || busy) return;
    auctionFinalizing.current = true;
    void gameAction(game.state.room_id, 'finish_auction')
      .then(() => loadGame(game.state.room_id))
      .then(setGame)
      .catch(() => { auctionFinalizing.current = false; })
      .finally(() => { auctionFinalizing.current = false; });
  }, [now, game, busy]);

  if (!game) return <main className={styles.page}>
    <div className={styles.loading}>🎲 {error || 'Otwieramy planszę...'}
      <button type="button" onClick={() => router.replace('/')}>Wróć do menu</button>
    </div>
  </main>;

  const { state, players, fields, config, myId } = game;
  const me = players.find((p) => p.user_id === myId);
  const turnPlayer = players.find((p) => p.user_id === state.turn_user_id);
  const myTurn = state.turn_user_id === myId && !me?.eliminated;
  const canRoll = myTurn && (state.phase === 'pre_roll' ||
    (state.phase === 'after_roll' && state.extra_roll));
  const canEnd = myTurn && state.phase === 'after_roll' && !state.extra_roll;
  const secondsLeft = state.auction_ends_at ?
    Math.max(0, Math.ceil((Date.parse(state.auction_ends_at) - now) / 1000)) : 0;
  const highest = state.auction_high_bid;
  const increment = config.auction_increment;
  const auctionField = fields.find((f) => f.number === state.auction_tile);
  const winner = players.find((p) => p.user_id === state.winner_id);

  return (
    <main className={styles.page}><div className={styles.container}>
      <header className={styles.header}>
        <div><h1>City<span>Roll</span></h1><small>DO {config.win_wealth.toLocaleString('pl-PL')}$ MAJĄTKU</small></div>
        <div className={styles.wallet}><small>TWOJA GOTÓWKA</small>
          <b>{me?.cash.toLocaleString('pl-PL') ?? '—'}$</b></div>
      </header>

      <div className={styles.scoreBar}>
        {players.filter((p) => !p.eliminated).map((p) => (
          <div key={p.user_id} className={styles.score} style={{ borderTopColor:
            ({purple:'#9B77F5',blue:'#58A5F7',green:'#54C9A4',orange:'#FFAB66'})[p.pawn] }}>
            <small>{p.nickname}{p.user_id === state.turn_user_id ? ' 🎲' : ''}</small>
            <b>{playerWealth(p, fields).toLocaleString('pl-PL')}$</b>
          </div>
        ))}
      </div>

      <Board fields={fields} players={players} state={state}
        selected={selected} onSelect={setSelected} canRoll={canRoll} busy={busy}
        onRoll={() => void act('roll')} />

      {state.phase === 'auction' && (
        <AuctionPanel
          fieldName={auctionField?.name ?? 'Pole'}
          secondsLeft={secondsLeft}
          highBid={highest}
          minIncrement={increment}
          leaderName={players.find((p) => p.user_id === state.auction_leader)?.nickname ?? null}
          isLeader={state.auction_leader === myId}
          cash={me?.cash ?? 0}
          busy={busy}
          onBid={(amount: number) => void act('bid', undefined, amount)}
        />
      )}

      {(me?.cash ?? 0) < 0 && state.phase !== 'debt' && state.phase !== 'finished' && (
        <p className={styles.cashWarning}>Saldo poniżej zera — możesz sprzedawać własne pola i budynki.</p>
      )}

      {state.phase === 'debt' && <section className={styles.debt}>
        <b>⚠️ Zagrożenie bankructwem: {me?.cash}$</b>
        <p>Dotknij własnego pola i sprzedaj je do banku, aby wrócić powyżej {config.bankruptcy_cash}$.</p>
        {myTurn && <button type="button" disabled={busy} onClick={() => void act('bankrupt')}>
          Ogłoś bankructwo</button>}
      </section>}

      {state.phase === 'finished' && <section className={styles.victory}>
        🏆 Wygrał(a) <strong>{winner?.nickname ?? 'Gracz'}</strong>!
      </section>}

      {state.phase !== 'auction' && state.phase !== 'debt' && state.phase !== 'finished' && (
        <section className={styles.controls}>
          {canEnd && <button type="button" onClick={() => void act('end')} disabled={busy}>
            Zakończ turę →</button>}
          {myTurn && state.phase === 'pre_roll' && (me?.jail_turns ?? 0) > 0 &&
            <button type="button" onClick={() => void act('pay_jail')} disabled={busy || (me?.cash ?? 0) < 150}>
              Wyjdź z więzienia za 150$</button>}
          {myTurn && state.phase === 'pre_roll' &&
            <p>Przed rzutem możesz dotknąć dowolnego wolnego pola i je kupić.</p>}
          {state.phase === 'await_purchase' && (
            <div>
              <p>{myTurn ? 'Podejmij decyzję: kup pole lub zrezygnuj.' : `Czekamy na decyzję: ${turnPlayer?.nickname}`}</p>
              {myTurn && state.pending_tile !== null && (
                <button type="button" disabled={busy}
                  onClick={() => void act('skip', state.pending_tile!)}>
                  {state.extra_roll ? 'Nie kupuję — rzut za szóstkę' : 'Nie kupuję — przekaż turę'}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.history} aria-label="Ostatnie wydarzenia">
        {game.events.slice(0,3).map((ev) => <p key={ev.id}>{ev.message}</p>)}
      </div>

      <PropertySheet field={fields.find((f) => f.number === selected) ?? null}
        players={players} state={state} myId={myId} busy={busy}
        onClose={() => {
          // X na decyzji zakupowej oznacza faktyczną rezygnację,
          // którą zapisujemy w Supabase (nie samo schowanie okna).
          if (state.phase === 'await_purchase' && state.pending_tile === selected && myTurn) {
            if (!busy) void act('skip', state.pending_tile ?? undefined);
          } else {
            setSelected(null);
          }
        }} onAction={(action: GameActionName, tile?: number) => void act(action, tile)} />
    </div></main>
  );
}
