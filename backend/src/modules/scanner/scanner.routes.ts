import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';
import { actionRateLimiter } from '../../middleware/rateLimiter.js';
import { ScannerService } from './scanner.service.js';
import { prisma } from '../../config/db.js';
import { RealtimeService } from '../realtime/realtime.service.js';
const router = Router({ mergeParams: true });
router.use(authenticateToken, actionRateLimiter(180));
const id = z.string().uuid();
router.get('/stations', async (req, res, next) => { try { res.json({ data: await ScannerService.available(req.user!, id.parse((req.params as Record<string, string>).eventId)) }); } catch (e) { next(e); } });
router.post('/station', async (req, res, next) => { try { const input = z.object({ label: z.string().trim().min(1).max(60) }).parse(req.body); const station = await ScannerService.register(req.user!, id.parse((req.params as Record<string, string>).eventId), input.label); RealtimeService.scannerStationsChanged(station.eventId, req.user!.id); res.json({ data: { id: station.id, label: station.label } }); } catch (e) { next(e); } });
router.post('/station/disable', async(req,res,next)=>{try{const eventId=id.parse((req.params as Record<string,string>).eventId);const data=await ScannerService.disable(req.user!,eventId);RealtimeService.scannerStationsChanged(eventId,req.user!.id);res.json({data});}catch(e){next(e);}});
router.post('/state', async (req, res, next) => { try { const input = z.object({ busy: z.boolean() }).parse(req.body); res.json({ data: await ScannerService.snapshot(req.user!, id.parse((req.params as Record<string, string>).eventId), input.busy) }); } catch (e) { next(e); } });
router.post('/request', async (req, res, next) => { try { const input = z.object({ stationId: id }).parse(req.body); const result = await ScannerService.request(req.user!, id.parse((req.params as Record<string, string>).eventId), input.stationId); await hint(result.id); res.json({ data: result }); } catch (e) { next(e); } });
async function hint(linkId: string) {
  const link = await prisma.scannerLink.findUnique({ where: { id: linkId } });
  const station = link ? await prisma.receptionStation.findUnique({ where: { id: link.stationId } }) : null;
  if (link && station) RealtimeService.targetSessions(link.eventId, [station.sessionId, link.mobileSessionId], { type: 'SCANNER_CHANGED', data: { linkId } });
}
for (const action of ['decide', 'confirm', 'unlink', 'read', 'dismiss'] as const) router.post('/:linkId/' + action, async (req, res, next) => {
  try {
    const user = req.user!, eventId = id.parse((req.params as Record<string, string>).eventId), linkId = id.parse(req.params.linkId);
    let data;
    if (action === 'decide') data = await ScannerService.decide(user, eventId, linkId, z.boolean().parse(req.body.approve));
    else if (action === 'confirm') data = await ScannerService.confirm(user, eventId, linkId, z.string().regex(/^\d{6}$/).parse(req.body.code));
    else if (action === 'unlink') data = await ScannerService.unlink(user, eventId, linkId);
    else if (action === 'dismiss') data = await ScannerService.dismiss(user, eventId, linkId);
    else { const input = z.object({ requestKey: id, token: z.string().min(1).max(2048) }).parse(req.body); data = await ScannerService.read(user, eventId, linkId, input.requestKey, input.token); }
    await hint(linkId);
    if (action === 'unlink' || action === 'decide') RealtimeService.scannerStationsChanged(eventId, user.id);
    res.json({ data });
  } catch (e) { next(e); }
});
export default router;
