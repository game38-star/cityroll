
import type {
  GameField,
  GamePlayer,
  GameState,
} from "../../lib/game";

import { PAWN_COLORS } from "../../lib/game";
import Dice from "./Dice";
import GameNotifications from "./GameNotifications";
import styles from "./Board.module.css";

// ==========================================
// CITYROLL — KOLEJNOŚĆ PÓL
// START: LEWY DOLNY RÓG
// RUCH: GÓRA → PRAWO → DÓŁ → LEWO
// ==========================================

function coordinate(
  n: number
): { row: number; col: number } {
  // 1–8: lewa krawędź, od dołu do góry
  if (n <= 8) {
    return {
      row: 9 - n,
      col: 1,
    };
  }

  // 9–14: górna krawędź, w prawo
  if (n <= 14) {
    return {
      row: 1,
      col: n - 7,
    };
  }

  // 15–22: prawa krawędź, w dół
  if (n <= 22) {
    return {
      row: n - 14,
      col: 8,
    };
  }

  // 23–28: dolna krawędź, w lewo
  return {
    row: 8,
    col: 30 - n,
  };
}

// ==========================================
// PLANSZA CITYROLL
// ==========================================

export default function Board({
  fields,
  players,
  state,
  selected,
  onSelect,
  canRoll,
  busy,
  onRoll,
}: {
  fields: GameField[];
  players: GamePlayer[];
  state: GameState;
  selected: number | null;
  onSelect: (tile: number) => void;
  canRoll: boolean;
  busy: boolean;
  onRoll: () => void;
}) {
  const current = players.find(
    (p) => p.user_id === state.turn_user_id
  );

  return (
    <section
      className={styles.board}
      aria-label="Plansza CityRoll – 28 pól"
    >
      {fields.map((field) => {
        const { row, col } = coordinate(field.number);

        const owner = players.find(
          (p) => p.user_id === field.owner_id
        );

        const tokens = players.filter(
          (p) =>
            !p.eliminated &&
            p.position === field.number
        );

        return (
          <button
            type="button"
            key={field.number}
            onClick={() => onSelect(field.number)}
            className={[
              styles.tile,
              styles[field.kind],
              selected === field.number
                ? styles.selected
                : "",
            ].join(" ")}
            aria-label={`${field.number}. ${field.name}${
              field.price
                ? `, ${field.price} dolarów`
                : ""
            }`}
            style={{
              gridRow: row,
              gridColumn: col,

              backgroundColor: owner
                ? `${PAWN_COLORS[owner.pawn]}40`
                : undefined,

              borderColor: owner
                ? PAWN_COLORS[owner.pawn]
                : undefined,
            }}
          >
            {owner && (
              <span
                className={styles.ownedStripe}
                style={{
                  backgroundColor:
                    PAWN_COLORS[owner.pawn],
                }}
              />
            )}

            <span className={styles.number}>
              {field.number}
            </span>

            <span className={styles.name}>
              {field.kind === "card"
                ? "🃏"
                : field.kind === "start"
                  ? "🏁"
                  : field.kind === "jail"
                    ? "🚔"
                    : field.name}
            </span>

            <span className={styles.price}>
              {field.price === null
                ? ""
                : `${field.price}$`}
            </span>

            <span className={styles.tokens}>
              {tokens.map((p) => (
                <span
                  key={p.user_id}
                  className={styles.token}
                  title={p.nickname}
                  style={{
                    backgroundColor:
                      PAWN_COLORS[p.pawn],
                  }}
                />
              ))}
            </span>
          </button>
        );
      })}

      {/* ŚRODEK PLANSZY */}
      <div className={styles.center}>
        <div className={styles.mark}>
          City<span>Roll</span>
        </div>

        <p className={styles.turn}>
          TURA:{" "}
          <b>{current?.nickname ?? "—"}</b>
        </p>

        <GameNotifications
          message={state.last_message}
        />

        <Dice
          value={state.last_roll}
          canRoll={canRoll}
          busy={busy}
          onRoll={onRoll}
        />

        {state.extra_roll &&
          state.phase !== "finished" && (
            <span className={styles.six}>
              🎉 Szóstka = kolejny rzut!
            </span>
          )}
      </div>
    </section>
  );
}
