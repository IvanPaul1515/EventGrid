import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { communicationsService, EmailPreviewResult } from '../../services/communications.service';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { EmailTemplate } from '../../types';
import { EmailPreview } from './EmailPreview';
import { DuplicateResendModal } from './DuplicateResendModal';
import { formatEmailStatus } from '../../utils/emailFormatters';
interface Props {
    registrationId: string;
    recipientName: string;
    recipientEmail: string;
    eventId: string;
    isOpen: boolean;
    onClose: () => void;
    onSent?: () => void;
    initialTemplate?: string;
}
export const SendSingleEmailModal: React.FC<Props> = ({ registrationId, recipientName, recipientEmail, eventId, isOpen, onClose, onSent, initialTemplate = 'DIGITAL_TICKET' }) => {
    const { hasRole } = useAuth(), { currentEvent } = useEdition();
    const admin = hasRole(['ADMIN']);
    const [reload, setReload] = useState(0);
    const [templates, setTemplates] = useState<EmailTemplate[]>([]), [code, setCode] = useState(initialTemplate), [preview, setPreview] = useState<EmailPreviewResult | null>(null), [history, setHistory] = useState<any[]>([]), [provider, setProvider] = useState<{isEnabled:boolean;isConfigured:boolean;simulationAllowed?:boolean}>({ isEnabled: false, isConfigured: false }), [mode, setMode] = useState<'REAL' | 'SIMULATION'>('REAL'), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [duplicate, setDuplicate] = useState<any>(null), [demoConfirmed, setDemoConfirmed] = useState(false);
    const lock = useRef(false), scope = useRef(0);
    useEffect(() => { if (!isOpen)
        return; const id = ++scope.current; setPreview(null); setError(''); setMessage(''); setTemplates([]); setHistory([]); setDuplicate(null); setCode(initialTemplate); setMode('REAL'); setDemoConfirmed(false); setLoading(true); Promise.all([communicationsService.getTemplates(eventId), communicationsService.getStatus(eventId)]).then(([items, status]) => { if (scope.current !== id)
        return; setTemplates(items); setProvider(status); setCode(items.some(t => t.code === initialTemplate) ? initialTemplate : items[0]?.code || ''); }).catch(() => { if (scope.current === id)
        setError('No se pudieron cargar las plantillas o el estado del proveedor. Cierra y vuelve a abrir para consultar.'); }).finally(() => { if (scope.current === id)
        setLoading(false); }); return () => { scope.current++; }; }, [isOpen, eventId, registrationId, initialTemplate]);
    useEffect(() => { if (!isOpen || !templates.some(t => t.code === code))
        return; let active = true; setPreview(null); setHistory([]); setError(''); setLoading(true); Promise.all([communicationsService.previewEmail({ eventId, registrationId, templateCode: code }), api.get('/communications/tracking/registration/' + registrationId, { params: { eventId, page: 1, limit: 20, templateCode: code } })]).then(([p, h]) => { if (active) {
        setPreview(p);
        setHistory(h.data.data.filter((item: any) => item.templateCode === code));
    } }).catch(() => { if (active)
        setError('No se pudo generar la vista previa o consultar antecedentes. No se habilitó el envío.'); }).finally(() => { if (active)
        setLoading(false); }); return () => { active = false; }; }, [isOpen, eventId, registrationId, code, templates, reload]);
    async function send(reason?: string) {
        if (lock.current || !preview)
            return;
        lock.current = true;
        setBusy(true);
        setError('');
        setMessage('');
        const key = scope.current;
        try {
            const result = await communicationsService.sendSingleEmail({ eventId, registrationId, templateCode: code, expectedRecipientEmail: preview.recipientEmail, mode, simulateOnly: mode === 'SIMULATION', confirmedDemoSending: demoConfirmed, ...(reason ? { forceResend: true, confirmedResend: true, resendReason: reason } : {}) });
            if (key !== scope.current)
                return;
            setMessage(result.message);
            setPreview(null);
            setDuplicate(null);
            onSent?.();
        }
        catch (e: any) {
            if (key !== scope.current)
                return;
            const details = e.response?.data?.details;
            if (details?.code === 'DUPLICATE_COMMUNICATION_WARNING') {
                setDuplicate(details);
            }
            else
                setError(e.response?.data?.message || 'No se confirmó el resultado. Consulta el historial antes de autorizar otro intento.');
        }
        finally {
            lock.current = false;
            if (key === scope.current)
                setBusy(false);
        }
    }
    if (!isOpen)
        return null;
    return createPortal(<><div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-2 sm:p-4"><section role="dialog" aria-modal="true" aria-label="Enviar comunicación" className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[94dvh] flex flex-col min-w-0"><header className="p-4 flex justify-between border-b border-border"><h2 className="font-bold">Enviar comunicación</h2><button type="button" disabled={busy} aria-label="Cerrar envío" onClick={onClose}>✕</button></header><div className="overflow-y-auto p-4 space-y-4 min-w-0"><div className="text-sm break-words"><strong>{preview?.recipientName || recipientName}</strong><p className="break-all">{preview?.recipientEmail || recipientEmail}</p>{preview?.registrationNumber && <p className="text-xs">Registro: {preview.registrationNumber}</p>}<p className="text-xs text-muted-foreground">Proveedor: {provider.isEnabled && provider.isConfigured ? 'Disponible' : 'Desactivado o sin configurar'}</p></div>{loading && <p role="status">Cargando plantilla y antecedentes...</p>}{error && <div role="alert" className="text-rose-500"><p>{error}</p><button type="button" className="underline text-xs" disabled={busy} onClick={() => setReload(v => v + 1)}>Consultar historial y regenerar vista previa</button></div>}{message && <p role="status">{message}</p>}<label className="block text-sm">Plantilla autorizada<select aria-label="Plantilla autorizada" className="w-full bg-background border border-border rounded-lg p-2 text-base" value={code} disabled={busy} onChange={e => setCode(e.target.value)}>{templates.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}</select></label><p className="text-xs text-muted-foreground">{admin ? 'Contenido oficial de la plantilla seleccionada.' : 'Solo entrada digital oficial; no puedes modificar el asunto ni el HTML.'}</p>{history.length > 0 && <div className="border border-amber-500/40 p-3 rounded-lg text-xs" role="status">Ya hay comunicaciones anteriores de esta plantilla. Último estado: {formatEmailStatus(history[0].status).label}. {history[0].date && new Date(history[0].date).toLocaleString('es-DO')}. El backend comprobará todos los antecedentes antes del envío.</div>}{preview && <><p className="text-sm"><strong>Asunto:</strong> {preview.subject}</p><EmailPreview html={preview.html}/></>}{provider.simulationAllowed&&(<label className="block text-sm">Modo de entrega<select aria-label="Modo de entrega" className="w-full bg-background border border-border p-2 rounded-lg" value={mode} disabled={busy} onChange={e => setMode(e.target.value as any)}><option value="REAL">Real — requiere proveedor habilitado</option><option value="SIMULATION">Simulación — no envía correos</option></select></label>)}{mode === 'REAL' && currentEvent?.settings?.demoModeEnabled && <label className="text-xs flex gap-2"><input type="checkbox" checked={demoConfirmed} onChange={e => setDemoConfirmed(e.target.checked)}/>Autorizo este envío real en el entorno de demostración.</label>}<button type="button" className="w-full bg-primary text-white rounded-lg p-3 disabled:opacity-50" disabled={busy || loading || !preview || Boolean(error) || (mode === 'REAL' && (!provider.isEnabled || !provider.isConfigured))} onClick={() => send()}>{busy ? 'Procesando...' : 'Confirmar envío'}</button><p className="text-xs text-muted-foreground">No se envía nada al abrir, previsualizar ni cambiar de vista. Ante un resultado incierto, consulta el historial.</p></div></section></div>{duplicate && <DuplicateResendModal isOpen onClose={() => setDuplicate(null)} onConfirmResend={reason => { if (!admin && duplicate.previousStatus === 'UNKNOWN_DELIVERY_STATUS') {
        setError('El reenvío incierto requiere revisión administrativa.');
        setDuplicate(null);
        return;
    } void send(reason || 'Reenvío confirmado expresamente'); }} participantName={recipientName} recipientEmail={recipientEmail} templateCode={code} previousStatus={duplicate.previousStatus} previousSentAt={duplicate.previousSentAt} isLoading={busy}/>}</>, document.body);
};
