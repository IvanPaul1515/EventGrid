import { useEffect } from 'react';

// Safari's keyboard changes the visual viewport independently of 100dvh.
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // Pinch zoom must remain available without resizing the application around it.
      if (viewport.scale !== 1) return;
      document.documentElement.style.setProperty('--mobile-viewport-height', `${viewport.height}px`);
      document.documentElement.style.setProperty('--mobile-viewport-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--mobile-viewport-height');
      document.documentElement.style.removeProperty('--mobile-viewport-top');
    };
  }, []);
}
