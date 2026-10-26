import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useEdition } from '../../context/EditionContext';
import { useRealtimeRefresh } from '../../context/RealtimeContext';
export function useCommunicationBadges(ids: string[]) {
    const { currentEvent } = useEdition(), { hasRole } = useAuth(), key = ids.join(','), [badges, setBadges] = useState<Record<string, {
        lastStatus: string | null;
        communicationCount: number;
    }>>({}), seq = useRef(0);
    const load = async () => { if (!key || !currentEvent || !hasRole(['ADMIN', 'OPERATOR']))
        return; const id = ++seq.current; try {
        const res = await api.get('/communications/tracking/badges', { params: { eventId: currentEvent.id, ids: key } });
        if (id === seq.current)
            setBadges(Object.fromEntries(res.data.data.map((r: any) => [r.id, r])));
    }
    catch {
        if (id === seq.current)
            setBadges({});
    } };
    useEffect(() => { setBadges({}); void load(); return () => { seq.current++; }; }, [key, currentEvent?.id]);
    useRealtimeRefresh('communications', load);
    return badges;
}
