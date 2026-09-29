import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tierEmoji } from '../../../logic/lib/socialFormat';
import type { RankSnapshot, Side } from '../../../logic/lib/queuedleLogic';
import { Art } from '../../Art';
import { Button } from '../common';
import { colors, radius, space, type } from '../../theme';

const catLabel = (c: GameItemCategory) => (c === 'track' ? 'Track' : c === 'artist' ? 'Artist' : 'Album');

export function QueuedleIntro({ onStart }: { onStart: () => void }) {
  const rules = [
    ['Round 1 - Higher or Lower', "Two tracks, artists, or albums face off. Pick the one that's been queued more times in the office. The winner carries over and faces a new challenger in the next round."],
    ['Round 2 - Top Queuer', 'For each winning item, guess which colleague has played it the most.'],
    ['Score', 'One point per correct answer in each round. Come back tomorrow for a new Queuedle.'],
  ];
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Text style={type.title}>Welcome to Queuedle</Text>
        <Text style={type.secondary}>The daily office music guessing game.</Text>
      </View>
      {rules.map(([t, b]) => (
        <View key={t} style={styles.card}>
          <Text style={type.heading}>{t}</Text>
          <Text style={type.secondary}>{b}</Text>
        </View>
      ))}
      <Button label="Start" onPress={onStart} />
    </View>
  );
}

