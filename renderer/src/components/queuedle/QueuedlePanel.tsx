import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useDailyGame,
  useSubmitGameScore,
  useGameLeaderboard,
  useGameDates,
  useGameRankings,
  useMyScore,
  useGameStats,
  computeQueuedleRating,
  getGameRankTier,
} from '../../hooks/useDailyGame';
import type { GameRanking } from '../../hooks/useDailyGame';
import { QueuedleIntro } from './QueuedleIntro';
import { QueuedleQuestionCard } from './QueuedleQuestionCard';
import { QueuedleBonusScreen } from './QueuedleBonusScreen';
import { QueuedleBonusResults } from './QueuedleBonusResults';
import { QueuedleRankChange } from './QueuedleRankChange';
import type { RankSnapshot } from './QueuedleRankChange';
import { QueuedleSummary } from './QueuedleSummary';
import { QueuedleCalendar } from './QueuedleCalendar';
import { MyScores } from './MyScores';
import { QueuedleLeaderboard, type LeaderboardTab } from './QueuedleLeaderboard';
import { formatGameDate, standingLine } from './format';
import { useUsers } from '../../hooks/useUsers';
import { PillButton } from '../common/PillButton';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { Dialog } from '../common/Dialog';
import styles from '../../styles/Queuedle.module.css';

