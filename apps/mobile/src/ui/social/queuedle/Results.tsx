import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { distribution } from '../../../logic/lib/queuedleLogic';
import type { Side } from '../../../logic/lib/queuedleLogic';
import { Art } from '../../Art';
import { colors, radius, space, type } from '../../theme';

export function MyScores({ mainScore, bonusScore, maxMain, maxBonus }: { mainScore: number; bonusScore: number; maxMain: number; maxBonus: number }) {
  return (
    <View style={styles.card}>
      <Text style={type.heading}>My scores</Text>
      <Text style={styles.big}>{mainScore + bonusScore}<Text style={type.secondary}> / {maxMain + maxBonus}</Text></Text>
      <View style={styles.cells}>
        <View style={styles.cell}><Text style={type.heading}>{mainScore}/{maxMain}</Text><Text style={type.caption}>Higher or lower</Text></View>
        <View style={styles.cell}><Text style={type.heading}>{bonusScore}/{maxBonus}</Text><Text style={type.caption}>Top queuer</Text></View>
      </View>
    </View>
  );
}

export function ScoreDistribution({ scores, maxScore, playerScore, title }: { scores: number[]; maxScore: number; playerScore: number; title: string }) {
  const buckets = distribution(scores, maxScore);
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.secondary}>{title}</Text>
      <View style={styles.dist}>
        {buckets.map((b) => (
          <View key={b.score} style={styles.distCol}>
            <View style={styles.distTrack}>
              <View style={{ height: `${b.pct}%`, backgroundColor: b.score === playerScore ? colors.accent : colors.border2, borderRadius: 3 }} />
            </View>
            <Text style={[type.caption, b.score === playerScore && { color: colors.text }]}>{b.score}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewRow({ q, guess, stat }: { q: GameQuestion; guess: Side; stat?: GameQuestionStat }) {
  const ok = guess === q.winner;
  const pct = q.winner === 'left' ? stat?.leftPct : stat?.rightPct;
  return (
    <View style={[styles.review, { borderLeftColor: ok ? colors.success : colors.danger }]}>
      <View style={styles.reviewLine}>
        <Art uri={q.left.imageUrl} size={36} />
        <Text style={[type.secondary, { flex: 1, fontWeight: q.winner === 'left' ? '700' : '400', color: q.winner === 'left' ? colors.text : colors.text2 }]} numberOfLines={2}>
          {q.left.name} ({q.left.count})
        </Text>
        <Text style={type.caption}>vs</Text>
        <Text style={[type.secondary, { flex: 1, textAlign: 'right', fontWeight: q.winner === 'right' ? '700' : '400', color: q.winner === 'right' ? colors.text : colors.text2 }]} numberOfLines={2}>
          {q.right.name} ({q.right.count})
        </Text>
        <Art uri={q.right.imageUrl} size={36} />
      </View>
      {stat && (
        <Text style={type.caption}>
          {pct !== undefined ? `${pct}% got this right` : ''}
          {stat.bonusOptions.length > 0 ? `${pct !== undefined ? ' · ' : ''}${stat.bonusOptions.map((o) => `${o.name} ${o.pct}%`).join(' · ')}` : ''}
        </Text>
      )}
    </View>
  );
}

export function QueuedleSummary({
  mainScore, bonusScore, maxMain, maxBonus, alreadySubmitted, hideScoreSummary, questions, mainGuesses, stats,
}: {
  mainScore: number; bonusScore: number; maxMain: number; maxBonus: number; alreadySubmitted?: boolean; hideScoreSummary?: boolean;
  questions?: GameQuestion[]; mainGuesses?: Side[]; stats?: GameStatsResult;
}) {
  return (
    <View style={{ gap: space.md }}>
      {!hideScoreSummary && <MyScores mainScore={mainScore} bonusScore={bonusScore} maxMain={maxMain} maxBonus={maxBonus} />}
      {questions && mainGuesses && questions.length > 0 && mainGuesses.length >= questions.length && (
        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>Question breakdown</Text>
          {questions.map((q, i) => <ReviewRow key={i} q={q} guess={mainGuesses[i]} stat={stats?.questions?.[i]} />)}
        </View>
      )}
      {alreadySubmitted && <Text style={[type.secondary, { textAlign: 'center' }]}>You have already played - come back tomorrow for a new Queuedle.</Text>}
    </View>
  );
}

/** Date picker for past games (desktop shows a month calendar; a list keeps this simple on a phone). */
export function QueuedleCalendar({
  visible, dates, selectedDate, todayId, onSelectDate, onClose,
}: {
  visible: boolean; dates: GameDateEntry[]; selectedDate: string | null; todayId: string; onSelectDate: (id: string) => void; onClose: () => void;
}) {
  const sorted = [...dates].sort((a, b) => b.gameId.localeCompare(a.gameId));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={type.heading}>Past games</Text>
          <ScrollView>
            {sorted.map((d) => (
              <Pressable key={d.gameId} style={styles.dateRow} disabled={d.status !== 'ready'} onPress={() => onSelectDate(d.gameId)}>
                <Text style={[type.body, d.status !== 'ready' && { opacity: 0.4 }, d.gameId === (selectedDate ?? todayId) && { color: colors.accent }]}>
                  {d.gameId}{d.gameId === todayId ? ' (today)' : ''}
                </Text>
                <Text style={type.caption}>{d.status !== 'ready' ? 'generating' : d.userPlayed ? 'played ✓' : 'not played'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  big: { color: colors.text, fontSize: 40, fontWeight: '700' },
  cells: { flexDirection: 'row', gap: space.md },
  cell: { flex: 1, backgroundColor: colors.bg2, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  dist: { flexDirection: 'row', gap: space.xs, height: 70, alignItems: 'flex-end' },
  distCol: { flex: 1, height: '100%', alignItems: 'center', gap: 2 },
  distTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: colors.bg2, borderRadius: 3 },
  review: { borderLeftWidth: 3, backgroundColor: colors.bg1, borderRadius: radius.md, padding: space.sm, gap: space.xs },
  reviewLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: space.lg, gap: space.sm, maxHeight: '70%' },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md },
});
