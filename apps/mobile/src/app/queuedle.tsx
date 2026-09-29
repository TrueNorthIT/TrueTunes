import { router, Stack } from 'expo-router';
import type { Href } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useDailyGame, useGameDates, useGameLeaderboard, useGameRankings, useGameStats, useMyScore, useSubmitGameScore,
} from '../logic/hooks/useDailyGame';
import type { GameRanking } from '../logic/hooks/useDailyGame';
import {
  carryFromSide as _carry, londonDateToday, pipStates, projectRanking, scoreBonus, scoreMain, snapshotFromRanking, winningItems as toWinning,
} from '../logic/lib/queuedleLogic';
import type { Side } from '../logic/lib/queuedleLogic';
import { plural, tierEmoji } from '../logic/lib/socialFormat';
import { useRemoteContext } from '../logic/RemoteContext';
import { Button, ScreenHeader, Segmented } from '../ui/social/common';
import {
  QueuedleBonusResults, QueuedleBonusScreen, QueuedleIntro, QueuedleQuestionCard, QueuedleRankChange,
} from '../ui/social/queuedle/GameScreens';
import { MyScores, QueuedleCalendar, QueuedleSummary, ScoreDistribution } from '../ui/social/queuedle/Results';
import { colors, radius, space, type } from '../ui/theme';

void _carry; // carry-over highlighting is shown via the count on the carried item; slide animation is skipped.

type Phase = 'intro' | 'main' | 'bonus' | 'bonus-results' | 'rank-change' | 'summary';

const PIP: Record<string, string> = { correct: colors.success, wrong: colors.danger, current: colors.accent, pending: colors.bg2 };
const profile = (n: string) => router.push(`/profile/${encodeURIComponent(n)}` as Href);

