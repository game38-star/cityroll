'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import Board from '../../components/game/Board';
import PropertySheet from '../../components/game/PropertySheet';
import AuctionPanel from '../../components/game/AuctionPanel';
import { getSupabase } from '../../lib/supabase';
import {
  ensureGame, gameAction, loadGame, playerWealth, passAuction,
  type GameActionName, type GameSnapshot,
} from '../../lib/game';
import styles from './Game.module.css';

export default function GamePage() {
  const router = useRouter();
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pawnMoving, setPawnMoving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const auctionFinalizing = useRef(false);
  const timeoutProcessing = useRef(false);
  const syncChannelRef = useRef<RealtimeChannel | null>(null);
  const roomId = game?.state.room_id ?? '';

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) { setError('Brak identyfikatora pokoju.'); return; }
    let active = true;
    let channel: RealtimeChannel | null = null;
    let refreshVersion = 0;
    let checkingSync = false;
    let syncSignature = '';

    // Mały odcisk stanu gry pozwala sprawdzać ruch bez pobierania
    // całego cennika i kart co sekundę.
    function signature(
      state: { turn_user_id: string; phase: string; pending_tile: number | null;
        last_roll: number | null; last_message: string; turn_deadline: string | null;
        auction_ends_at: string | null; auction_high_bid: number; auction_leader: string | null },
      players: Array<{ user_id: string; position: number }>
    ) {
      return JSON.stringify([
        state.turn_user_id, state.phase, state.pending_tile,
        state.last_roll, state.last_message, state.turn_deadline,
        state.auction_ends_at, state.auction_high_bid, state.auction_leader,
        [...players].sort((a, b) => a.user_id.localeCompare(b.user_id))
          .map((p) => [p.user_id, p.position]),
      ]);
    }

    async function refresh() {
      const version = ++refreshVersion;
      try {
        const snapshot = await loadGame(id!);
        if (active && version === refreshVersion) {
          syncSignature = signature(snapshot.state, snapshot.players);
          setGame(snapshot);
          setError('');
        }
      } catch (e) {
        if (active && version === refreshVersion) setError(e instanceof Error ? e.message : 'Błąd gry.');
      }
    }
    void ensureGame(id).then(refresh).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'Nie można otworzyć gry.');
    });
    const db = getSupabase();

    // Realtime przyspiesza aktualizacje, a odczyt kontrolny
    // naprawia ewentualne zgubione zdarzenia na drugim telefonie.
    async function checkSync() {
      if (!active || checkingSync) return;
      checkingSync = true;
      try {
        const [stateRes, playersRes] = await Promise.all([
          db.from('cityroll_game_state')
            .select('turn_user_id,phase,pending_tile,last_roll,last_message,turn_deadline,auction_ends_at,auction_high_bid,auction_leader')
            .eq('room_id', id).single(),
          db.from('cityroll_game_players')
            .select('user_id,position').eq('room_id', id),
        ]);
        if (!active || stateRes.error || playersRes.error || !stateRes.data) return;
        const next = signature(stateRes.data, playersRes.data ?? []);
        if (next !== syncSignature) void refresh();
      } catch {
        // Przy chwilowym braku internetu kolejny odczyt ponowi próbę.
      } finally {
        checkingSync = false;
      }
    }

    channel = db.channel(`cityroll-game-${id}`);
    syncChannelRef.current = channel;
    channel.on('broadcast', { event: 'state-changed' }, () => { void refresh(); });
    for (const table of ['cityroll_game_state','cityroll_game_players','cityroll_game_properties','cityroll_game_events','cityroll_game_auction_passes']) {
      channel.on('postgres_changes', { event:'*', schema:'public', table,
        filter:`room_id=eq.${id}` }, () => { void refresh(); });
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(); });
    // Szybki odczyt stanu: drugi gracz widzi ruch jeszcze PRZED
    // decyzją o zakupie. 12 s zostaje jako pełna synchronizacja awaryjna.
    const syncInterval = window.setInterval(() => { void checkSync(); }, 1100);
    // Pełny odczyt co 3 sekundy aktualizuje również pasowania,
    // nawet gdy Realtime nie dostarczy zdarzenia z tabeli pasowań.
    const interval = window.setInterval(() => { void refresh(); }, 3000);
    const handleFocus = () => { void refresh(); };
    window.addEventListener('focus', handleFocus);
    // Czas pobieramy dopiero po zamontowaniu strony w przeglądarce.
    // Unikamy wywołania Date.now() podczas renderowania Next.js.
    const firstTick = window.requestAnimationFrame(() => setNow(Date.now()));
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(syncInterval);
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      if (syncChannelRef.current === channel) syncChannelRef.current = null;
      window.clearInterval(clock);
      window.cancelAnimationFrame(firstTick);
      if (channel) void db.removeChannel(channel);
    };
  }, []);

  // Karta szczegółów otwiera się tylko po dotknięciu pola.
  // Rzut nie otwiera już automatycznie okna z czynszami.

  async function act(action: GameActionName, tile?: number, amount?: number) {
    if (!roomId || busy || pawnMoving) return;
    setBusy(true);
    setError('');
    try {
      await gameAction(roomId, action, tile, amount);
      // Wysyłamy informację natychmiast po zatwierdzeniu rzutu.
      // Nie wysyłamy pozycji ani wyniku z telefonu: każdy pobiera
      // je sam z Supabase, więc nie da się sfałszować rzutu.
      if (syncChannelRef.current) {
        void syncChannelRef.current.send({
          type: 'broadcast', event: 'state-changed', payload: {},
        });
      }
      setGame(await loadGame(roomId));
      if (['buy','auction','sell','sell_building','build','skip'].includes(action)) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się wykonać akcji.');
    } finally { setBusy(false); }
  }

  async function handleAuctionPass() {
    if (!roomId || busy || pawnMoving || !game ||
        game.state.phase !== 'auction' || game.passedAuction) return;
    setBusy(true);
    setError('');
    try {
      await passAuction(roomId);
      if (syncChannelRef.current) {
        void syncChannelRef.current.send({
          type: 'broadcast', event: 'state-changed', payload: {},
        });
      }
      setGame(await loadGame(roomId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się spasować.');
    } finally {
      setBusy(false);
    }
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
      .then(() => {
        if (syncChannelRef.current) {
          void syncChannelRef.current.send({
            type: 'broadcast', event: 'state-changed', payload: {},
          });
        }
        return loadGame(game.state.room_id);
      })
      .then(setGame)
      .catch(() => { auctionFinalizing.current = false; })
      .finally(() => { auctionFinalizing.current = false; });
  }, [now, game, busy]);

  // Licznik jest wspolny: po zerze dowolny gracz prosi baze
  // o rozliczenie czasu. Serwer sam sprawdza deadline i kolejke.
  useEffect(() => {
    if (!game || !now || timeoutProcessing.current) return;
    const deadline = game.state.turn_deadline;
    if (!deadline || game.state.phase === 'auction' ||
        game.state.phase === 'debt' || game.state.phase === 'finished') return;
    if (Date.parse(deadline) > now) return;

    timeoutProcessing.current = true;
    const id = game.state.room_id;

    void (async () => {
      try {
        const { error: rpcError } = await getSupabase().rpc(
          'cityroll_game_process_timeout',
          { p_room_id: id }
        );
        if (rpcError) throw rpcError;

        if (syncChannelRef.current) {
          void syncChannelRef.current.send({
            type: 'broadcast', event: 'state-changed', payload: {},
          });
        }
        setGame(await loadGame(id));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Nie udało się zakończyć tury.');
      } finally {
        timeoutProcessing.current = false;
      }
    })();
  }, [game, now]);

  if (!game) return <main className={styles.page}>
    <div className={styles.loading}>🎲 {error || 'Otwieramy planszę...'}
      <button type="button" onClick={() => router.replace('/')}>Wróć do menu</button>
    </div>
  </main>;

  const { state, players, fields, config, myId } = game;
  const me = players.find((p) => p.user_id === myId);
  const turnPlayer = players.find((p) => p.user_id === state.turn_user_id);
  const myTurn = state.turn_user_id === myId && !me?.eliminated;
  const canRoll = !pawnMoving && myTurn && (state.phase === 'pre_roll' ||
    (state.phase === 'after_roll' && state.extra_roll));
  const canEnd = !pawnMoving && myTurn && state.phase === 'after_roll' && !state.extra_roll;
  const secondsLeft = state.auction_ends_at ?
    Math.max(0, Math.ceil((Date.parse(state.auction_ends_at) - now) / 1000)) : 0;
  const highest = state.auction_high_bid;
  const increment = config.auction_increment;
  const auctionField = fields.find((f) => f.number === state.auction_tile);
  const winner = players.find((p) => p.user_id === state.winner_id);
  const activePlayers = players.filter((p) => !p.eliminated);
  const turnSecondsLeft = state.turn_deadline && now
    ? Math.max(0, Math.ceil((Date.parse(state.turn_deadline) - now) / 1000))
    : 40;
  const showTurnClock = Boolean(state.turn_deadline &&
    ['pre_roll', 'after_roll', 'await_purchase'].includes(state.phase));

  return (
    <main className={styles.page}><div className={styles.container}>
      <header className={styles.header}>
        <h1>City<span>Roll</span></h1>
        <span className={styles.headerCaption}>WYŚCIG DO ZWYCIĘSTWA</span>
      </header>

      <section className={styles.scoreSection} aria-label="Wspólna tablica wyników">
        <div className={styles.goalLine}>
          <span>🏆 Cel rozgrywki</span>
          <strong>{config.win_wealth.toLocaleString('pl-PL')} $ majątku</strong>
        </div>
        <div
          className={styles.scoreBar}
          style={{ gridTemplateColumns: `repeat(${Math.max(1, activePlayers.length)}, minmax(0, 1fr))` }}
        >
          {activePlayers.map((p) => (
            <div
              key={p.user_id}
              className={styles.score}
              style={{ borderTopColor: ({
                purple: '#9B77F5', blue: '#58A5F7',
                green: '#54C9A4', orange: '#FFAB66',
              })[p.pawn] }}
            >
              <div className={styles.scoreName}>
                <span className={styles.scoreDot} style={{ backgroundColor: ({
                  purple: '#9B77F5', blue: '#58A5F7',
                  green: '#54C9A4', orange: '#FFAB66',
                })[p.pawn] }} />
                <strong title={p.nickname}>{p.nickname}</strong>
                {p.user_id === state.turn_user_id && showTurnClock && (
                  <span
                    className={styles.turnClock}
                    role="timer"
                    aria-label={`Pozostalo ${turnSecondsLeft} sekund`}
                    title={`Na decyzje: ${turnSecondsLeft} sekund`}
                    style={{
                      background: `conic-gradient(${turnSecondsLeft <= 10 ? '#e16b63' : '#8066ef'} ${Math.min(100, turnSecondsLeft / 40 * 100)}%, #e5e7f0 0)`,
                    }}
                  >
                    <b>{turnSecondsLeft}</b>
                  </span>
                )}
              </div>
              <div className={styles.scoreMoney}>
                <span title="Gotówka">Got.</span>
                <b>{p.cash.toLocaleString('pl-PL')} $</b>
              </div>
              <div className={styles.scoreMoney}>
                <span title="Majątek">Maj.</span>
                <b>{playerWealth(p, fields).toLocaleString('pl-PL')} $</b>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Board fields={fields} players={players} state={state}
        selected={selected} onSelect={setSelected} canRoll={canRoll} busy={busy}
        onMovementChange={setPawnMoving}
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
          hasPassed={game.passedAuction}
          onPass={() => void handleAuctionPass()}
          canFinish={game.canFinishAuction}
          onFinish={() => void act('finish_auction')}
        />
      )}

      {!pawnMoving && (me?.cash ?? 0) < 0 && state.phase !== 'debt' && state.phase !== 'finished' && (
        <p className={styles.cashWarning}>Saldo poniżej zera — możesz sprzedawać własne pola i budynki.</p>
      )}

      {!pawnMoving && state.phase === 'debt' && <section className={styles.debt}>
        <b>⚠️ Zagrożenie bankructwem: {me?.cash}$</b>
        <p>Dotknij własnego pola i sprzedaj je do banku, aby wrócić powyżej {config.bankruptcy_cash}$.</p>
        {myTurn && <button type="button" disabled={busy} onClick={() => void act('bankrupt')}>
          Ogłoś bankructwo</button>}
      </section>}

      {!pawnMoving && state.phase === 'finished' && <section className={styles.victory}>
        🏆 Wygrał(a) <strong>{winner?.nickname ?? 'Gracz'}</strong>!
      </section>}

      {!pawnMoving && state.phase !== 'auction' && state.phase !== 'debt' && state.phase !== 'finished' && (
        <section className={styles.controls}>
          {state.phase === 'await_purchase' && state.pending_tile !== null && (
            <div className={styles.purchasePrompt}>
              <div className={styles.purchaseTop}>
                <span className={styles.purchaseHint}>DECYZJA PO RZUCIE</span>
                <button
                  type="button"
                  className={styles.infoButton}
                  onClick={() => setSelected(state.pending_tile)}
                >
                  Szczegóły pola ⓘ
                </button>
              </div>
              <div className={styles.purchaseIdentity}>
                <strong>{fields.find((f) => f.number === state.pending_tile)?.name ?? 'Pole'}</strong>
                <b>{fields.find((f) => f.number === state.pending_tile)?.price ?? '—'} $</b>
              </div>
              {myTurn ? (
                <div className={styles.purchaseActions}>
                  <button type="button" disabled={busy || (me?.cash ?? 0) < (fields.find((f) => f.number === state.pending_tile)?.price ?? Infinity)}
                    onClick={() => void act('buy', state.pending_tile ?? undefined)}>
                    Kup
                  </button>
                  <button type="button" className={styles.auctionButton} disabled={busy}
                    onClick={() => void act('auction', state.pending_tile ?? undefined)}>
                    Licytuj
                  </button>
                  <button type="button" className={styles.skipButton} disabled={busy}
                    onClick={() => void act('skip', state.pending_tile ?? undefined)}>
                    Nie kupuję
                  </button>
                </div>
              ) : (
                <p className={styles.waitHint}>Czekamy na decyzję: {turnPlayer?.nickname ?? 'gracz'}</p>
              )}
            </div>
          )}
          {canEnd && <button type="button" className={styles.endButton} onClick={() => void act('end')} disabled={busy}>
            Zakończ turę →
          </button>}
          {myTurn && state.phase === 'pre_roll' && (me?.jail_turns ?? 0) > 0 &&
            <button type="button" className={styles.endButton} onClick={() => void act('pay_jail')} disabled={busy || (me?.cash ?? 0) < 150}>
              Wyjdź z więzienia za 150 $
            </button>}
          {myTurn && state.phase === 'pre_roll' &&
            <p>Możesz kupić wolne pole przed rzutem, dotykając go na planszy.</p>}
        </section>
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!pawnMoving && <div className={styles.history} aria-label="Ostatnie wydarzenia">
        {game.events.slice(0,3).map((ev) => <p key={ev.id}>{ev.message}</p>)}
      </div>}

      <PropertySheet field={fields.find((f) => f.number === selected) ?? null}
        players={players} state={state} myId={myId} busy={busy}
        onClose={() => setSelected(null)} onAction={(action: GameActionName, tile?: number) => void act(action, tile)} />
    </div></main>
  );
}
