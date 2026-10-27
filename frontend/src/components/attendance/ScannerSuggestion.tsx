import { useDevicePresentation } from './useDevicePresentation';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEdition } from '../../context/EditionContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

export function ScannerSuggestion() {
  const { device } = useDevicePresentation();
  const { currentEvent } = useEdition();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const key = `eventgrid:scanner-suggestion:${currentEvent?.id}:${token?.slice(-16)}`;
  useEffect(() => {
    let active = true; setVisible(false);
    // A small screen only selects the presentation; the backend must report
    // an authenticated, explicitly registered station for this account/edition.
    if (!currentEvent || !['ADMIN', 'OPERATOR'].includes(user?.role || '') || device !== 'phone' || sessionStorage.getItem(key)) return;
    api.get(`/events/${currentEvent.id}/scanner/stations`).then(response => {
      if (active && response.data.data.length) setVisible(true);
    }).catch(() => {}); // Optional suggestion never blocks normal EventGrid.
    return () => { active = false; };
  }, [currentEvent?.id, user?.role, key, device]);
  if (!visible) return null;
  const dismiss = () => { sessionStorage.setItem(key, 'dismissed'); setVisible(false); };
  return <aside className="p-3 rounded-xl bg-card border border-border text-sm space-y-2" aria-label="Sugerencia de escáner vinculado">
    <p>Tienes una estación de recepción disponible. ¿Quieres vincular este teléfono como escáner?</p>
    <div className="flex flex-wrap gap-2"><button className="btn-primary" onClick={() => { dismiss(); navigate('/reception'); }}>Vincular</button><button className="btn-secondary" onClick={dismiss}>Continuar normalmente</button></div>
  </aside>;
}