function SideCard({
  item, side, revealed, isWinner, isCarryover, pickedSide, onPick,
}: {
  item: GameItem; side: Side; revealed: boolean; isWinner: boolean; isCarryover: boolean; pickedSide: Side | null; onPick: (s: Side) => void;
}) {
  const wrong = revealed && pickedSide === side && !isWinner;
  const right = revealed && pickedSide === side && isWinner;
  const pickLabel = item.category === 'track' ? 'Pick song' : item.category === 'artist' ? 'Pick artist' : 'Pick album';
  return (
    <View style={[styles.side, revealed && isWinner && { borderColor: colors.success }, revealed && !isWinner && { opacity: 0.6 }, wrong && { borderColor: colors.danger }, right && { backgroundColor: 'rgba(48,209,88,0.12)' }]}>
      <Text style={styles.badge}>{catLabel(item.category)}</Text>
      <Art uri={item.imageUrl} size={110} />
      <Text style={[type.body, { textAlign: 'center', fontWeight: '600' }]} numberOfLines={2}>{item.name}</Text>
      {!!item.subtitle && <Text style={[type.caption, { textAlign: 'center' }]} numberOfLines={2}>{item.subtitle}</Text>}
      {(revealed || isCarryover) && (
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.count}>{item.count}</Text>
          <Text style={type.caption}>queues</Text>
        </View>
      )}
      {!revealed && (
        <Pressable style={[styles.pick, pickedSide !== null && { opacity: 0.4 }]} disabled={pickedSide !== null} onPress={() => onPick(side)}>
          <Text style={type.body}>{pickLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function QueuedleQuestionCard({
  question, revealed, pickedSide, onPick, onNext,
}: {
  question: GameQuestion; revealed: boolean; pickedSide: Side | null; onPick: (s: Side) => void; onNext: () => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.qRow}>
        <SideCard item={question.left} side="left" revealed={revealed} isWinner={question.winner === 'left'} isCarryover={question.carryover === 'left'} pickedSide={pickedSide} onPick={onPick} />
        <Text style={styles.vs}>VS</Text>
        <SideCard item={question.right} side="right" revealed={revealed} isWinner={question.winner === 'right'} isCarryover={question.carryover === 'right'} pickedSide={pickedSide} onPick={onPick} />
      </View>
      {revealed && <Button label="Next" onPress={onNext} />}
    </View>
  );
}

function ItemHead({ item }: { item: GameItem }) {
  return (
    <View style={styles.itemHead}>
      <Art uri={item.imageUrl} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>{item.name}</Text>
        <Text style={type.caption} numberOfLines={1}>
          {catLabel(item.category)}{item.subtitle && item.category !== 'artist' ? ` · ${item.subtitle}` : ''}
        </Text>
      </View>
    </View>
  );
}

export function QueuedleBonusScreen({
  winningItems, selections, onSelect, onSubmit, submitting,
}: {
  winningItems: GameItem[]; selections: (string | null)[]; onSelect: (i: number, name: string) => void; onSubmit: () => void; submitting: boolean;
}) {
  const all = selections.length > 0 && selections.every((s) => s !== null);
  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: 'center' }}>
        <Text style={type.title}>Bonus round</Text>
        <Text style={type.secondary}>For each winning entry, pick who has queued it the most.</Text>
      </View>
      {winningItems.map((item, i) => (
        <View key={`${item.category}:${item.id}:${i}`} style={styles.card}>
          <ItemHead item={item} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {item.queuerCandidates.map((name) => (
              <Pressable key={name} disabled={submitting} onPress={() => onSelect(i, name)} style={[styles.chip, selections[i] === name && styles.chipActive]}>
                <Text style={type.body}>{name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ))}
      <Button label={submitting ? 'Submitting...' : 'Submit'} onPress={onSubmit} disabled={!all || submitting} />
    </View>
  );
}

export function QueuedleBonusResults({
  winningItems, bonusGuesses, onContinue,
}: {
  winningItems: GameItem[]; bonusGuesses: string[]; onContinue: () => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ alignItems: 'center' }}>
        <Text style={type.title}>Bonus results</Text>
        <Text style={type.secondary}>How well do you know your colleagues' taste?</Text>
      </View>
      {winningItems.map((item, i) => {
        const guess = bonusGuesses[i] ?? '';
        const ok = guess === item.topQueuer;
        return (
          <View key={`${item.category}:${item.id}:${i}`} style={styles.card}>
            <ItemHead item={item} />
            <Text style={{ color: ok ? colors.success : colors.danger, fontSize: 15 }}>{ok ? '✓' : '✗'} {guess || '-'}</Text>
            {!ok && <Text style={type.caption}>Correct answer: {item.topQueuer}</Text>}
          </View>
        );
      })}
      <Button label="See my score" onPress={onContinue} />
    </View>
  );
}

/** Text-only rank change (desktop animates a tween and shows rank art). */
export function QueuedleRankChange({ before, after, onContinue }: { before: RankSnapshot | null; after: RankSnapshot; onContinue: () => void }) {
  const delta = before ? after.rating - before.rating : 0;
  const tierChanged = !!before && before.tierKey !== after.tierKey;
  return (
    <View style={{ alignItems: 'center', gap: space.md }}>
      <Text style={type.title}>Your rank</Text>
      <Text style={{ fontSize: 56 }}>{after.isProvisional ? '🎵' : tierEmoji(after.tierKey)}</Text>
      <Text style={type.heading}>{after.isProvisional ? 'Provisional' : after.tierName}</Text>
      <Text style={styles.count}>{after.rating}</Text>
      {before && <Text style={{ color: delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.text2 }}>{delta > 0 ? `+${delta}` : `${delta}`}</Text>}
      {tierChanged && <Text style={type.secondary}>{before!.tierName} → {after.tierName}</Text>}
      <Text style={type.caption}>{after.averagePercent.toFixed(0)}% average · {after.gamesPlayed} {after.gamesPlayed === 1 ? 'game' : 'games'}</Text>
      <View style={{ alignSelf: 'stretch' }}><Button label="Continue" onPress={onContinue} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  qRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
  vs: { alignSelf: 'center', color: colors.text3, fontWeight: '700', fontSize: 12 },
  side: { flex: 1, backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.md, gap: space.sm, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  badge: { color: colors.text3, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  count: { color: colors.text, fontSize: 28, fontWeight: '700' },
  pick: { backgroundColor: colors.bg2, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, alignSelf: 'stretch', alignItems: 'center', marginTop: 'auto' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chip: { backgroundColor: colors.bg2, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.sm },
  chipActive: { backgroundColor: colors.accent },
});
