// The cleanup promise already releases media tracks in finally. A library DOM
// cleanup error must not discard a QR that has already been decoded completely.
export async function finishQrCameraRelease(cleanup:Promise<void>,report:()=>void) {
  try { await cleanup; } catch { report(); }
}
