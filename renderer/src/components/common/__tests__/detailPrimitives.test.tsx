import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroBand } from '../HeroBand';
import { PillButton } from '../PillButton';
import { EqBars } from '../EqBars';
import { TrackRow } from '../TrackRow';
import { ChartRow } from '../ChartRow';

vi.mock('../../../hooks/useImage', () => ({ useImage: vi.fn(() => null) }));

describe('HeroBand', () => {
  it('renders art, kind, title and children', () => {
    render(
      <HeroBand art={<img data-testid="art" alt="" src="x.jpg" />} kind="Album" title="Blue">
        <p>artist line</p>
      </HeroBand>
    );
    expect(screen.getByTestId('art')).toBeInTheDocument();
    expect(screen.getByText('Album')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Blue' })).toBeInTheDocument();
    expect(screen.getByText('artist line')).toBeInTheDocument();
  });

  it('washes in the artwork colour inline, and omits it without one', () => {
    const { container, rerender } = render(<HeroBand art={null} title="T" wash="10, 20, 30" />);
    expect((container.firstElementChild as HTMLElement).style.background).toContain('10, 20, 30');
    rerender(<HeroBand art={null} title="T" />);
    expect((container.firstElementChild as HTMLElement).style.background).toBe('');
  });

  it('makes the title click-to-edit only when asked', () => {
    const onTitleClick = vi.fn();
    const { rerender } = render(
      <HeroBand art={null} title="T" onTitleClick={onTitleClick} titleHint="Click to rename" />
    );
    fireEvent.click(screen.getByTitle('Click to rename'));
    expect(onTitleClick).toHaveBeenCalledOnce();
    rerender(<HeroBand art={null} title="T" />);
    expect(screen.queryByTitle('Click to rename')).toBeNull();
  });
});

describe('PillButton', () => {
  it('renders its label as a button and fires onClick', () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Play all</PillButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to a ghost, non-submitting button', () => {
    render(<PillButton>Join</PillButton>);
    const b = screen.getByRole('button', { name: 'Join' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b.className).toContain('ghost');
  });

  it.each(['primary', 'ghost', 'danger'] as const)('applies the %s variant', (variant) => {
    render(<PillButton variant={variant}>x</PillButton>);
    expect(screen.getByRole('button').className).toContain(variant);
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <PillButton disabled onClick={onClick}>
        Delete
      </PillButton>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('EqBars', () => {
  it('renders three decorative bars', () => {
    const { container } = render(<EqBars />);
    const eq = container.firstElementChild as HTMLElement;
    expect(eq).toHaveAttribute('aria-hidden', 'true');
    expect(eq.children).toHaveLength(3);
  });

  it('takes an extra class', () => {
    const { container } = render(<EqBars className="mine" />);
    expect(container.firstElementChild?.className).toContain('mine');
  });
  // Reduced motion is pure CSS (a media query in EqBars.module.css), so there is no JS branch to test.
});

describe('TrackRow: optional props', () => {
  it('names the attribution avatar and opens the profile without opening the row', () => {
    const onOpenProfile = vi.fn();
    const onClick = vi.fn();
    render(
      <ul>
        <TrackRow title="Blue" onClick={onClick} attribution={{ user: 'Alex', onOpen: onOpenProfile }} />
      </ul>
    );
    const who = screen.getByRole('button', { name: 'Added by Alex' });
    expect(who).toHaveAttribute('title', 'Added by Alex');
    fireEvent.click(who);
    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('accepts a custom attribution label', () => {
    render(
      <ul>
        <TrackRow title="Blue" attribution={{ user: 'Alex', label: 'Queued by Alex', onOpen: () => {} }} />
      </ul>
    );
    expect(screen.getByRole('button', { name: 'Queued by Alex' })).toBeInTheDocument();
  });

  it('onRemove fires, is titled "Remove", and does not click the row', () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    render(
      <ul>
        <TrackRow title="Blue" onClick={onClick} onRemove={onRemove} />
      </ul>
    );
    const btn = screen.getByTitle('Remove');
    expect(btn).toHaveAccessibleName('Remove Blue');
    fireEvent.click(btn);
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no remove or attribution controls by default', () => {
    render(
      <ul>
        <TrackRow title="Blue" />
      </ul>
    );
    expect(screen.queryByTitle('Remove')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Added by/ })).toBeNull();
  });

  it('is draggable only with onDragStart, which fires; handle shows a grip', () => {
    const onDragStart = vi.fn();
    const { rerender } = render(
      <ul>
        <TrackRow title="Blue" />
      </ul>
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute('draggable');
    expect(screen.getByRole('listitem').textContent).not.toContain('⠿');

    rerender(
      <ul>
        <TrackRow title="Blue" onDragStart={onDragStart} handle />
      </ul>
    );
    const li = screen.getByRole('listitem');
    expect(li).toHaveAttribute('draggable', 'true');
    expect(li.textContent).toContain('⠿');
    fireEvent.dragStart(li);
    expect(onDragStart).toHaveBeenCalledOnce();
  });

  it('forwards dragOver, drop and dragEnd', () => {
    const onDragOver = vi.fn();
    const onDrop = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <ul>
        <TrackRow title="Blue" onDragStart={() => {}} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd} />
      </ul>
    );
    const li = screen.getByRole('listitem');
    fireEvent.dragOver(li);
    fireEvent.drop(li);
    fireEvent.dragEnd(li);
    expect(onDragOver).toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalled();
    expect(onDragEnd).toHaveBeenCalled();
  });

  it('marks selected and playing', () => {
    const { rerender } = render(
      <ul>
        <TrackRow title="Blue" />
      </ul>
    );
    expect(screen.getByRole('listitem').className).not.toContain('selected');
    expect(screen.getByRole('listitem').className).not.toContain('playing');
    rerender(
      <ul>
        <TrackRow title="Blue" selected playing />
      </ul>
    );
    expect(screen.getByRole('listitem').className).toContain('selected');
    expect(screen.getByRole('listitem').className).toContain('playing');
  });

  it('onOpen is optional: without it the title is plain text, with it a named button', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <ul>
        <TrackRow title="Blue" />
      </ul>
    );
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Blue, open album' })).toBeNull();
    rerender(
      <ul>
        <TrackRow title="Blue" onOpen={onOpen} />
      </ul>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Blue, open album' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('renders lead, aside, trailing, explicit, and omits artists and art when asked', () => {
    const { container } = render(
      <ul>
        <TrackRow title="Blue" lead={3} aside="Abbey Road" trailing="4:19" explicit showArt={false} />
      </ul>
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
    expect(screen.getByText('4:19')).toBeInTheDocument();
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
    expect(container.querySelector('[class*="artBtn"]')).toBeNull();
  });
});

describe('ChartRow: optional props', () => {
  it('renders without a count, showing meta instead and no count tooltip', () => {
    render(
      <ol>
        <ChartRow rank={2} title="Blue" artists="A" meta="3:21" onOpen={() => {}} />
      </ol>
    );
    const meta = screen.getByText('3:21');
    expect(meta).not.toHaveAttribute('title');
  });

  it('rankSlot replaces the zero-padded rank', () => {
    render(
      <ol>
        <ChartRow rank={2} title="Blue" artists="A" count={1} rankSlot={<b>NOW</b>} onOpen={() => {}} />
      </ol>
    );
    expect(screen.getByText('NOW')).toBeInTheDocument();
    expect(screen.queryByText('02')).toBeNull();
  });

  it('marks selected and playing, and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <ol>
        <ChartRow rank={1} title="Blue" artists="A" count={5} selected playing onClick={onClick} onOpen={() => {}} />
      </ol>
    );
    const li = screen.getByRole('listitem');
    expect(li.className).toContain('selected');
    expect(li.className).toContain('playing');
    fireEvent.click(li);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is draggable only with onDragStart, which fires', () => {
    const onDragStart = vi.fn();
    const { rerender } = render(
      <ol>
        <ChartRow rank={1} title="Blue" artists="A" count={5} onOpen={() => {}} />
      </ol>
    );
    expect(screen.getByRole('listitem')).not.toHaveAttribute('draggable');
    rerender(
      <ol>
        <ChartRow rank={1} title="Blue" artists="A" count={5} onDragStart={onDragStart} onOpen={() => {}} />
      </ol>
    );
    fireEvent.dragStart(screen.getByRole('listitem'));
    expect(screen.getByRole('listitem')).toHaveAttribute('draggable', 'true');
    expect(onDragStart).toHaveBeenCalledOnce();
  });
});
