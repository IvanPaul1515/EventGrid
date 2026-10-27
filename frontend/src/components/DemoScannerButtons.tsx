export function DemoScannerButtons({ loading, onSelect }: {
  loading: boolean;
  onSelect: (profile: 'SCANNER_1' | 'SCANNER_2') => void;
}) {
  return <>{(['SCANNER_1', 'SCANNER_2'] as const).map((profile, index) => (
    <button key={profile} type="button" onClick={() => onSelect(profile)}
      className="px-2 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground hover:text-foreground transition-colors text-center cursor-pointer"
      disabled={loading} title={`Ingresar como Escáner QR ${index + 1}`}>
      <strong className="block text-primary font-bold">Escáner QR {index + 1}</strong>
      <span className="text-[9px] text-muted-foreground">Cuenta demo {index + 1}</span>
    </button>
  ))}</>;
}
import React from 'react';
