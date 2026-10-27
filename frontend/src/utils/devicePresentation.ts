export type DevicePresentation = 'desktop' | 'phone' | 'ambiguous';

export function inferDevicePresentation(input: {
  width: number; touchPoints: number; coarse: boolean; fine: boolean; hover: boolean; mobileHint?: boolean;
}): DevicePresentation {
  const touch = input.touchPoints > 0;
  if (input.width < 768 && touch && input.coarse) return 'phone';
  if (input.mobileHint && input.width < 900 && (touch || input.coarse)) return 'phone';
  if (input.width >= 1024 && input.fine && input.hover) return 'desktop';
  return 'ambiguous';
}
