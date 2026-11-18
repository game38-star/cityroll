import styles from './Dice.module.css';

const faces: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9],
  4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

export default function Dice({ value, canRoll, busy, onRoll }: {
  value: number | null;
  canRoll: boolean;
  busy: boolean;
  onRoll: () => void;
}) {
  const face = faces[value ?? 1];
  return (
    <button type="button" className={styles.button} onClick={onRoll}
      disabled={!canRoll || busy} aria-label="Rzuć jedną kostką">
      <div className={styles.die} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={face.includes(i + 1) ? styles.dot : styles.blank} />
        ))}
      </div>
      <span>{busy ? 'Chwila...' : canRoll ? 'RZUĆ' : `WYNIK ${value ?? '–'}`}</span>
    </button>
  );
}