type Phase = 'intro' | 'main' | 'bonus' | 'bonus-results' | 'rank-change' | 'summary';

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
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('today');
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
  // Always fetch rankings (not just when "Ranked" tab is open) so the post-game
  // rank-change screen has the user's prior totals available.
  const rankings = useGameRankings(displayName ?? undefined, true);
  const myScore = useMyScore(gameId, displayName);
  const gameStats = useGameStats(gameId);
  const { data: users } = useUsers(true, true);
  const imageByUser = useMemo(() => new Map((users ?? []).map((u) => [u.userId, u.imageUrl])), [users]);
  const alreadyPlayed = useMemo(() => {
    if (!displayName || !leaderboard.data || !('scores' in leaderboard.data)) return null;
    const existing = leaderboard.data.scores.find((s) => s.userName === displayName);
    return existing ?? null;
  }, [displayName, leaderboard.data]);

  const localPlayed = useMemo<{
    mainScore: number;
    bonusScore: number;
    guesses?: Array<'left' | 'right'>;
  } | null>(() => {
    if (!gameId) return null;
    try {
      const raw = localStorage.getItem(`queuedle-played:${gameId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.mainScore === 'number' && typeof parsed?.bonusScore === 'number') {
        return {
          mainScore: parsed.mainScore,
          bonusScore: parsed.bonusScore,
          guesses: Array.isArray(parsed.guesses) ? parsed.guesses : undefined,
        };
      }
    } catch {
      // ignore corrupt entry
    }
    return null;
  }, [gameId]);

  // Prefer the server's guesses; use the local copy only when it covers every
  // question (an empty or short local array must not block the server's).
  const questionCount = game?.questions.length ?? 0;
  const serverGuesses = myScore.data?.score?.guesses;
  const reviewGuesses = useMemo<Array<'left' | 'right'> | undefined>(() => {
    const complete = (g: unknown): g is Array<'left' | 'right'> =>
      Array.isArray(g) && questionCount > 0 && g.length >= questionCount;
    if (complete(serverGuesses?.main)) return serverGuesses.main;
    if (complete(localPlayed?.guesses)) return localPlayed?.guesses;
    return undefined;
  }, [serverGuesses, localPlayed, questionCount]);
  const reviewBonusGuesses = Array.isArray(serverGuesses?.bonus) ? serverGuesses.bonus : undefined;

  const [phase, setPhase] = useState<Phase>('intro');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pickedSide, setPickedSide] = useState<'left' | 'right' | null>(null);
  const [mainGuesses, setMainGuesses] = useState<Array<'left' | 'right'>>([]);
  const [bonusSelections, setBonusSelections] = useState<(string | null)[]>([]);
  const [localScore, setLocalScore] = useState<{ main: number; bonus: number } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [devReplay, setDevReplay] = useState(false);
  // Snapshot of the user's prior ranking row, captured once before today's submission.
  // undefined = not captured yet; null = captured, user has no prior games.
  const [beforeRanking, setBeforeRanking] = useState<GameRanking | null | undefined>(undefined);

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
        })
      );
    } catch {
      // ignore quota / disabled storage
    }
  }, [gameId, alreadyPlayed, localPlayed]);

  // Upgrade a local entry that lacks (complete) guesses once the server's arrive.
  const serverMain = serverGuesses?.main;
  useEffect(() => {
    if (!gameId || !localPlayed || !serverMain || questionCount === 0) return;
    if (serverMain.length < questionCount) return;
    if ((localPlayed.guesses?.length ?? 0) >= questionCount) return;
    try {
      localStorage.setItem(
        `queuedle-played:${gameId}`,
        JSON.stringify({ mainScore: localPlayed.mainScore, bonusScore: localPlayed.bonusScore, guesses: serverMain })
      );
    } catch {
      // ignore quota / disabled storage
    }
  }, [gameId, localPlayed, serverMain, questionCount]);

  useEffect(() => {
    if (game && bonusSelections.length !== game.questions.length) {
      setBonusSelections(new Array(game.questions.length).fill(null));
    }
  }, [game, bonusSelections.length]);

  // Capture the user's prior rankings row exactly once, before today's submission
  // refetches the rankings query (which would include today's score and ruin the delta).
  useEffect(() => {
    if (!displayName) return;
    if (beforeRanking !== undefined) return;
    if (rankings.isLoading) return;
    if (localScore !== null) return; // user already submitted; don't capture after the fact
    const row = rankings.data?.find((r) => r.userName === displayName) ?? null;
    setBeforeRanking(row);
  }, [displayName, rankings.data, rankings.isLoading, beforeRanking, localScore]);

  const afterRanking = useMemo<RankSnapshot | null>(() => {
    if (!localScore || !game || beforeRanking === undefined) return null;
    const todayScore = localScore.main + localScore.bonus;
    const todayMax = game.questions.length * 2;
    const totalScore = (beforeRanking?.totalScore ?? 0) + todayScore;
    const possibleScore = (beforeRanking?.possibleScore ?? 0) + todayMax;
    const gamesPlayed = (beforeRanking?.gamesPlayed ?? 0) + 1;
    const averagePercent = possibleScore > 0 ? (totalScore / possibleScore) * 100 : 0;
    const tier = getGameRankTier(averagePercent, gamesPlayed);
    return {
      rating: computeQueuedleRating(averagePercent),
      averagePercent,
      gamesPlayed,
      tierKey: tier.key,
      tierName: tier.name,
      isProvisional: tier.isProvisional,
    };
  }, [localScore, game, beforeRanking]);

  const beforeRankSnapshot = useMemo<RankSnapshot | null>(() => {
    if (!beforeRanking) return null;
    return {
      rating: computeQueuedleRating(beforeRanking.averagePercent),
      averagePercent: beforeRanking.averagePercent,
      gamesPlayed: beforeRanking.gamesPlayed,
      tierKey: beforeRanking.tierKey,
      tierName: beforeRanking.tierName,
      isProvisional: beforeRanking.isProvisional,
    };
  }, [beforeRanking]);

  function resetGameState() {
    setPhase('intro');
    setCurrentIdx(0);
    setRevealed(false);
    setPickedSide(null);
    setMainGuesses([]);
    setBonusSelections([]);
    setLocalScore(null);
    setDevReplay(false);
    setBeforeRanking(undefined);
  }

  function handleDevPlayAgain() {
    setDevReplay(true);
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
    setLeaderboardTab('today');
    resetGameState();
  }

  function handleBackToToday() {
    if (selectedDate === null) return;
    setSelectedDate(null);
    setLeaderboardTab('today');
    resetGameState();
  }

  // Every state renders inside the same scrolling page, so the header never jumps between states.
  const shell = (content: ReactNode, header?: ReactNode) => (
    <div className={styles.panel}>
      <div className={`page-scale ${styles.page}`}>
        {header}
        {content}
      </div>
    </div>
  );
  const message = (text: ReactNode) => shell(<p className={styles.state}>{text}</p>);

  if (isLoading) {
    // Skeletons at the size of the header and the hero card, so nothing jumps when the game arrives.
    return shell(
      <>
        <p className={styles.srOnly} role="status">Loading {isPastDay ? 'that' : "today's"} Queuedle…</p>
        <div className={styles.hero} aria-hidden="true">
          <div>
            <h1 className={styles.title}>Queuedle</h1>
            <span className={`skeleton ${styles.premiseSkel}`} />
          </div>
        </div>
        <div className={`skeleton ${styles.heroSkel}`} aria-hidden="true" />
      </>
    );
  }
  if (!data || (error && !('questions' in (data ?? {})))) return message('Failed to load Queuedle.');
  if ('error' in data && data.error) return message(data.error);
  if ('status' in data && data.status === 'pending') {
    return message("Today's Queuedle is still brewing. Try again in a minute.");
  }
  if (!game) return message('No Queuedle available.');
  if (game.questions.length === 0) {
    return message('Not enough play history yet to build a Queuedle. Queue some tunes and check back tomorrow.');
  }

  const justPlayed = localScore !== null;
  const showAlreadyPlayed = !justPlayed && !devReplay && (localPlayed !== null || alreadyPlayed !== null);
  const stillResolving =
    !justPlayed && !showAlreadyPlayed && (displayName === undefined || leaderboard.isLoading === true);
  const calendarDates = gameDates.data?.dates ?? [];
  const scores = leaderboard.data && 'scores' in leaderboard.data ? leaderboard.data.scores : [];

  const header = (
    <header className={styles.hero}>
      <div>
        <h1 className={styles.title}>Queuedle</h1>
        <p className={styles.premise}>{formatGameDate(game.id)}</p>
      </div>
      <div className={styles.actions}>
        {selectedDate !== null && (
          <PillButton onClick={handleBackToToday}>
            <ArrowLeft size={15} aria-hidden="true" /> Back to today
          </PillButton>
        )}
        {calendarDates.length > 0 && (
          <PillButton onClick={() => setCalendarOpen(true)} aria-haspopup="dialog">
            <CalendarDays size={15} aria-hidden="true" /> Past games
          </PillButton>
        )}
      </div>
    </header>
  );

  // The shared modal: focus moves into the grid, Tab stays inside, Esc closes, focus returns to "Past games".
  const calendar = calendarOpen && calendarDates.length > 0 && (
    <Dialog title="Past games" size="sm" closeLabel="Close calendar" onClose={() => setCalendarOpen(false)}>
      <QueuedleCalendar dates={calendarDates} selectedDate={gameId} todayId={todayId} onSelectDate={handleSelectDate} />
    </Dialog>
  );

  const page = (content: ReactNode) =>
    shell(
      <>
        {content}
        {calendar}
      </>,
      header
    );

  // The payoff of a once-a-day game: your score against the room, then the room, then your answers.
  function renderResults(
    currentGame: GameDoc,
    score: { mainScore: number; bonusScore: number },
    guesses: Array<'left' | 'right'> | undefined,
    bonusGuesses: string[] | undefined,
    note?: ReactNode
  ) {
    const max = currentGame.questions.length;
    const mine = score.mainScore + score.bonusScore;
    // Count yourself in straight away, before the leaderboard refetch catches up with your submission.
    const room =
      displayName && !scores.some((s) => s.userName === displayName)
        ? [...scores, { userName: displayName, mainScore: score.mainScore, bonusScore: score.bonusScore, total: mine }].sort(
            (a, b) => b.total - a.total
          )
        : scores;
    const others = room.filter((s) => s.userName !== displayName).map((s) => s.total);
    return (
      <>
        <MyScores
          mainScore={score.mainScore}
          bonusScore={score.bonusScore}
          maxMain={max}
          maxBonus={max}
          standing={displayName ? standingLine(mine, others, isPastDay) : undefined}
          mainScores={room.map((s) => s.mainScore)}
          bonusScores={room.map((s) => s.bonusScore)}
          note={note}
        />
        <div className={styles.resultsGrid}>
          <QueuedleLeaderboard
            tab={leaderboardTab}
            onTab={setLeaderboardTab}
            gameId={isPastDay ? currentGame.id : null}
            scores={room}
            rankings={rankings.data ?? []}
            rankingsLoading={rankings.isLoading}
            me={displayName ?? null}
            imageByUser={imageByUser}
            onOpenProfile={(name) => navigate(`/profile/${encodeURIComponent(name)}`)}
          />
          <QueuedleSummary
            questions={currentGame.questions}
            mainGuesses={guesses}
            bonusGuesses={bonusGuesses}
            stats={gameStats.data}
          />
        </div>
      </>
    );
  }

  if (showAlreadyPlayed) {
    const cachedScore =
      localPlayed ??
      (alreadyPlayed ? { mainScore: alreadyPlayed.mainScore, bonusScore: alreadyPlayed.bonusScore } : null);
    if (!cachedScore) return page(null);
    const note = (
      <div className={styles.playedNote}>
        <span>
          {isPastDay
            ? 'You played this one.'
            : "You've already played today. A new Queuedle arrives tomorrow."}
        </span>
        {import.meta.env.DEV && (
          <button type="button" className={styles.devReplay} onClick={handleDevPlayAgain}>
            Play again (dev)
          </button>
        )}
      </div>
    );
    return page(renderResults(game, cachedScore, reviewGuesses, reviewBonusGuesses, note));
  }

  if (stillResolving) return shell(<p className={styles.state}>Checking your score…</p>, header);

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

    const correctMain = mainGuesses.reduce((acc, g, i) => acc + (g === game.questions[i].winner ? 1 : 0), 0);
    const correctBonus = bonusGuesses.reduce((acc, g, i) => {
      const q = game.questions[i];
      const bonusSide = q.bonusItem ?? q.winner;
      const bonusTargetItem = bonusSide === 'left' ? q.left : q.right;
      return acc + (g === bonusTargetItem.topQueuer ? 1 : 0);
    }, 0);

    if (devReplay) {
      setLocalScore({ main: correctMain, bonus: correctBonus });
      setPhase('bonus-results');
      return;
    }

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
      scored = { main: correctMain, bonus: correctBonus };
    }
    setLocalScore(scored);
    try {
      localStorage.setItem(
        `queuedle-played:${game.id}`,
        JSON.stringify({ mainScore: scored.main, bonusScore: scored.bonus, guesses: mainGuesses })
      );
    } catch {
      // ignore quota / disabled storage
    }
    setPhase('bonus-results');
  }

  const pips = game.questions.map((q, i) => {
    const answered = i < currentIdx || (i === currentIdx && revealed && pickedSide);
    if (answered) return mainGuesses[i] === q.winner ? styles.pipRight : styles.pipWrong;
    if (i === currentIdx && phase === 'main') return styles.pipCurrent;
    return '';
  });

  const bonusGuesses = bonusSelections.map((s) => s ?? '');
  const showProgress = phase === 'main' || phase === 'bonus';

  return page(
    <>
      {showProgress && (
        <div className={styles.progress}>
          <span className={styles.progressLabel}>
            {phase === 'main' ? `Round ${currentIdx + 1} of ${total}` : 'Bonus round'}
          </span>
          <div className={styles.pips} aria-hidden="true">
            {pips.map((cls, i) => (
              <span key={i} className={`${styles.pip}${cls ? ' ' + cls : ''}`} />
            ))}
          </div>
        </div>
      )}

      {phase === 'intro' && (
        <QueuedleIntro
          onStart={() => setPhase('main')}
          rounds={total}
          isPastDay={isPastDay}
          players={scores
            .filter((s) => s.userName !== displayName)
            .map((s) => ({ name: s.userName, imageUrl: imageByUser.get(s.userName) }))}
        />
      )}

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
          imageByUser={imageByUser}
        />
      )}

      {phase === 'bonus-results' && (
        <QueuedleBonusResults
          winningItems={winningItems}
          bonusGuesses={bonusGuesses}
          imageByUser={imageByUser}
          onContinue={() => {
            // Skip the rank-change beat for dev replays (no real submission) and
            // when we couldn't compute an "after" snapshot (e.g. no displayName).
            if (devReplay || !afterRanking) setPhase('summary');
            else setPhase('rank-change');
          }}
        />
      )}

      {phase === 'rank-change' && afterRanking && (
        <QueuedleRankChange before={beforeRankSnapshot} after={afterRanking} onContinue={() => setPhase('summary')} />
      )}

      {phase === 'summary' &&
        localScore &&
        renderResults(game, { mainScore: localScore.main, bonusScore: localScore.bonus }, mainGuesses, bonusGuesses)}
    </>
  );
}
