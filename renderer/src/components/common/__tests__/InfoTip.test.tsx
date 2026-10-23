import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfoTip } from '../InfoTip';

// Production code under test: renderer/src/components/common/InfoTip.tsx (does not exist yet).
// InfoTip is the small info button + tooltip used for "Why this pick" on Home pick cards, Discover act
// cards and the DJ's upcoming rows. It renders <button type="button" aria-label={label}> and a
// role="tooltip" element (holding children) linked by aria-describedby.
// "Hidden" below means the role="tooltip" element is absent from, or not exposed in, the accessibility
// tree (unmounted, `hidden` attribute or display:none) — `queryByRole` ignores inaccessible elements.

function setup(props: Partial<React.ComponentProps<typeof InfoTip>> = {}) {
  render(
    <InfoTip label="Why this pick" {...props}>
      <p>Rich — queued them 14 times</p>
    </InfoTip>,
  );
  return { button: screen.getByRole('button', { name: 'Why this pick' }), user: userEvent.setup() };
}

describe('InfoTip', () => {
  it('REQ-W1: renders a type="button" labelled with the label prop, with the tooltip hidden to start with', () => {
    const { button } = setup();
    expect(button, 'Expected a button named "Why this pick"').toHaveAttribute('type', 'button');
    expect(screen.queryByRole('tooltip'), 'Expected the tooltip to be hidden until hovered or focused').toBeNull();
  });

  it('REQ-W1: hovering the info icon shows the tooltip with its children', async () => {
    const { button, user } = setup();
    await user.hover(button);
    expect(screen.getByRole('tooltip'), 'Expected hover (mouseenter) to show the tooltip').toHaveTextContent(
      'Rich — queued them 14 times',
    );
  });

  it('REQ-W1: moving the pointer away hides the tooltip', async () => {
    const { button, user } = setup();
    await user.hover(button);
    await user.unhover(button);
    expect(screen.queryByRole('tooltip'), 'Expected mouseleave to hide the tooltip').toBeNull();
  });

  it('REQ-W9: tabbing to the info icon shows the tooltip', async () => {
    const { button, user } = setup();
    await user.tab();
    expect(button, 'Expected Tab to move focus to the info button').toHaveFocus();
    expect(screen.getByRole('tooltip'), 'Expected keyboard focus to show the tooltip').toHaveTextContent(
      'Rich — queued them 14 times',
    );
  });

  it('REQ-W9: tabbing away (blur) hides the tooltip', async () => {
    const { user } = setup();
    await user.tab();
    await user.tab();
    expect(screen.queryByRole('tooltip'), 'Expected blur to hide the tooltip').toBeNull();
  });

  it('REQ-W9: Escape hides the tooltip while the info button keeps focus', async () => {
    const { button, user } = setup();
    await user.tab();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip'), 'Expected Escape to hide the tooltip').toBeNull();
    expect(button, 'Expected focus to stay on the button after Escape').toHaveFocus();
  });

  it('REQ-W9: Escape hides a tooltip that was opened by hovering', async () => {
    const { button, user } = setup();
    await user.hover(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip'), 'Expected Escape to hide a hover-opened tooltip').toBeNull();
  });

  it('REQ-W9: the button is described by the tooltip so a screen reader reads its text', async () => {
    const { button, user } = setup();
    await user.hover(button);
    const tooltip = screen.getByRole('tooltip');
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy, 'Expected aria-describedby on the button while the tooltip is shown').toBeTruthy();
    expect(tooltip.id, "Expected the tooltip id to match the button's aria-describedby").toBe(describedBy);
    expect(button).toHaveAccessibleDescription('Rich — queued them 14 times');
  });

  it("REQ-W8: clicking the info icon does not trigger a parent card's onClick", async () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <InfoTip label="Why this pick">
          <p>Why</p>
        </InfoTip>
      </div>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Why this pick' }));
    expect(onCardClick, 'Expected clicking the info icon not to open the card or queue anything').not.toHaveBeenCalled();
  });

  it('shows the default info icon inside the button', () => {
    const { button } = setup();
    expect(button.querySelector('svg'), 'Expected the default lucide Info icon (an svg) in the button').not.toBeNull();
    expect(screen.queryByTestId('custom-icon')).toBeNull();
  });

  it('REQ-W7: a custom icon replaces the default one (the DJ icon becomes the trigger)', () => {
    const { button } = setup({ icon: <svg data-testid="custom-icon" /> });
    expect(button.querySelector('[data-testid="custom-icon"]'), 'Expected the custom icon inside the button').not.toBeNull();
    expect(button.querySelectorAll('svg'), 'Expected only the custom icon, not the default as well').toHaveLength(1);
  });

  it('applies className so callers can position the tip', () => {
    const { container } = render(
      <InfoTip label="Why this pick" className="my-tip">
        <p>Why</p>
      </InfoTip>,
    );
    expect(container.querySelector('.my-tip'), 'Expected className to be applied to an element in the InfoTip').not.toBeNull();
  });
});
