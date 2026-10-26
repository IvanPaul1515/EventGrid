import { DeviceSessionService } from './device-session.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { prisma } from '../../config/db.js';
import { RecoveryService, recoveryMessage } from './recovery.service.js';
import { actionRateLimiter } from '../../middleware/rateLimiter.js';
import { ENV } from '../../config/env.js';
import { InvitationsService } from '../users/invitations.service.js';
import { AuthService } from './auth.service.js';
import { z } from 'zod';
import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();
const explicitActionLimit = actionRateLimiter();
const demoAccessEnabled = () => process.env.DEMO_QUICK_ACCESS === 'true' || (process.env.DEMO_QUICK_ACCESS !== 'false' && ENV.NODE_ENV === 'development' && ENV.DATABASE_URL?.startsWith('file:'));

router.get('/demo-access', (_req, res) => res.json({ enabled: Boolean(demoAccessEnabled()) }));
router.post('/demo-login', loginRateLimiter, async (req, res, next) => {
  if (!demoAccessEnabled()) return res.sendStatus(404);
  try {
    const role = z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).parse(req.body.role);
    const accounts = { ADMIN: ['admin', 'Admin'], OPERATOR: ['operador', 'Op'], VIEWER: ['consulta', 'View'] };
    const [name, suffix] = accounts[role];
    const data = await AuthService.login(`${name}@barcamp.org.do`, `BarCamp2026!${suffix}`);
    return res.json({ status: 'success', data });
  } catch (error) { next(error); }
});

router.post('/accept-invitation', loginRateLimiter, explicitActionLimit, async (req, res, next) => {
  try {
    const input = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(128) }).parse(req.body);
    res.json({ data: await InvitationsService.accept(input.token, input.password) });
  } catch (error) { next(error); }
});

router.post('/recovery/request', actionRateLimiter(5,15*60*1000), async(req,res,next)=>{try{const email=z.string().email().max(254).parse(req.body.email);await RecoveryService.request(email);res.status(202).json({message:recoveryMessage});}catch(e){next(e);}});
router.post('/recovery/validate', actionRateLimiter(20), async(req,res,next)=>{try{const token=z.string().min(32).max(200).parse(req.body.token);await RecoveryService.validate(token);res.json({valid:true});}catch(e){next(e);}});
router.post('/recovery/confirm', actionRateLimiter(10), async(req,res,next)=>{try{const input=z.object({token:z.string().min(32).max(200),password:z.string().min(12).max(128)}).parse(req.body);await RecoveryService.confirm(input.token,input.password);res.json({message:'Contraseña actualizada. Inicia sesión nuevamente.'});}catch(e){next(e);}});

router.post('/login', loginRateLimiter, AuthController.login);
router.post('/logout', authenticateToken, AuthController.logout);
router.get('/me', authenticateToken, AuthController.me);
router.get('/sessions', authenticateToken, async (req, res, next) => {
  try { const sessions = await prisma.authSession.findMany({ where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() }, sessionVersion: req.user!.sessionVersion }, select: { id: true, createdAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }); res.json({ data: sessions.map(session => ({ ...session, current: session.id === req.user!.sessionId })) }); } catch (error) { next(error); }
});
router.delete('/sessions/:sessionId', authenticateToken, explicitActionLimit, async (req, res, next) => {
  try { const revoked = await DeviceSessionService.revoke(z.string().min(1).max(100).parse(req.params.sessionId), req.user!.id); if (revoked) RealtimeService.notifySession(req.params.sessionId); res.sendStatus(204); } catch (error) { next(error); }
});

router.put('/change-password', authenticateToken, AuthController.changePassword);

export default router;
