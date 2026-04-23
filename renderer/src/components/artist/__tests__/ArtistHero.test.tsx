import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistHero } from '../ArtistHero';
import type { SonosItem } from '../../../types/sonos';

vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: () => null }));
vi.mock('../../../hooks/useArtistBrowse', () => ({
  artistQueryOptions: vi.fn(() => ({ queryKey: ['artist-hero-test'], queryFn: async () => null, enabled: false })),
}));
vi.mock('../HeroTrackRow', () => ({
  HeroTrackRow: ({ track }: { track: { title: string } }) => <div>{track.title}</div>,
}));

const artistItem: SonosItem = {
  name: 'The Beatles',
  type: 'ARTIST',
  resource: {
    type: 'ARTIST',
    id: { objectId: 'art-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ArtistHero', () => {
  it('renders artist name', () => {
    render(<ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />, { wrapper });
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('shows placeholder tracks when no data loaded', () => {
    const { container } = render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper }
    );
    expect(container.querySelectorAll('[class*="heroTrackPh"]').length).toBe(6);
  });

  it('calls onOpen when hero header is clicked', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={onOpen} />, { wrapper });
    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(artistItem);
  });

  it('calls onOpen when Enter is pressed on hero header', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={onOpen} />, { wrapper });
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalled();
  });
});
