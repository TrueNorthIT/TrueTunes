import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Carousel } from '../Carousel';

// jsdom has no layout: fake overflow so the arrows render
const setOverflow = (on: boolean) => {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(on ? 1000 : 100);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Carousel', () => {
  it('renders title, actions and children', () => {
    render(
      <Carousel title="Albums" actions={<button>+ New</button>}>
        <div>one</div>
        <div>two</div>
      </Carousel>
    );
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeTruthy();
    expect(screen.getByText('+ New')).toBeTruthy();
    expect(screen.getByText('two')).toBeTruthy();
  });

  it('labels arrows when content overflows; start arrow disabled at start', () => {
    setOverflow(true);
    render(
      <Carousel title="x">
        <div>a</div>
      </Carousel>
    );
    expect((screen.getByRole('button', { name: 'Scroll left' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Scroll right' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('hides arrows when content fits', () => {
    setOverflow(false);
    render(
      <Carousel title="x">
        <div>a</div>
      </Carousel>
    );
    expect(screen.queryByRole('button', { name: 'Scroll left' })).toBeNull();
  });

  describe('search', () => {
    it('is absent without the prop', () => {
      render(
        <Carousel title="x">
          <div>a</div>
        </Carousel>
      );
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('renders the input, reports typing, and clears with the button and Esc', async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <Carousel title="x" search={{ value: '', onChange, placeholder: 'Find' }}>
          <div>a</div>
        </Carousel>
      );
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
      await user.type(screen.getByRole('textbox', { name: 'Find' }), 'q');
      expect(onChange).toHaveBeenLastCalledWith('q');

      rerender(
        <Carousel title="x" search={{ value: 'q', onChange, status: 'searching tracks…' }}>
          <div>a</div>
        </Carousel>
      );
      expect(screen.getByText('searching tracks…')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(onChange).toHaveBeenLastCalledWith('');
      onChange.mockClear();
      screen.getByRole('textbox').focus();
      await user.keyboard('{Escape}');
      expect(onChange).toHaveBeenCalledWith('');
    });
  });
});
