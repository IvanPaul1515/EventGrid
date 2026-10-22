import { AuthService } from './auth.service.js';
import { z } from 'zod';
import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { authenticateToken } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.get('/demo-access', (_req, res) => res.json({ enabled: process.env.DEMO_QUICK_ACCESS === 'true' }));
router.post('/demo-login', loginRateLimiter, async (req, res, next) => {
  if (process.env.DEMO_QUICK_ACCESS !== 'true') return res.sendStatus(404);
  try {
    const role = z.enum(['ADMIN', 'OPERATOR', 'VIEWER']).parse(req.body.role);
    const accounts = { ADMIN: ['admin', 'Admin'], OPERATOR: ['operador', 'Op'], VIEWER: ['consulta', 'View'] };
    const [name, suffix] = accounts[role];
    const data = await AuthService.login(`${name}@barcamp.org.do`, `BarCamp2026!${suffix}`);
    return res.json({ status: 'success', data });
  } catch (error) { next(error); }
});

router.post('/login', loginRateLimiter, AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authenticateToken, AuthController.me);
router.put('/change-password', authenticateToken, AuthController.changePassword);

export default router;
