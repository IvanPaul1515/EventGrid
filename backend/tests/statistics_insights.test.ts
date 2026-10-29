import {describe,it,expect} from 'vitest';
import {statisticsInsights} from '../../frontend/src/utils/statisticsInsights';
const base={participants:{registered:12,attended:8,absent:2,cancelled:2},attendanceHours:[{name:'2026-10-10 09:00',value:3},{name:'2026-10-10 10:00',value:3}],unknownAttendanceTime:2,shirts:{sizeComparison:[{name:'M',requested:4},{name:'L',requested:4}],unknownRequested:1}};
describe('transparent descriptive statistics',()=>{
 it('excludes cancellations from absence percentages and states the sample',()=>{const lines=statisticsInsights(base);expect(lines[0]).toContain('20.0 % de 10');expect(lines[1]).toContain('2 registros cancelados');});
 it('describes tied arrival peaks and unknown times instead of choosing an invented winner',()=>{const text=statisticsInsights(base).join(' ');expect(text).toContain('empate');expect(text).toContain('sobre 6 con hora conocida');expect(text).toContain('2 asistentes sin hora persistida');});
 it('limits size rankings to recoverable original requests and reports ties and missing data',()=>{const text=statisticsInsights(base).join(' ');expect(text).toContain('M, L');expect(text).toContain('muestra 8');expect(text).toContain('1 tallas originales no recuperables');});
 it('does not divide by zero or fabricate causes and never invokes an AI provider',()=>{const text=statisticsInsights({...base,participants:{registered:0,attended:0,absent:0,cancelled:0},attendanceHours:[],shirts:{sizeComparison:[],unknownRequested:0},unknownAttendanceTime:0}).join(' ');expect(text).toContain('No hay registros');expect(text).not.toMatch(/NaN|Infinity|transporte|salud/);expect(text).toContain('sin extrapolarlos');});
});
