import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const fixture=vi.hoisted(()=>({queue:{} as any}));
vi.mock('../../frontend/src/components/attendance/ReceptionQueueContext.js',()=>({useReceptionQueue:()=>fixture.queue}));
vi.mock('../../frontend/src/context/EditionContext.js',()=>({useEdition:()=>({currentEvent:{id:'event',name:'Unit edition'}})}));
vi.mock('../../frontend/src/context/AuthContext.js',()=>({useAuth:()=>({user:{scannerOnly:true},logout:vi.fn()})}));
vi.mock('../../frontend/src/components/attendance/ScannerDialog.js',()=>({ScannerDialog:({children}:any)=>children}));
vi.mock('../../frontend/src/components/attendance/QueueScanFlow.js',()=>({QueueScanFlow:()=>null}));
vi.mock('../../frontend/src/components/qr/QrScanModal.js',()=>({QrScanModal:()=>null}));
vi.mock('../../frontend/src/components/attendance/ScannerContext.js',()=>({useScanner:()=>({presentation:{device:'desktop'},notice:'',state:{station:{pc:true,label:'Direct PC'},link:{id:'direct',status:'REQUESTED',user:'Unit operator',expiresAt:new Date(Date.now()+90000).toISOString()}},stations:[],connected:true,dismissed:false,pending:false,message:'',act:vi.fn()})}));
vi.mock('react-router-dom',()=>({useNavigate:()=>vi.fn()}));
import {QueueScannerWorkspace} from '../../frontend/src/components/attendance/QueueScannerWorkspace.js';
import {QueueAuthorizationDialog} from '../../frontend/src/components/attendance/QueueAuthorizationDialog.js';
import {ScannerPrompts} from '../../frontend/src/components/attendance/ScannerPrompts.js';
import {QueuePairingInvitation} from '../../frontend/src/components/attendance/QueuePairingInvitation.js';
beforeEach(()=>{
 vi.stubGlobal('React',React);
 fixture.queue={state:{enabled:true,device:null,devices:[],station:{label:'Unit PC'}},connected:true,ready:true,stations:[],pending:false,act:vi.fn(),error:''};
});
describe('pairing screens have one security-code step',()=>{
 it('keeps the direct scanner dialog independent and suppresses it in queue mode',()=>{
  fixture.queue.state.station.mode='QUEUE';
  expect(renderToStaticMarkup(React.createElement(ScannerPrompts))).toBe('');
  fixture.queue.state.station.mode='DIRECT';
  expect(renderToStaticMarkup(React.createElement(ScannerPrompts))).toContain('Nuevo dispositivo solicita vinculación');
 });
 it('presents a temporary QR with a secondary manual option',()=>{
  const html=renderToStaticMarkup(React.createElement(QueuePairingInvitation,{value:{code:'1234ABCD',expiresAt:new Date(Date.now()+120000).toISOString(),qrDataUrl:'data:image/png;base64,unit'},pending:false,active:true,onRegenerate:vi.fn(),onClose:vi.fn()}));
  expect(html).toContain('QR temporal de vinculación');expect(html).toContain('Alternativa sin cámara');expect(html).toContain('No se solicita un segundo código');
 });
 it('shows optional station discovery separately before a request',()=>{
  const html=renderToStaticMarkup(React.createElement(QueueScannerWorkspace));
  expect(html).toContain('Escanear QR de vinculación');expect(html).toContain('Alternativa sin cámara');
  expect(html).not.toContain('Código de cola');
 });
 it('waits for PC authorization without showing another code form',()=>{
  fixture.queue.state.device={id:'device',status:'REQUESTED',station:{label:'Unit PC'},expiresAt:new Date(Date.now()+90000).toISOString()};
  const html=renderToStaticMarkup(React.createElement(QueueScannerWorkspace));
  expect(html).toContain('Esperando autorización de la PC');
  expect(html).not.toContain('Código de cola');expect(html).not.toContain('Código de invitación');
 });
 it('shows exactly one security-code input after approval',()=>{
  fixture.queue.state.device={id:'device',status:'APPROVED',station:{label:'Unit PC'},expiresAt:new Date(Date.now()+90000).toISOString()};
  const html=renderToStaticMarkup(React.createElement(QueueScannerWorkspace));
  expect(html.match(/aria-label="Código de cola"/g)).toHaveLength(1);
  expect(html).not.toContain('Código de invitación');
 });
 it('shows scanning and no completed pairing forms after linking',()=>{
  fixture.queue.state.device={id:'device',status:'LINKED',station:{label:'Unit PC'},expiresAt:new Date().toISOString()};
  const html=renderToStaticMarkup(React.createElement(QueueScannerWorkspace));
  expect(html).toContain('Comenzar a escanear entradas');expect(html).not.toContain('Código de cola');expect(html).not.toContain('Código de invitación');
 });
 it.each(['REQUESTED','APPROVED'])('PC reveals a single code only after approval (%s)',status=>{
  fixture.queue.state.devices=[{id:'device',status,name:'Unit scanner',code:'123456',expiresAt:new Date().toISOString()}];
  const html=renderToStaticMarkup(React.createElement(QueueAuthorizationDialog));
  expect(html.includes('123456')).toBe(status==='APPROVED');
 });
});
