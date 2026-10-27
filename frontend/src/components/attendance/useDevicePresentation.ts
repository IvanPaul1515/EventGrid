import { useEffect, useState } from 'react';
import { DevicePresentation, inferDevicePresentation } from '../../utils/devicePresentation';

function detect(): DevicePresentation {
  return inferDevicePresentation({ width: window.innerWidth, height: window.innerHeight, screenShortSide: Math.min(screen.width, screen.height), touchPoints: navigator.maxTouchPoints || 0,
    coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(any-pointer: fine)').matches,
    hover: matchMedia('(any-hover: hover)').matches,
    mobileHint: (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile });
}

export function useDevicePresentation() {
  const [detected, setDetected] = useState<DevicePresentation>(detect);
  const [override, setOverride] = useState(() => { try { const value = sessionStorage.getItem('eventgrid:device-presentation') || ''; return ['desktop','phone'].includes(value) ? value : ''; } catch { return ''; } });
  useEffect(() => {
    const update = () => setDetected(detect()); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const choose = (value: string) => {
    if (!['', 'desktop', 'phone'].includes(value)) return;
    setOverride(value); try { sessionStorage.setItem('eventgrid:device-presentation', value); } catch {}
  };
  return { device: detected === 'ambiguous' ? override || detected : detected, detected, override, choose };
}
