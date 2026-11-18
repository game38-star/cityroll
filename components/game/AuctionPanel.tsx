
import styles from "./AuctionPanel.module.css";

interface AuctionPanelProps {
  fieldName: string;
  secondsLeft: number;
  highBid: number;
  minIncrement: number;
  leaderName: string | null;
  isLeader: boolean;
  cash: number;
  busy: boolean;
  hasPassed: boolean;
  onBid: (amount: number) => void;
  onPass: () => void;
  canFinish?: boolean;
  onFinish?: () => void;
}

export default function AuctionPanel({
  fieldName,
  secondsLeft,
  highBid,
  minIncrement,
  leaderName,
  isLeader,
  cash,
  busy,
  hasPassed,
  onBid,
  onPass,
  canFinish = false,
  onFinish,
}: AuctionPanelProps) {
  const timeUp = secondsLeft <= 0;
  const hasOffer = highBid > 0;

  const minimum = Math.max(
    minIncrement,
    highBid + minIncrement
  );

  const canBid =
    !busy &&
    !timeUp &&
    !hasPassed &&
    !isLeader;

  const canPass =
    !busy &&
    !timeUp &&
    !hasPassed &&
    !isLeader;

  const canEndAuction =
    !busy &&
    !timeUp &&
    isLeader &&
    canFinish &&
    typeof onFinish === "function";

  return (
    <section
      className={styles.panel}
      aria-label={`Licytacja pola ${fieldName}`}
    >
      <div className={styles.heading}>
        <div>
          <small>LICYTACJA TRWA</small>
          <h2>🔨 {fieldName}</h2>
        </div>

        <span className={styles.timer}>
          {Math.max(0, secondsLeft)}s
        </span>
      </div>

      <div className={styles.summary}>
        <div>
          <small>NAJWYŻSZA OFERTA</small>
          <b>{highBid} $</b>
        </div>

        <div>
          <small>PROWADZI</small>
          <b>{leaderName ?? "Jeszcze nikt"}</b>
        </div>
      </div>

      {timeUp ? (
        <p className={styles.note}>
          ⏳ Rozliczamy licytację...
        </p>
      ) : hasPassed ? (
        <>
          <button
            type="button"
            className={styles.passButton}
            disabled
          >
            ✓ Spasowano
          </button>

          <p className={styles.note}>
            Zrezygnowałeś z tej licytacji.
            Czekamy na pozostałych graczy.
          </p>
        </>
      ) : isLeader ? (
        <>
          <p className={styles.note}>
            🏆 Twoja oferta prowadzi!
          </p>

          <button
            type="button"
            className={styles.passButton}
            disabled={!canEndAuction}
            onClick={() => {
              if (canEndAuction) {
                onFinish?.();
              }
            }}
          >
            Zakończ licytację
          </button>

          <p className={styles.note}>
            {canFinish
              ? "Pozostali gracze spasowali."
              : "Czekamy na decyzję pozostałych graczy."}
          </p>
        </>
      ) : (
        <>
          <p className={styles.note}>
            {hasOffer
              ? "Ktoś złożył ofertę. Wybierz decyzję:"
              : "Złóż pierwszą ofertę lub spasuj."}
          </p>

          <div className={styles.bids}>
            <button
              type="button"
              disabled={!canBid || cash < minimum}
              onClick={() => onBid(minimum)}
            >
              {hasOffer ? "Przebij" : "Licytuj"}{" "}
              {minimum} $
            </button>

            <button
              type="button"
              className={styles.extra}
              disabled={
                !canBid ||
                cash < minimum + 50
              }
              onClick={() => onBid(minimum + 50)}
            >
              +50 $
            </button>
          </div>

          <button
            type="button"
            className={styles.passButton}
            disabled={!canPass}
            onClick={onPass}
          >
            ✕ Odrzuć / Pasuję
          </button>

          <p className={styles.note}>
            Pasowanie oznacza rezygnację
            z dalszego udziału w tej aukcji.
          </p>
        </>
      )}
    </section>
  );
}
