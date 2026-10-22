import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';

// Keeps the native placeholder on desktop and for assistive technology.
export const MobileSearchInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function MobileSearchInput(props, forwardedRef) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [metrics, setMetrics] = useState({ left: 0, right: 0, top: 0, travel: 0 });
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const measure = () => {
      const style = getComputedStyle(input);
      const left = parseFloat(style.paddingLeft);
      const right = parseFloat(style.paddingRight);
      const available = input.clientWidth - left - right;
      setMetrics({ left: input.offsetLeft + left, right, top: input.offsetTop + input.offsetHeight / 2,
        travel: Math.min(0, available - (textRef.current?.scrollWidth || 0)) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(input); measure();
    return () => observer.disconnect();
  }, [props.placeholder]);
  const show = !focused && !props.value;
  return <>
    <input {...props} ref={node => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }} className={`${props.className || ''} ${show ? 'mobile-search-empty' : ''}`}
    onFocus={event => { setFocused(true); props.onFocus?.(event); }}
    onBlur={event => { setFocused(false); props.onBlur?.(event); }} />
    <span aria-hidden="true" className={`mobile-search-example ${show ? '' : 'invisible'}`} style={{ left: metrics.left, right: metrics.right, top: metrics.top, '--search-travel': `${metrics.travel}px` } as React.CSSProperties}>
      <span ref={textRef} data-overflow={metrics.travel < 0}>{props.placeholder}</span>
    </span>
  </>;
});
