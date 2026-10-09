import { describe, expect, it, vi } from 'vitest';
import { EventHub } from '../events';

type Ev = { ready: []; groups: [string[]]; msg: [string, number] };

describe('EventHub', () => {
  it('delivers events to current listeners with their arguments', () => {
    const hub = new EventHub<Ev>();
    const cb = vi.fn();
    hub.on('msg', cb);
    hub.emit('msg', 'a', 1);
    expect(cb).toHaveBeenCalledWith('a', 1);
  });

  it('replays the last sticky payload to a late subscriber', () => {
    const hub = new EventHub<Ev>(['groups', 'ready']);
    hub.emit('groups', ['x']);
    hub.emit('groups', ['y']);
    hub.emit('ready');
    const groups = vi.fn();
    const ready = vi.fn();
    hub.on('groups', groups);
    hub.on('ready', ready);
    expect(groups).toHaveBeenCalledTimes(1);
    expect(groups).toHaveBeenCalledWith(['y']);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('does not replay non-sticky channels', () => {
    const hub = new EventHub<Ev>(['groups']);
    hub.emit('msg', 'gone', 0);
    const cb = vi.fn();
    hub.on('msg', cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('a late subscriber then also receives subsequent live events', () => {
    const hub = new EventHub<Ev>(['groups']);
    hub.emit('groups', ['old']);
    const cb = vi.fn();
    hub.on('groups', cb);
    hub.emit('groups', ['new']);
    expect(cb.mock.calls).toEqual([[['old']], [['new']]]);
  });

  it('unsubscribe stops delivery', () => {
    const hub = new EventHub<Ev>();
    const cb = vi.fn();
    const off = hub.on('msg', cb);
    off();
    hub.emit('msg', 'a', 1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('clear() drops the sticky value so it is not replayed', () => {
    const hub = new EventHub<Ev>(['ready']);
    hub.emit('ready');
    hub.clear('ready');
    const cb = vi.fn();
    hub.on('ready', cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('a listener unsubscribing during emit does not break the others', () => {
    const hub = new EventHub<Ev>();
    const second = vi.fn();
    const off = hub.on('msg', () => off());
    hub.on('msg', second);
    hub.emit('msg', 'a', 1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
