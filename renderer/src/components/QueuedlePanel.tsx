import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDailyGame, useSubmitGameScore, useGameLeaderboard, useGameDates } from '../hooks/useDailyGame';
import { QueuedleIntro } from './QueuedleIntro';
import { QueuedleQuestionCard } from './QueuedleQuestionCard';
import { QueuedleBonusScreen } from './QueuedleBonusScreen';
import { QueuedleBonusResults } from './QueuedleBonusResults';
import { QueuedleSummary } from './QueuedleSummary';
import { QueuedleCalendar } from './QueuedleCalendar';
import styles from '../styles/Queuedle.module.css';

type Phase = 'intro' | 'main' | 'bonus' | 'bonus-results' | 'summary';

function londonDateToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function QueuedlePanel() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const todayId = useMemo(() => londonDateToday(), []);
  const { data, isLoading, error } = useDailyGame(selectedDate ?? undefined);
  const submit = useSubmitGameScore();
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    window.sonos.getDisplayName().then(setDisplayName);
  }, []);

  const game = data && 'questions' in data ? (data as GameDoc) : null;
  const gameId = game?.id ?? null;
  const isPastDay = selectedDate !== null && selectedDate !== todayId;

  const leaderboard = useGameLeaderboard(gameId ?? undefined);
  const gameDates = useGameDates(displayName ?? undefined);
  const alreadyPlayed = useMemo(() => {
    if (!displayName || !leaderboard.data || !('scores' in leaderboard.data)) return null;
    const existing = leaderboard.data.scores.find((s) => s.userName === displayName);
    return existing ?? null;
  }, [displayName, leaderboard.data]);

  const localPlayed = useMemo<{ mainScore: number; bonusScore: number } | null>(() => {
    if (!gameId) return null;
    try {
      const raw = localStorage.getItem(`queuedle-played:${gameId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.mainScore === 'number' && typeof parsed?.bonusScore === 'number') {
        return { mainScore: parsed.mainScore, bonusScore: parsed.bonusScore };
      }
    } catch {
      // ignore corrupt entry
    }
    return null;
  }, [gameId]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pickedSide, setPickedSide] = useState<'left' | 'right' | null>(null);
  const [mainGuesses, setMainGuesses] = useState<Array<'left' | 'right'>>([]);
  const [bonusSelections, setBonusSelections] = useState<(string | null)[]>([]);
  const [localScore, setLocalScore] = useState<{ main: number; bonus: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Backfill localStorage from the cloud when the leaderboard shows the user has
  // played but the local key is missing (fresh install, cleared cache, new machine).
  useEffect(() => {
    if (!gameId || !alreadyPlayed || localPlayed) return;
    try {
      localStorage.setItem(
        `queuedle-played:${gameId}`,
        JSON.stringify({
          mainScore: alreadyPlayed.mainScore,
          bonusScore: alreadyPlayed.bonusScore,
        }),
      );
    } catch {
      // ignore quota / disabled storage
    }
  }, [gameId, alreadyPlayed, localPlayed]);

  useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalendarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [calendarOpen]);

  useEffect(() => {
    if (game && bonusSelections.length !== game.questions.length) {
      setBonusSelections(new Array(game.questions.length).fill(null));
    }
  }, [game, bonusSelections.length]);

  function resetGameState() {
    setPhase('intro');
    setCurrentIdx(0);
    setRevealed(false);
    setPickedSide(null);
    setMainGuesses([]);
    setBonusSelections([]);
    setLocalScore(null);
  }

  function handleSelectDate(pickedGameId: string) {
    setCalendarOpen(false);
    const next = pickedGameId === todayId ? null : pickedGameId;
    if (next === selectedDate) return;
    setSelectedDate(next);
    resetGameState();
  }

  function handleBackToToday() {
    if (selectedDate === null) return;
    setSelectedDate(null);
    resetGameState();
  }

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Loading {isPastDay ? 'that' : "today's"} Queuedle…</div>
      </div>
    );
  }

  if (!data || (error && !('questions' in (data ?? {})))) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Failed to load Queuedle.</div>
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

  const justPlayed = localScore !== null;
  const showAlreadyPlayed = !justPlayed && (localPlayed !== null || alreadyPlayed !== null);
  const stillResolving = !justPlayed && !showAlreadyPlayed && (
    displayName === undefined || leaderboard.isLoading === true
  );

  const headerActions = (
    <>
      {selectedDate !== null && (
        <button className={styles.backToToday} onClick={handleBackToToday}>
          ← Today
        </button>
      )}
      <button className={styles.leaderLink} onClick={() => navigate('/leaderboard')}>
        Leaderboard →
      </button>
    </>
  );

  if (showAlreadyPlayed) {
    const cachedScore = localPlayed ?? (alreadyPlayed
      ? { mainScore: alreadyPlayed.mainScore, bonusScore: alreadyPlayed.bonusScore }
      : null);
    const scores = leaderboard.data && 'scores' in leaderboard.data ? leaderboard.data.scores : [];
    const calendarDates = gameDates.data?.dates ?? [];
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Queuedle</h1>
          <span className={styles.sub}>{game.id}</span>
          <div className={styles.spacer} />
          {headerActions}
        </div>
        <div className={styles.body}>
          {cachedScore && (
            <QueuedleSummary
              mainScore={cachedScore.mainScore}
              bonusScore={cachedScore.bonusScore}
              maxMain={game.questions.length}
              maxBonus={game.questions.length}
              alreadySubmitted
            />
          )}
          {scores.length > 0 && (
            <div className={styles.leaderboardSection}>
              <h2 className={styles.leaderboardTitle}>
                {selectedDate && selectedDate !== todayId ? `${selectedDate} Leaderboard` : "Today's Leaderboard"}
              </h2>
              {scores.slice(0, 10).map((s, i) => (
                <div key={s.userName} className={styles.scoreRow}>
                  <span className={styles.scoreRank}>
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                  </span>
                  <span className={styles.scoreName}>{s.userName}</span>
                  <span className={styles.scoreBreakdown}>
                    {s.mainScore}/{game.questions.length} · {s.bonusScore}/{game.questions.length}
                  </span>
                  <span className={styles.scoreTotal}>{s.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {calendarOpen && calendarDates.length > 0 && (
          <div className={styles.calendarOverlay} onClick={() => setCalendarOpen(false)}>
            <div className={styles.calendarModal} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.calendarClose}
                onClick={() => setCalendarOpen(false)}
                aria-label="Close calendar"
              >
                ✕
              </button>
              <QueuedleCalendar
                dates={calendarDates}
                selectedDate={gameId}
                todayId={todayId}
                onSelectDate={handleSelectDate}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stillResolving) {
    return (
      <div className={styles.page}>
        <div className={styles.state}>Checking your score…</div>
      </div>
    );
  }

  const question = game.questions[currentIdx];
  const total = game.questions.length;

  // Carry-over slide direction: if the carry-over item appeared on the opposite
  // side in the previous question, animate it sliding from there.
  const carryFrom: 'left' | 'right' | null = (() => {
    if (currentIdx === 0 || !question?.carryover) return null;
    const carryItem = question.carryover === 'left' ? question.left : question.right;
    const prev = game.questions[currentIdx - 1];
    if (prev.left.id === carryItem.id && prev.left.category === carryItem.category) return 'left';
    if (prev.right.id === carryItem.id && prev.right.category === carryItem.category) return 'right';
    return null;
  })();

  // bonus targets: the 'bonusItem' side of each question (falls back to 'winner' for old games)
  const winningItems = game.questions.map((q) => {
    const side = q.bonusItem ?? q.winner;
    return side === 'left' ? q.left : q.right;
  });

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
    let scored: { main: number; bonus: number };
    if (result.score) {
      scored = { main: result.score.mainScore, bonus: result.score.bonusScore };
    } else if (result.existing) {
      scored = { main: result.existing.mainScore, bonus: result.existing.bonusScore };
    } else {
      const correctMain = mainGuesses.reduce(
        (acc, g, i) => acc + (g === game.questions[i].winner ? 1 : 0),
        0,
      );
      const correctBonus = bonusGuesses.reduce((acc, g, i) => {
        const q = game.questions[i];
        const bonusSide = q.bonusItem ?? q.winner;
        const bonusTargetItem = bonusSide === 'left' ? q.left : q.right;
        return acc + (g === bonusTargetItem.topQueuer ? 1 : 0);
      }, 0);
      scored = { main: correctMain, bonus: correctBonus };
    }
    setLocalScore(scored);
    try {
      localStorage.setItem(
        `queuedle-played:${game.id}`,
        JSON.stringify({ mainScore: scored.main, bonusScore: scored.bonus }),
      );
    } catch {
      // ignore quota / disabled storage
    }
    setPhase('bonus-results');
  }

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

  const bonusGuesses = bonusSelections.map((s) => s ?? '');

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Queuedle</h1>
        <span className={styles.sub}>{game.id}</span>
        <div className={styles.spacer} />
        {headerActions}
      </div>
      <div className={styles.body}>
        {phase !== 'intro' && phase !== 'summary' && phase !== 'bonus-results' && (
          <div className={styles.progress}>
            {pips.map((cls, i) => (
              <div key={i} className={`${styles.pip}${cls ? ' ' + cls : ''}`} />
            ))}
          </div>
        )}

        {phase === 'intro' && <QueuedleIntro onStart={() => setPhase('main')} />}

        {phase === 'main' && question && (
          <QueuedleQuestionCard
            question={question}
            revealed={revealed}
            pickedSide={pickedSide}
            onPick={handlePick}
            onNext={handleNext}
            carryFrom={carryFrom}
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

        {phase === 'bonus-results' && (
          <QueuedleBonusResults
            winningItems={winningItems}
            bonusGuesses={bonusGuesses}
            onContinue={() => setPhase('summary')}
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