/** Port of desktop QueuedlePanel. Local-storage "already played" cache is dropped: the cloud leaderboard is the source of truth. */
export default function QueuedleScreen() {
  const { displayName } = useRemoteContext();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [tab, setTab] = useState<'today' | 'ranked'>('today');
  const todayId = useMemo(() => londonDateToday(), []);
  const { data, isLoading, error } = useDailyGame(selectedDate ?? undefined);
  const submit = useSubmitGameScore();

  const game = data && 'questions' in data ? (data as GameDoc) : null;
  const gameId = game?.id ?? null;

  const leaderboard = useGameLeaderboard(gameId ?? undefined);
  const gameDates = useGameDates(displayName ?? undefined);
  const rankings = useGameRankings(displayName ?? undefined, true);
  const myScore = useMyScore(gameId, displayName);
  const gameStats = useGameStats(gameId);

  const scores = leaderboard.data && 'scores' in leaderboard.data ? leaderboard.data.scores : [];
  const alreadyPlayed = displayName ? scores.find((s) => s.userName === displayName) ?? null : null;

  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<Side | null>(null);
  const [mainGuesses, setMainGuesses] = useState<Side[]>([]);
  const [bonusSel, setBonusSel] = useState<(string | null)[]>([]);
  const [local, setLocal] = useState<{ main: number; bonus: number } | null>(null);
  const [replay, setReplay] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [before, setBefore] = useState<GameRanking | null | undefined>(undefined);

  useEffect(() => {
    if (game && bonusSel.length !== game.questions.length) setBonusSel(new Array(game.questions.length).fill(null));
  }, [game, bonusSel.length]);

  // Capture prior ranking once, before today's submission refetches the rankings.
  useEffect(() => {
    if (!displayName || before !== undefined || rankings.isLoading || local !== null) return;
    setBefore(rankings.data?.find((r) => r.userName === displayName) ?? null);
  }, [displayName, rankings.data, rankings.isLoading, before, local]);

  const after = useMemo(
    () => (local && game && before !== undefined ? projectRanking(before, local.main + local.bonus, game.questions.length) : null),
    [local, game, before],
  );

  const reset = () => {
    setPhase('intro'); setIdx(0); setRevealed(false); setPicked(null); setMainGuesses([]); setBonusSel([]); setLocal(null); setReplay(false); setBefore(undefined);
  };
  const selectDate = (id: string) => {
    setCalendarOpen(false);
    const next = id === todayId ? null : id;
    if (next === selectedDate) return;
    setSelectedDate(next);
    setTab('today');
    reset();
  };

  const calendarDates = gameDates.data?.dates ?? [];
  const header = (
    <ScreenHeader
      title={game ? `Queuedle · ${game.id}` : 'Queuedle'}
      right={calendarDates.length > 0 ? (
        <Pressable hitSlop={10} onPress={() => setCalendarOpen(true)} accessibilityLabel="Past games"><Calendar size={22} color={colors.text2} /></Pressable>
      ) : undefined}
    />
  );
  const shell = (children: React.ReactNode) => (
    <View style={styles.root}>
      <Stack.Screen options={{ animation: 'slide_from_right' }} />
      {header}
      {selectedDate !== null && (
        <Pressable style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }} onPress={() => selectDate(todayId)}>
          <Text style={{ color: colors.accent }}>← Back to today</Text>
        </Pressable>
      )}
      <ScrollView contentContainerStyle={styles.pad}>{children}</ScrollView>
      <QueuedleCalendar visible={calendarOpen} dates={calendarDates} selectedDate={selectedDate} todayId={todayId} onSelectDate={selectDate} onClose={() => setCalendarOpen(false)} />
    </View>
  );
  const msg = (t: string) => shell(<Text style={[type.secondary, { textAlign: 'center', marginTop: space.xxl }]}>{t}</Text>);

  if (isLoading) return shell(<ActivityIndicator color={colors.text2} style={{ marginTop: space.xxl }} />);
  if (!data || (error && !game)) return msg('Failed to load Queuedle.');
  if ('error' in data && data.error) return msg(data.error);
  if ('status' in data && data.status === 'pending') return msg("Today's Queuedle is still brewing. Try again in a minute.");
  if (!game) return msg('No Queuedle available.');
  if (game.questions.length === 0) return msg('Not enough play history yet to build a Queuedle. Queue some tunes and check back tomorrow.');

  const total = game.questions.length;
  const justPlayed = local !== null;
  const showAlreadyPlayed = !justPlayed && !replay && alreadyPlayed !== null;
  const resolving = !justPlayed && !showAlreadyPlayed && (displayName === undefined || leaderboard.isLoading);

  const leaderboardArea = (myScoreVals: { mainScore: number; bonusScore: number } | null, showMine: boolean) => {
    const ranked = rankings.data ?? [];
    return (
      <View style={{ gap: space.md }}>
        {showMine && myScoreVals && <MyScores mainScore={myScoreVals.mainScore} bonusScore={myScoreVals.bonusScore} maxMain={total} maxBonus={total} />}
        <Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today' }, { value: 'ranked', label: 'Ranked' }]} />
        {tab === 'today' && (
          <>
            <Text style={type.heading}>{selectedDate && selectedDate !== todayId ? `${selectedDate} leaderboard` : "Today's leaderboard"}</Text>
            {scores.length === 0 && <Text style={type.secondary}>No scores yet</Text>}
            {scores.slice(0, 10).map((s, i) => (
              <Pressable key={s.userName} style={styles.lbRow} onPress={() => profile(s.userName)}>
                <Text style={[type.secondary, { width: 24 }]}>{i + 1}</Text>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{s.userName}</Text>
                <Text style={type.caption}>{s.mainScore}/{total} · {s.bonusScore}/{total}</Text>
                <Text style={[type.body, { width: 30, textAlign: 'right' }]}>{s.total}</Text>
              </Pressable>
            ))}
            {scores.length > 0 && (
              <>
                <ScoreDistribution scores={scores.map((s) => s.mainScore)} maxScore={total} playerScore={myScoreVals?.mainScore ?? -1} title="Higher or Lower" />
                <ScoreDistribution scores={scores.map((s) => s.bonusScore)} maxScore={total} playerScore={myScoreVals?.bonusScore ?? -1} title="Top Queuer" />
              </>
            )}
          </>
        )}
        {tab === 'ranked' && (
          <>
            <Text style={type.heading}>Ranked leaderboard</Text>
            {rankings.isLoading && <ActivityIndicator color={colors.text2} />}
            {!rankings.isLoading && ranked.length === 0 && <Text style={type.secondary}>No ranked scores yet.</Text>}
            {ranked.slice(0, 10).map((r, i) => (
              <Pressable key={r.userName} style={styles.lbRow} onPress={() => profile(r.userName)}>
                <Text style={[type.secondary, { width: 24 }]}>{i + 1}</Text>
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{r.userName}</Text>
                <Text style={type.caption}>{plural(r.gamesPlayed, 'game')} · {r.isProvisional ? 'Provisional' : `${tierEmoji(r.tierKey)} ${r.tierName}`}</Text>
                <Text style={[type.body, { width: 40, textAlign: 'right' }]}>{r.averageTotal.toFixed(1)}</Text>
              </Pressable>
            ))}
          </>
        )}
      </View>
    );
  };

  if (showAlreadyPlayed && alreadyPlayed) {
    const vals = { mainScore: alreadyPlayed.mainScore, bonusScore: alreadyPlayed.bonusScore };
    return shell(
      <View style={{ gap: space.lg }}>
        <QueuedleSummary {...vals} maxMain={total} maxBonus={total} alreadySubmitted hideScoreSummary questions={game.questions} mainGuesses={myScore.data?.score?.guesses?.main} stats={gameStats.data} />
        {leaderboardArea(vals, true)}
      </View>,
    );
  }
  if (resolving) return msg('Checking your score...');

  const q = game.questions[idx];
  const winning = toWinning(game.questions);
  const bonusGuesses = bonusSel.map((s) => s ?? '');

  const pick = (side: Side) => {
    if (!q || picked !== null) return;
    setPicked(side);
    setRevealed(true);
    setMainGuesses((p) => { const n = p.slice(); n[idx] = side; return n; });
  };
  const next = () => {
    if (idx + 1 < total) { setIdx((i) => i + 1); setRevealed(false); setPicked(null); } else setPhase('bonus');
  };
  const doSubmit = async () => {
    if (!displayName) {
      // Entra isn't configured on Android yet, so there may be no name at all. Say so instead of doing nothing.
      Alert.alert('Display name needed', 'Pick a display name so your score can be saved.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set name', onPress: () => router.push('/display-name') },
      ]);
      return;
    }
    const cm = scoreMain(game.questions, mainGuesses);
    const cb = scoreBonus(game.questions, bonusGuesses);
    if (replay) { setLocal({ main: cm, bonus: cb }); setPhase('bonus-results'); return; }
    try {
      const r = await submit.mutateAsync({ gameId: game.id, userName: displayName, guesses: { main: mainGuesses, bonus: bonusGuesses } });
      const s = r.score ?? r.existing;
      setLocal(s ? { main: s.mainScore, bonus: s.bonusScore } : { main: cm, bonus: cb });
      setPhase('bonus-results');
    } catch {
      /* mutation error state is shown below */
    }
  };

  const showPips = phase === 'main' || phase === 'bonus';
  return shell(
    <View style={{ gap: space.lg }}>
      {showPips && (
        <View style={styles.pips}>
          {pipStates(game.questions, idx, revealed, mainGuesses).map((s, i) => (
            <View key={i} style={[styles.pip, { backgroundColor: PIP[s] }]} />
          ))}
        </View>
      )}
      {phase === 'intro' && <QueuedleIntro onStart={() => setPhase('main')} />}
      {phase === 'main' && q && <QueuedleQuestionCard question={q} revealed={revealed} pickedSide={picked} onPick={pick} onNext={next} />}
      {phase === 'bonus' && (
        <>
          <QueuedleBonusScreen
            winningItems={winning}
            selections={bonusSel}
            onSelect={(i, name) => setBonusSel((p) => { const n = p.slice(); n[i] = name; return n; })}
            onSubmit={() => void doSubmit()}
            submitting={submit.isPending}
          />
          {submit.isError && <Text style={{ color: colors.danger, textAlign: 'center' }}>Could not submit your score. Try again.</Text>}
        </>
      )}
      {phase === 'bonus-results' && (
        <QueuedleBonusResults winningItems={winning} bonusGuesses={bonusGuesses} onContinue={() => setPhase(replay || !after ? 'summary' : 'rank-change')} />
      )}
      {phase === 'rank-change' && after && <QueuedleRankChange before={snapshotFromRanking(before)} after={after} onContinue={() => setPhase('summary')} />}
      {phase === 'summary' && local && (
        <View style={{ gap: space.lg }}>
          <QueuedleSummary mainScore={local.main} bonusScore={local.bonus} maxMain={total} maxBonus={total} questions={game.questions} mainGuesses={mainGuesses} stats={gameStats.data} />
          {leaderboardArea({ mainScore: local.main, bonusScore: local.bonus }, false)}
        </View>
      )}
    </View>,
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  pips: { flexDirection: 'row', gap: space.xs },
  pip: { flex: 1, height: 6, borderRadius: radius.pill },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
});
