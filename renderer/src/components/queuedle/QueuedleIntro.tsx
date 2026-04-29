import styles from '../../styles/Queuedle.module.css';

interface Props {
  onStart: () => void;
}

export function QueuedleIntro({ onStart }: Props) {
  return (
    <div className={styles.intro}>
      <div className={styles.bonusIntro}>
        <h2 className={styles.bonusIntroTitle}>Welcome to Queuedle</h2>
        <p className={styles.bonusIntroSub}>The daily office music guessing game.</p>
      </div>
      <div className={styles.introRules}>
        <div className={styles.introRule}>
          <h3 className={styles.introRuleTitle}>Round 1 — Higher or Lower</h3>
          <p className={styles.introRuleBody}>
            Two tracks, artists, or albums face off. Pick the one that&apos;s been queued more times in the
            office. The winner carries over and faces a new challenger in the next round.
          </p>
        </div>
        <div className={styles.introRule}>
          <h3 className={styles.introRuleTitle}>Round 2 — Top Queuer</h3>
          <p className={styles.introRuleBody}>
            For each winning item, guess which colleague has played it the most.
          </p>
        </div>
        <div className={styles.introRule}>
          <h3 className={styles.introRuleTitle}>Score</h3>
          <p className={styles.introRuleBody}>
            One point per correct answer in each round. Come back tomorrow for a new Queuedle.
          </p>
        </div>
      </div>
      <div className={styles.nextRow}>
        <button className={styles.nextBtn} onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}
