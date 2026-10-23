interface Props {
  /** The resolved image URL (from `useImage`); the ♪ placeholder shows until there is one. */
  src: string | null | undefined;
  /** For the `<img>`. */
  className?: string;
  /** For the ♪ placeholder, which each caller sizes and centres itself. */
  placeholderClassName?: string;
  lazy?: boolean;
}

/** Cover art, or a ♪ placeholder. Callers own the frame and the class names. */
export function Artwork({ src, className, placeholderClassName, lazy }: Props) {
  return src
    ? <img className={className} src={src} alt="" loading={lazy ? 'lazy' : undefined} />
    : <span className={placeholderClassName}>♪</span>;
}
