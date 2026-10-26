import { SectionCard } from '../common/SectionCard';
import { PillButton } from '../common/PillButton';
import { UserAvatar } from '../common/UserAvatar';
import { playedLine } from './format';
import styles from '../../styles/Queuedle.module.css';

interface Props {
  onStart: () => void;
  rounds: number;
  isPastDay?: boolean;
  /** Colleagues who have already played this game. */
  players?: Array<{ name: string; imageUrl?: string | null }>;
}

/** The start line: what the game asks, who has played, and one button. */
export function QueuedleIntro({ onStart, rounds, isPastDay, players = [] }: Props) {
  return (
    <div className={styles.intro}>
      <SectionCard className={styles.introLead}>
        <h2 className={styles.introTitle}>{rounds} rounds on what the office has queued</h2>
        <p className={styles.introSub}>
          Guess which got queued more, then who queued it most. It takes a couple of minutes.
        </p>
        <div className={styles.introStart}>
          <PillButton variant="primary" className={styles.startBtn} onClick={onStart}>
            Start
          </PillButton>
          {players.length > 0 && (
            <div className={styles.played}>
              <span className={styles.playedFaces} aria-hidden="true">
                {players.slice(0, 5).map((p) => (
                  <UserAvatar key={p.name} name={p.name} imageUrl={p.imageUrl} className={styles.playedAvatar} />
                ))}
              </span>
              <span className={styles.playedText}>
                {playedLine(
                  players.map((p) => p.name),
                  isPastDay
                )}
              </span>
            </div>
          )}
        </div>
      </SectionCard>
      <ol className={styles.rules}>
        <li className={styles.rule}>
          <span className={styles.ruleNum}>1</span>
          <h3 className={styles.ruleTitle}>Higher or Lower</h3>
          <p className={styles.ruleBody}>
            Two tracks, artists or albums. Pick the one the office has queued more. The winner stays on to face the next
            challenger.
          </p>
        </li>
        <li className={styles.rule}>
          <span className={styles.ruleNum}>2</span>
          <h3 className={styles.ruleTitle}>Top Queuer</h3>
          <p className={styles.ruleBody}>For each winner, guess which colleague has queued it the most.</p>
        </li>
      </ol>
      <p className={styles.ruleFoot}>
        One point for each right answer, {rounds * 2} in all. A new Queuedle arrives every day.
      </p>
    </div>
  );
}
