/* eslint-disable @typescript-eslint/no-deprecated */
import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

export const renderHook = <TResult>(hook: () => TResult) => {
  const result: { current: TResult | undefined } = {
    current: undefined,
  };

  const HookContainer = () => {
    const value = hook();

    useEffect(() => {
      result.current = value;
    });

    return null;
  };

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(HookContainer));
  });

  return {
    result: result as { current: TResult },
    rerender: () => {
      act(() => {
        renderer.update(React.createElement(HookContainer));
      });
    },
    unmount: () => {
      act(() => {
        renderer.unmount();
      });
    },
  };
};
