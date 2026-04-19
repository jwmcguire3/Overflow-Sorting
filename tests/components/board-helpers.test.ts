import { describe, expect, it } from 'vitest';

import {
  findFrameIndexAtPoint,
  frameContainsPoint,
  type Frame,
} from '../../src/components/board-helpers';

describe('board helpers', () => {
  const frames: ReadonlyArray<Frame> = [
    { x: 10, y: 20, width: 100, height: 80 },
    { x: 130, y: 20, width: 100, height: 80 },
  ];

  it('frameContainsPoint includes frame edges', () => {
    expect(frameContainsPoint(frames[0] as Frame, { x: 10, y: 20 })).toBe(true);
    expect(frameContainsPoint(frames[0] as Frame, { x: 110, y: 100 })).toBe(true);
    expect(frameContainsPoint(frames[0] as Frame, { x: 111, y: 100 })).toBe(false);
  });

  it('findFrameIndexAtPoint returns the hovered frame index', () => {
    expect(findFrameIndexAtPoint(frames, { x: 45, y: 60 })).toBe(0);
    expect(findFrameIndexAtPoint(frames, { x: 175, y: 60 })).toBe(1);
    expect(findFrameIndexAtPoint(frames, { x: 260, y: 60 })).toBe(-1);
  });
});
