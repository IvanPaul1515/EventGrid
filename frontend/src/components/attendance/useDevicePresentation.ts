import { useEffect, useState } from 'react';
import { DevicePresentation, inferDevicePresentation } from '../../utils/devicePresentation';

function detect(): DevicePresentation {
  return inferDevicePresentation({ width: window.innerWidth, touchPoints: navigator.maxTouchPoints || 0,
    coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(any-pointer: fine)').matches,
    hover: matchMedia('(any-hover: hover)').matches,
    mobileHint: (navigator as Navigator & { userAgentData?: { mobile: boolean } }).userAgentData?.mobile });
}

export function useDevicePresentation() {
  const [detected, setDetected] = useState<DevicePresentation>(detect);
  const [override, setOverride] = useState('');
  useEffect(() => {
    try { setOverride(sessionStorage.getItem('eventgrid:device-presentation') || ''); } catch {}
    const update = () => setDetected(detect()); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const choose = (value: string) => {
    if (!['', 'desktop', 'phone'].includes(value)) return;
    setOverride(value); try { sessionStorage.setItem('eventgrid:device-presentation', value); } catch {}
  };
  return { device: override || detected, detected, override, choose };
}
