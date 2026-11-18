import styles from './AuctionPanel.module.css';

interface AuctionPanelProps {
  fieldName: string;
  secondsLeft: number;
  highBid: number;
  minIncrement: number;
  leaderName: string | null;
  isLeader: boolean;
  cash: number;
  busy: boolean;
  onBid: (amount: number) => void;
}

export default function AuctionPanel({
  fieldName, secondsLeft, highBid, minIncrement,
  leaderName, isLeader, cash, busy, onBid,
}: AuctionPanelProps) {
  const minimum = Math.max(minIncrement, highBid + minIncrement);
  const canBid = !busy && !isLeader && secondsLeft > 0;

  return (
    <section className={styles.panel} aria-label={`Licytacja pola ${fieldName}`}>
      <div className={styles.heading}>
        <div><small>LICYTACJA TRWA</small><h2>🔨 {fieldName}</h2></div>
        <span className={styles.timer} aria-live="off">{secondsLeft}s</span>
      </div>
      <div className={styles.summary}>
        <div><small>NAJWYŻSZA OFERTA</small><b>{highBid} $</b></div>
        <div><small>PROWADZI</small><b>{leaderName ?? 'Jeszcze nikt'}</b></div>
      </div>
      <div className={styles.bids}>
        <button type="button" disabled={!canBid || cash < minimum} onClick={() => onBid(minimum)}>
          Licytuj {minimum} $
        </button>
        <button type="button" className={styles.extra} disabled={!canBid || cash < minimum + 50}
          onClick={() => onBid(minimum + 50)}>
          +50 $
        </button>
      </div>
      <p className={styles.note}>
        {secondsLeft === 0 ? 'Rozliczamy licytację...' :
          isLeader ? 'Twoja oferta prowadzi. Czekamy na innych graczy.' :
            'Każdy gracz może licytować. Po zakończeniu serwer przyzna pole zwycięzcy.'}
      </p>
    </section>
  );
}
