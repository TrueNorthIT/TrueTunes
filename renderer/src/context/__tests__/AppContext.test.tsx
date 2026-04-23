import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useAppContext } from '../AppContext';

function Consumer() {
  const { isAuthed, setIsAuthed, activeGroupId, setActiveGroupId } = useAppContext();
  return (
    <>
      <div data-testid="authed">{String(isAuthed)}</div>
      <div data-testid="group">{activeGroupId ?? 'null'}</div>
      <button onClick={() => setIsAuthed(true)}>auth</button>
      <button onClick={() => setActiveGroupId('g-1')}>group</button>
    </>
  );
}

describe('AppContext', () => {
  it('provides default isAuthed=false', () => {
    render(<AppProvider><Consumer /></AppProvider>);
    expect(screen.getByTestId('authed').textContent).toBe('false');
  });

  it('provides default activeGroupId=null', () => {
    render(<AppProvider><Consumer /></AppProvider>);
    expect(screen.getByTestId('group').textContent).toBe('null');
  });

  it('setIsAuthed updates the value', () => {
    render(<AppProvider><Consumer /></AppProvider>);
    act(() => { screen.getByRole('button', { name: 'auth' }).click(); });
    expect(screen.getByTestId('authed').textContent).toBe('true');
  });

  it('setActiveGroupId updates the value', () => {
    render(<AppProvider><Consumer /></AppProvider>);
    act(() => { screen.getByRole('button', { name: 'group' }).click(); });
    expect(screen.getByTestId('group').textContent).toBe('g-1');
  });

  it('useAppContext throws when used outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow('useAppContext must be used within AppProvider');
    spy.mockRestore();
  });
});
