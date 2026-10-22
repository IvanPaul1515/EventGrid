import { useEffect } from 'react';

// Safari's keyboard changes the visual viewport independently of 100dvh.
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    let timer = 0;
    const revealFocusedField = () => {
      if (!window.matchMedia('(max-width: 1023px) and (pointer: coarse), (max-width: 767px)').matches || viewport.scale !== 1) return;
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !field.matches('input, select, textarea')) return;
      let container = field.parentElement;
      while (container && container !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight) {
          const rect = field.getBoundingClientRect();
          const bounds = container.getBoundingClientRect();
          const top = Math.max(bounds.top, viewport.offsetTop) + 16;
          const bottom = Math.min(bounds.bottom, viewport.offsetTop + viewport.height) - 20;
          const delta = rect.bottom > bottom ? rect.bottom - bottom : rect.top < top ? rect.top - top : 0;
          if (delta) container.scrollTop += delta;
          break;
        }
        container = container.parentElement;
      }
    };
    const scheduleReveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(revealFocusedField); });
      clearTimeout(timer);
      timer = window.setTimeout(revealFocusedField, 300);
    };
    const update = () => {
      // Pinch zoom must remain available without resizing the application around it.
      if (viewport.scale !== 1) return;
      document.documentElement.style.setProperty('--mobile-viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--mobile-viewport-top', `${viewport.offsetTop}px`);
      scheduleReveal();
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', scheduleReveal);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', scheduleReveal);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      document.documentElement.style.removeProperty('--mobile-viewport-height');
      document.documentElement.style.removeProperty('--mobile-viewport-top');
    };
  }, []);
}
