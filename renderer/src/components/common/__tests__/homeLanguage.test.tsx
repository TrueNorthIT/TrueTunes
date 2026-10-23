import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { AddButton } from '../AddButton';
import { ArtCard } from '../ArtCard';
import { ChartHead, ChartRow } from '../ChartRow';
import { ImageTile } from '../ImageTile';
import { PersonCard } from '../PersonCard';
import { SectionCard, SeeAll } from '../SectionCard';
import { TrackRow } from '../TrackRow';
import { ArtistLinks } from '../TrackLinks';
import { useImage } from '../../../hooks/useImage';

vi.mock('../../../hooks/useImage', () => ({ useImage: vi.fn(() => null) }));
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: vi.fn(() => null) }));

describe('ArtistLinks', () => {
  it('keeps each comma with the name before it, so a wrapped line never starts with ", "', () => {
    const { container } = render(<ArtistLinks artist="Dr. Dre, Snoop Dogg, Kurupt" onOpenArtist={() => {}} />);
    expect(container.textContent).toBe('Dr. Dre, Snoop Dogg, Kurupt');
    const unit = (name: string) => screen.getByRole('button', { name: `${name}, open artist` }).textContent;
    expect(unit('Dr. Dre')).toBe('Dr. Dre,');
    expect(unit('Snoop Dogg')).toBe('Snoop Dogg,');
    expect(unit('Kurupt')).toBe('Kurupt');
  });
});

describe('AddButton', () => {
  it('is named, calls onClick and does not bubble', () => {
    const onClick = vi.fn();
    const outer = vi.fn();
    render(<div onClick={outer}><AddButton label="Add Blue to queue" onClick={onClick} /></div>);
    fireEvent.click(screen.getByRole('button', { name: 'Add Blue to queue' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('SectionCard', () => {
  it('labels the section by its title and renders actions', () => {
    const onSeeAll = vi.fn();
    render(
      <SectionCard title="Trending" actions={<SeeAll onClick={onSeeAll} />}>
        <p>body</p>
      </SectionCard>,
    );
    expect(screen.getByRole('region', { name: 'Trending' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(onSeeAll).toHaveBeenCalledOnce();
  });

  it('has no header without a title', () => {
    render(<SectionCard><p>body</p></SectionCard>);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('passes the wash through as --wash', () => {
    render(<SectionCard featured wash="1, 2, 3" title="T"><p>x</p></SectionCard>);
    expect(screen.getByRole('region').style.getPropertyValue('--wash')).toBe('1, 2, 3');
  });
});

describe('ArtCard', () => {
  it('opens on the cover button and keeps + from opening', () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    render(
      <ArtCard size="large" label="Because you play X" title="Blue" sub="Joni" openLabel="Open album Blue" onOpen={onOpen} onAdd={onAdd} />,
    );
    expect(screen.getByText('Because you play X')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open album Blue' }));
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Add Blue to queue' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('drops the cover once the photo has faded in, so only one image layer remains', () => {
    vi.mocked(useImage).mockImplementation((url) => (url ? `blob:${url}` : null));
    const { container } = render(
      <ArtCard size="medium" label="L" title="T" openLabel="Open" onOpen={() => {}} imageUrl="cover" photoUrl="photo" />,
    );
    expect(container.querySelectorAll('img')).toHaveLength(2);
    // jsdom has no AnimationEvent, so React listens for the prefixed name there; the browser fires animationend.
    const photo = container.querySelector('img[src="blob:photo"]')!;
    act(() => { photo.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true })); });
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('blob:photo');
    vi.mocked(useImage).mockImplementation(() => null);
  });
});

describe('TrackRow and ChartRow', () => {
  const artists = <ArtistLinks artist="A, B" onOpenArtist={() => {}} />;

  it('TrackRow: title button is named "Title, open album", + adds, right-click bubbles to the handler', () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    const onContextMenu = vi.fn();
    render(<ul><TrackRow title="Blue" artists={artists} reason="Never played" onOpen={onOpen} onAdd={onAdd} onContextMenu={onContextMenu} /></ul>);
    fireEvent.click(screen.getByRole('button', { name: 'Blue, open album' }));
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Add Blue to queue' }));
    expect(onAdd).toHaveBeenCalledOnce();
    fireEvent.contextMenu(screen.getByRole('listitem'));
    expect(onContextMenu).toHaveBeenCalledOnce();
    expect(screen.getByText('Never played')).toBeInTheDocument();
  });

  it('ChartRow: zero-pads the rank, shows the count, one link per artist', () => {
    const onOpenArtist = vi.fn();
    render(
      <ol>
        <ChartRow rank={3} title="Blue" artists={<ArtistLinks artist="A, B" onOpenArtist={onOpenArtist} />} count={12} onOpen={() => {}} />
      </ol>,
    );
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'B, open artist' }));
    expect(onOpenArtist).toHaveBeenCalledWith('B', false);
  });

  it('ChartHead is decorative', () => {
    const { container } = render(<ChartHead />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ImageTile', () => {
  it('opens on the tile and + does not open it', () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    render(<ImageTile size="sm" title="Blue" sub="Joni" meta="Today" onOpen={onOpen} onAdd={onAdd} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Blue/ }));
    expect(onOpen).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Add Blue to queue' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('PersonCard', () => {
  it('shows name and caption, opens the profile, renders children', () => {
    const onOpen = vi.fn();
    render(
      <PersonCard name="Alex" caption="3 albums this week" onOpen={onOpen}>
        <span>tiles</span>
      </PersonCard>,
    );
    expect(screen.getByText('3 albums this week')).toBeInTheDocument();
    expect(screen.getByText('tiles')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Open Alex's profile"));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
