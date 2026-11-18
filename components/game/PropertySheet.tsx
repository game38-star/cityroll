import type { GameActionName, GameField, GamePlayer, GameState } from '../../lib/game';
import { PAWN_COLORS } from '../../lib/game';
import styles from './PropertySheet.module.css';

export default function PropertySheet({ field, players, state, myId, busy,
  onClose, onAction }: {
  field: GameField | null;
  players: GamePlayer[];
  state: GameState;
  myId: string;
  busy: boolean;
  onClose: () => void;
  onAction: (action: GameActionName, tile?: number) => void;
}) {
  if (!field) return null;
  const owner = players.find((p) => p.user_id === field.owner_id);
  const me = players.find((p) => p.user_id === myId);
  const myTurn = state.turn_user_id === myId;
  const purchasable = field.price !== null;
  const openToBuy = myTurn && !owner && purchasable && (
    state.phase === 'pre_roll' ||
    (state.phase === 'after_roll' && state.extra_roll) ||
    (state.phase === 'await_purchase' && state.pending_tile === field.number)
  );
  const canBuild = myTurn && owner?.user_id === myId &&
    field.kind === 'city' && field.buildings < 3 &&
    (state.phase === 'pre_roll' || state.phase === 'after_roll') &&
    (me?.cash ?? 0) >= field.building_cost;
  const canSell = myTurn && owner?.user_id === myId &&
    !['auction','finished'].includes(state.phase);
  const saleValue = field.sell_price + Math.floor(field.building_cost / 2) * field.buildings;
  const canSellBuilding = canSell && field.kind === 'city' && field.buildings > 0;
  const pendingDecision = myTurn && state.phase === 'await_purchase' && state.pending_tile === field.number;

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section className={styles.sheet} role="dialog" aria-modal="true"
        aria-label={`Pole ${field.name}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grabber} />
        <div className={styles.heading}>
          <div><small>POLE {field.number} / 28</small><h2>{field.name}</h2></div>
          <button type="button" onClick={onClose} className={styles.close} aria-label={pendingDecision ? "Nie kupuję tego pola" : "Zamknij"}>×</button>
        </div>
        {purchasable ? (
          <>
            <div className={styles.summary}>
              <div><small>CENA ZAKUPU</small><strong>{field.price}$</strong></div>
              <div><small>WŁAŚCICIEL</small><strong style={{ color: owner ? PAWN_COLORS[owner.pawn] : undefined }}>
                {owner?.nickname ?? 'Wolne'}</strong></div>
              <div><small>BUDYNKI</small><strong>{field.kind === 'city' ? `${field.buildings}/3` : '—'}</strong></div>
            </div>
            <div className={styles.rents}>
              {(field.kind === 'special' ? [field.rent0] : [field.rent0, field.rent1, field.rent2, field.rent3]).map((rent, i) => (
                <div key={i}><span>{i === 0 ? 'Czynsz bazowy' : `${i} ${i === 1 ? 'budynek' : 'budynki'}`}</span><b>{rent}$</b></div>
              ))}
            </div>
            {field.kind === 'city' && <p className={styles.help}>
              Budynek: {field.building_cost}$ • Odsprzedaż: {saleValue}$
            </p>}
            {field.kind === 'special' && <p className={styles.help}>Pole specjalne bez budynków • Odsprzedaż: {saleValue}$</p>}
            {openToBuy && <div className={styles.actions}>
              <button type="button" disabled={busy || (me?.cash ?? 0) < field.price!}
                onClick={() => onAction('buy', field.number)}>Kup za {field.price}$</button>
              <button type="button" disabled={busy} className={styles.secondary}
                onClick={() => onAction('auction', field.number)}>🔨 Licytuj</button>
            </div>}
            {pendingDecision && <button type="button" className={styles.skip} disabled={busy}
              onClick={() => onAction('skip', field.number)}>{state.extra_roll ? "Nie kupuję — rzucam ponownie" : "Nie kupuję — następny gracz"}</button>}
            {canBuild && <button type="button" className={styles.build} disabled={busy}
              onClick={() => onAction('build', field.number)}>🏗️ Buduj za {field.building_cost}$</button>}
            {canSellBuilding && <button type="button" className={styles.sell} disabled={busy}
              onClick={() => onAction('sell_building', field.number)}>Sprzedaj 1 budynek za {Math.floor(field.building_cost / 2)}$</button>}
            {canSell && <button type="button" className={styles.sell} disabled={busy}
              onClick={() => onAction('sell', field.number)}>Sprzedaj do banku za {saleValue}$</button>}
          </>
        ) : (
          <p className={styles.help}>
            {field.kind === 'card' ? 'Po zatrzymaniu się na tym polu losowana jest karta.' :
              field.kind === 'jail' ? 'Przy karcie „Kontrola miejska” trafiasz tutaj na 3 tury lub płacisz 150$.' :
              'Za przejście przez START otrzymujesz 200$.'}
          </p>
        )}
      </section>
    </div>
  );
}
