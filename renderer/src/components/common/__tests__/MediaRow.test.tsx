import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaRow } from '../MediaRow';

vi.mock('../../../hooks/useImage', () => ({
  useImage: vi.fn(() => null),
}));

import { useImage } from '../../../hooks/useImage';
const mockUseImage = vi.mocked(useImage);

beforeEach(() => {
  mockUseImage.mockReturnValue(null);
});

describe('MediaRow', () => {
  describe('name', () => {
    it('renders the name text', () => {
      render(<MediaRow name="Bohemian Rhapsody" />);
      expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    });
  });

  describe('subtitle', () => {
    it('renders string subtitle', () => {
      render(<MediaRow name="Track" subtitle="Queen" />);
      expect(screen.getByText('Queen')).toBeInTheDocument();
    });

    it('renders JSX subtitle', () => {
      render(
        <MediaRow
          name="Track"
          subtitle={<button>Artist Name</button>}
        />
      );
      expect(screen.getByRole('button', { name: 'Artist Name' })).toBeInTheDocument();
    });

    it('renders nothing for subtitle when not provided', () => {
      const { container } = render(<MediaRow name="Track" />);
      expect(container.querySelector('.sub')).toBeNull();
    });
  });

  describe('explicit badge', () => {
    it('renders ExplicitBadge when explicit is true', () => {
      render(<MediaRow name="Track" explicit />);
      expect(screen.getByText('E')).toBeInTheDocument();
    });

    it('does not render ExplicitBadge when explicit is false', () => {
      render(<MediaRow name="Track" explicit={false} />);
      expect(screen.queryByText('E')).toBeNull();
    });

    it('does not render ExplicitBadge when explicit is not provided', () => {
      render(<MediaRow name="Track" />);
      expect(screen.queryByText('E')).toBeNull();
    });
  });

  describe('add button', () => {
    it('renders add button when onAdd is provided', () => {
      const onAdd = vi.fn();
      render(<MediaRow name="Track" onAdd={onAdd} />);
      expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument();
    });

    it('does not render add button when onAdd is not provided', () => {
      render(<MediaRow name="Track" />);
      expect(screen.queryByRole('button', { name: '+' })).toBeNull();
    });

    it('calls onAdd when add button is clicked', () => {
      const onAdd = vi.fn();
      render(<MediaRow name="Track" onAdd={onAdd} />);
      fireEvent.click(screen.getByRole('button', { name: '+' }));
      expect(onAdd).toHaveBeenCalledOnce();
    });

    it('does not trigger row onClick when add button is clicked', () => {
      const onClick = vi.fn();
      const onAdd = vi.fn();
      render(<MediaRow name="Track" onClick={onClick} onAdd={onAdd} />);
      fireEvent.click(screen.getByRole('button', { name: '+' }));
      expect(onAdd).toHaveBeenCalledOnce();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe('isPlaying', () => {
    it('sets data-playing attribute when isPlaying is true', () => {
      const { container } = render(<MediaRow name="Track" isPlaying />);
      expect(container.firstChild).toHaveAttribute('data-playing', 'true');
    });

    it('does not set data-playing when isPlaying is false', () => {
      const { container } = render(<MediaRow name="Track" isPlaying={false} />);
      expect(container.firstChild).not.toHaveAttribute('data-playing');
    });

    it('does not set data-playing when isPlaying is not provided', () => {
      const { container } = render(<MediaRow name="Track" />);
      expect(container.firstChild).not.toHaveAttribute('data-playing');
    });
  });

  describe('leading and trailing slots', () => {
    it('renders leading content', () => {
      render(<MediaRow name="Track" leading={<span>1</span>} />);
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('renders trailing content', () => {
      render(<MediaRow name="Track" trailing={<span>3:45</span>} />);
      expect(screen.getByText('3:45')).toBeInTheDocument();
    });

    it('does not render leading slot when not provided', () => {
      const { container } = render(<MediaRow name="Track" />);
      expect(container.querySelector('.leading')).toBeNull();
    });

    it('does not render trailing slot when not provided', () => {
      const { container } = render(<MediaRow name="Track" />);
      expect(container.querySelector('.trailing')).toBeNull();
    });
  });

  describe('art', () => {
    it('shows art placeholder when useImage returns null', () => {
      mockUseImage.mockReturnValue(null);
      render(<MediaRow name="Track" artUrl="https://example.com/art.jpg" />);
      expect(screen.getByText('♪')).toBeInTheDocument();
      expect(screen.queryByRole('img')).toBeNull();
    });

    it('shows img element when useImage returns a URL', () => {
      mockUseImage.mockReturnValue('blob:data:...');
      const { container } = render(<MediaRow name="Track" artUrl="https://example.com/art.jpg" />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'blob:data:...');
    });
  });

  describe('click handler', () => {
    it('calls onClick when row is clicked', () => {
      const onClick = vi.fn();
      const { container } = render(<MediaRow name="Track" onClick={onClick} />);
      fireEvent.click(container.firstChild as Element);
      expect(onClick).toHaveBeenCalledOnce();
    });
  });
});
