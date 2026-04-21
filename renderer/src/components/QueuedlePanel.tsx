import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDailyGame, useSubmitGameScore, useGameLeaderboard } from '../hooks/useDailyGame';
import { QueuedleQuestionCard } from './QueuedleQuestionCard';
import { QueuedleBonusScreen } from './QueuedleBonusScreen';
import { QueuedleSummary } from './QueuedleSummary';
import styles from '../styles/Queuedle.module.css';

type Phase = 'main' | 'bonus' | 'summary';

export function QueuedlePanel() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useDailyGame();
  const submit = useSubmitGameScore();
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    window.sonos.getDisplayName().then(setDisplayName);
  }, []);

  const game = data && 'questions' in data ? (data as GameDoc) : null;
  const gameId = game?.id ?? null;

  const leaderboard = useGameLeaderboard(gameId ?? undefined);
  const alreadyPlayed = useMemo(() => {
    if (!displayName || !leaderboard.data || !('scores' in leaderboard.data)) return null;
    const existing = leaderboard.data.scores.find((s) => s.userName === displayName);
    return existing ?? null;
  }, [displayName, leaderboard.data]);

  const [phase, setPhase] = useState<Phase>('main');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pickedSide, setPickedSide] = useState<'left' | 'right' | null>(null);
  const [mainGuesses, setMainGuesses] = useState<Array<'left' | 'right'>>([]);
  const [bonusSelections, setBonusSelections] = useState<(string | null)[]>([]);
  const [localScore, setLocalScore] = useState<{ main: number; bonus: number } | null>(null);

  useEffect(() => {
    if (game && bonusSelections.length !== game.questions.length) {
      setBonusSelections(new Array(game.questions.length).fill(null));
    }
  }, [game, bonusSelections.length]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Loading today&apos;s Queuedle…</div>
      </div>
    );
  }

  if (!data || (error && !('questions' in (data ?? {})))) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Failed to load today&apos;s Queuedle.</div>
      </div>
    );
  }

  if ('error' in data && data.error) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>{data.error}</div>
      </div>
    );
  }

  if ('status' in data && data.status === 'pending') {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Today&apos;s Queuedle is still brewing. Try again in a minute.</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>No Queuedle available.</div>
      </div>
    );
  }

  if (game.questions.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>
          Not enough play history yet to build a Queuedle. Queue some tunes and check back tomorrow.
        </div>
      </div>
    );
  }

  if (alreadyPlayed) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Queuedle</h1>
          <span className={styles.sub}>{game.id}</span>
          <div className={styles.spacer} />
          <button className={styles.leaderLink} onClick={() => navigate('/leaderboard')}>
            Leaderboard →
          </button>
        </div>
        <div className={styles.body}>
          <QueuedleSummary
            mainScore={alreadyPlayed.mainScore}
            bonusScore={alreadyPlayed.bonusScore}
            maxMain={game.questions.length}
            maxBonus={game.questions.length}
            alreadySubmitted
          />
        </div>
      </div>
    );
  }

  const question = game.questions[currentIdx];
  const total = game.questions.length;

  function handlePick(side: 'left' | 'right') {
    if (!question || pickedSide !== null) return;
    setPickedSide(side);
    setRevealed(true);
    setMainGuesses((prev) => {
      const next = prev.slice();
      next[currentIdx] = side;
      return next;
    });
  }

  function handleNext() {
    if (currentIdx + 1 < total) {
      setCurrentIdx((i) => i + 1);
      setRevealed(false);
      setPickedSide(null);
    } else {
      setPhase('bonus');
    }
  }

  function handleBonusSelect(index: number, name: string) {
    setBonusSelections((prev) => {
      const next = prev.slice();
      next[index] = name;
      return next;
    });
  }

  async function handleSubmit() {
    if (!game || !displayName) return;
    const bonusGuesses = bonusSelections.map((s) => s ?? '');
    const result = await submit.mutateAsync({
      gameId: game.id,
      userName: displayName,
      guesses: { main: mainGuesses, bonus: bonusGuesses },
    });
    if (result.score) {
      setLocalScore({ main: result.score.mainScore, bonus: result.score.bonusScore });
    } else if (result.existing) {
      setLocalScore({ main: result.existing.mainScore, bonus: result.existing.bonusScore });
    } else {
      const correctMain = mainGuesses.reduce(
        (acc, g, i) => acc + (g === game.questions[i].winner ? 1 : 0),
        0,
      );
      const correctBonus = bonusGuesses.reduce((acc, g, i) => {
        const q = game.questions[i];
        const winnerItem = q.winner === 'left' ? q.left : q.right;
        return acc + (g === winnerItem.topQueuer ? 1 : 0);
      }, 0);
      setLocalScore({ main: correctMain, bonus: correctBonus });
    }
    setPhase('summary');
  }

  const winningItems = game.questions.map((q) => (q.winner === 'left' ? q.left : q.right));

  const pips = game.questions.map((q, i) => {
    if (i < currentIdx) {
      return mainGuesses[i] === q.winner ? styles.pipCorrect : styles.pipWrong;
    }
    if (i === currentIdx && revealed && pickedSide) {
      return mainGuesses[i] === q.winner ? styles.pipCorrect : styles.pipWrong;
    }
    if (i === currentIdx) return styles.pipCurrent;
    return '';
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Queuedle</h1>
        <span className={styles.sub}>{game.id}</span>
        <div className={styles.spacer} />
        <button className={styles.leaderLink} onClick={() => navigate('/leaderboard')}>
          Leaderboard →
        </button>
      </div>
      <div className={styles.body}>
        {phase !== 'summary' && (
          <div className={styles.progress}>
            {pips.map((cls, i) => (
              <div key={i} className={`${styles.pip}${cls ? ' ' + cls : ''}`} />
            ))}
          </div>
        )}

        {phase === 'main' && question && (
          <QueuedleQuestionCard
            question={question}
            revealed={revealed}
            pickedSide={pickedSide}
            onPick={handlePick}
            onNext={handleNext}
          />
        )}

        {phase === 'bonus' && (
          <QueuedleBonusScreen
            winningItems={winningItems}
            selections={bonusSelections}
            onSelect={handleBonusSelect}
            onSubmit={handleSubmit}
            submitting={submit.isPending}
          />
        )}

        {phase === 'summary' && localScore && (
          <QueuedleSummary
            mainScore={localScore.main}
            bonusScore={localScore.bonus}
            maxMain={game.questions.length}
            maxBonus={game.questions.length}
          />
        )}
      </div>
    </div>
  );
}
