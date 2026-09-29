// Renders a Genius description tree (GeniusDomNode) as native text. No HTML/marked in RN, so the
// tree is flattened by geniusToBlocks() into paragraphs of styled runs.
import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '../theme';
import { geniusToBlocks } from './detailLogic';

export function GeniusText({ node, maxBlocks }: { node: GeniusDomNode | null | undefined; maxBlocks?: number }) {
  const blocks = useMemo(() => geniusToBlocks(node), [node]);
  const shown = maxBlocks ? blocks.slice(0, maxBlocks) : blocks;
  if (!shown.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      {shown.map((b, i) => (
        <Text key={i} style={[type.secondary, styles.text, b.kind === 'heading' && styles.heading]}>
          {b.kind === 'li' ? '• ' : ''}
          {b.runs.map((r, j) => (
            <Text
              key={j}
              style={[
                r.bold && { fontWeight: '700' },
                r.italic && { fontStyle: 'italic' },
                r.href ? styles.link : null,
              ]}
              onPress={r.href ? () => void Linking.openURL(r.href!).catch(() => {}) : undefined}
            >
              {r.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { lineHeight: 20 },
  heading: { color: colors.text, fontWeight: '700' },
  link: { color: colors.accent },
});
