export type DevicePresentation = 'desktop' | 'phone' | 'ambiguous';
// Presentation only. Every scanner capability is authorized by the server.
export function inferDevicePresentation(input: {
  width: number; height?: number; screenShortSide?: number; touchPoints: number; coarse: boolean; fine: boolean; hover: boolean; mobileHint?: boolean;
}): DevicePresentation {
  const touch = input.touchPoints > 0;
  const shortSide = input.screenShortSide || Math.min(input.width, input.height || input.width);
  if (touch && input.coarse && shortSide < 600 && (!input.fine || input.mobileHint)) return 'phone';
  if (input.mobileHint && touch && shortSide < 700) return 'phone';
  if (!touch && input.fine && input.hover) return 'desktop';
  return 'ambiguous';
}
