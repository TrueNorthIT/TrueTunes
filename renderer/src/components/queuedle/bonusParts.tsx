import styles from '../../styles/Queuedle.module.css';

/** Row art for a winner: a circle for artists, a rounded square otherwise. */
export function BonusItemArt({ item }: { item: GameItem }) {
  const cls = `${styles.bonusArt}${item.category === 'artist' ? ' ' + styles.round : ''}`;
  return item.imageUrl ? <img className={cls} src={item.imageUrl} alt="" loading="lazy" /> : <span className={cls} />;
}
