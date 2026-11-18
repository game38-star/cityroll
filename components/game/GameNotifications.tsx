import styles from './GameNotifications.module.css';

export default function GameNotifications({ message }: { message: string }) {
  return (
    <div className={styles.notice} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.label}>NA PLANSZY</span>
      <p>{message || 'Czekamy na pierwszy rzut...'}</p>
    </div>
  );
}
