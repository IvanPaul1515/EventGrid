import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../../middleware/auth.js';
import { editionContext } from '../../middleware/editionContext.js';
import { ForbiddenError } from '../../utils/errors.js';
import { statisticsAllowed } from './statistics.rules.js';
import { StatisticsService } from './statistics.service.js';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
export const statisticsQuery=z.object({from:date.optional(),to:date.optional(),ticketTypeId:z.string().uuid().optional(),
  size:z.string().min(1).max(40).optional(),delivery:z.enum(['DELIVERED','PENDING','NOT_DELIVERED']).optional(),
  reason:z.enum(['SIZE_UNAVAILABLE','DECLINED','OTHER','LEGACY_UNKNOWN','PENDING']).optional(),page:z.coerce.number().int().min(1).max(100000).default(1),
}).refine(q=>!q.from||!q.to||q.from<=q.to,{message:'El rango de fechas no es válido'});
const router=Router();
router.use(authenticateToken,(req,res,next)=>statisticsAllowed(req.user)?next():next(new ForbiddenError('Las estadísticas son exclusivas del administrador.')),editionContext);
router.get('/comparison',async(req,res,next)=>{try{
 const ids=z.string().transform(value=>[...new Set(value.split(','))]).pipe(z.array(z.string().uuid()).min(2).max(4)).parse(req.query.ids);
 if(req.user!.assignedEventId&&ids.some(id=>id!==req.user!.assignedEventId))throw new ForbiddenError('Solo puedes consultar tu edición asignada.');
 res.json({data:await StatisticsService.compare(ids)});
}catch(error){next(error);}});
router.get('/',async(req,res,next)=>{try{const filters=statisticsQuery.parse(req.query);res.json({data:await StatisticsService.summary(req.eventId!,filters)});}catch(error){next(error);}});
router.get('/shirt-details',async(req,res,next)=>{try{const filters=statisticsQuery.parse(req.query);if(!filters.reason)throw new z.ZodError([{code:'custom',path:['reason'],message:'Selecciona un motivo'}]);res.json({data:await StatisticsService.details(req.eventId!,filters,filters.reason,filters.page)});}catch(error){next(error);}});
export default router;
