import { useNavigate, useLocation } from 'react-router-dom';
import { useScanner } from './ScannerContext';
export function ScannerSuggestion() {
  const { presentation, state, stations, connected, dismissed, dismissSuggestion, act } = useScanner();
  const navigate = useNavigate(), { pathname } = useLocation();
  if (state.station?.pc && state.link && state.link.status !== 'LINKED' && !['/reception','/attendance'].includes(pathname)) return <aside className="p-3 rounded-xl bg-card border border-border text-sm"><p>Solicitud de vinculación pendiente en tu estación.</p><button className="btn-primary" onClick={() => navigate('/reception')}>Revisar solicitud en Recepción rápida</button></aside>;
  if (state.link?.status === 'LINKED' && !state.station?.pc && !['/reception','/attendance'].includes(pathname)) return <aside className="p-3 rounded-xl bg-card border border-border text-sm space-y-2" aria-label="Teléfono vinculado">
    <p>Este teléfono está vinculado como escáner. La PC confirma las asistencias.</p>
    <button className="btn-primary" onClick={() => navigate('/reception')}>Volver al escáner</button>
    <button className="btn-secondary" onClick={() => void act('/' + state.link!.id + '/unlink')}>Desvincular y usar EventGrid normalmente</button>
  </aside>;
  if (presentation.device !== 'phone' || dismissed || !connected || state.link || !stations.length) return null;
  return <aside className="p-3 rounded-xl bg-card border border-border text-sm space-y-2" aria-label="Sugerencia de escáner vinculado">
    <p>Tienes una computadora disponible. ¿Deseas vincular este teléfono como escáner?</p>
    <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => { dismissSuggestion(); navigate('/reception', { state: { openScannerLink: true } }); }}>Vincular como escáner</button><button className="btn-secondary" onClick={dismissSuggestion}>Continuar normalmente</button></div>
  </aside>;
}
