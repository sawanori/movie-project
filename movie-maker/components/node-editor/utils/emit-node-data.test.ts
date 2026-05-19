import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitNodeDataUpdate } from './emit-node-data';

describe('emitNodeDataUpdate', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  it('dispatches a CustomEvent named "nodeDataUpdate" with { nodeId, updates } detail', () => {
    emitNodeDataUpdate('node-1', { text: 'hello' });

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('nodeDataUpdate');
    expect(event.detail).toEqual({
      nodeId: 'node-1',
      updates: { text: 'hello' },
    });
  });

  it('supports partial generic updates', () => {
    interface SampleData {
      foo: string;
      bar: number;
      baz: boolean;
    }

    emitNodeDataUpdate<SampleData>('node-2', { bar: 42 });

    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail.nodeId).toBe('node-2');
    expect(event.detail.updates).toEqual({ bar: 42 });
  });

  it('dispatches each call as a separate event', () => {
    emitNodeDataUpdate('a', { x: 1 });
    emitNodeDataUpdate('b', { y: 2 });

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect((dispatchSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      nodeId: 'a',
      updates: { x: 1 },
    });
    expect((dispatchSpy.mock.calls[1][0] as CustomEvent).detail).toEqual({
      nodeId: 'b',
      updates: { y: 2 },
    });
  });
});
