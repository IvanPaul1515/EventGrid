import {createContext,useContext,useEffect,useRef,useState,ReactNode} from 'react';
import {useAuth} from '../../context/AuthContext';
import {useEdition} from '../../context/EditionContext';
import {useRealtimeEvent,useRealtimeRefresh} from '../../context/RealtimeContext';
import {api} from '../../services/api';
import {queueReadBody} from '../../utils/queueRead';
type Device={invitationVerified?:boolean;id:string;status:string;expiresAt:string;station:{id:string;label:string}};
export type QueueRow={category?:string|null;id:string;registrationId:string;name:string;number:string;state:string;scannedAt:string;station:string;mine:boolean;selectedTshirtSize?:string|null;tshirtDelivered:boolean;tshirtIncluded:boolean;tshirtDeliveryStatus?:string;canCollect?:boolean;payment?:{isCourtesy:boolean;paymentStatus:string;balanceDue:number;amountPaid:number;external:boolean;methods?:string[]}};
type Snapshot={lastDeviceStatus?:string|null;invitation?:{code:string;expiresAt:string}|null;availableDevices?:{id:string;name:string}[];enabled:boolean;station:{id:string;label:string;mode:string}|null;devices:{invitationVerified?:boolean;deviceLabel?:string;id:string;name:string;status:string;expiresAt:string;code?:string}[];device:Device|null};
const empty:Snapshot={enabled:false,station:null,devices:[],device:null};
export type ScannerStats={sessionReads?:number;today:string;timeZone:string;reads:number;sent:number;rejected:number;repeated:number;confirmedByDesk:number;total:number};
type Value={stats:ScannerStats|null;state:Snapshot;stations:{id:string;label:string}[];rows:QueueRow[];connected:boolean;pending:boolean;error:string;ready:boolean;scannerOpen:boolean;setScannerOpen:(v:boolean)=>void;refresh:()=>Promise<void>;act:(path:string,body?:object)=>Promise<any>;read:(token:string,size?:string,requestKey?:string)=>Promise<any>;preview:(token:string,requestKey?:string)=>Promise<any>};
const Context=createContext<Value|null>(null);
export function ReceptionQueueProvider({children}:{children:ReactNode}){
 const {user,token}=useAuth(),{currentEvent}=useEdition();
 const [state,setState]=useState(empty),[stations,setStations]=useState<{id:string;label:string}[]>([]),[rows,setRows]=useState<QueueRow[]>([]);
 const [stats,setStats]=useState<ScannerStats|null>(null);
 const [connected,setConnected]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[scannerOpen,setScannerOpen]=useState(false);
 const reload=useRef(async()=>{}),busy=useRef(false),generation=useRef(0),base=`/events/${currentEvent?.id}/reception-queue`;
 useEffect(()=>{
  let active=true,running=false,again=false;const epoch=++generation.current;setState(empty);setRows([]);setStats(null);setScannerOpen(false);setReady(false);setError('');
  if(!token||!currentEvent||!['ADMIN','OPERATOR'].includes(user?.role||'')){setReady(true);reload.current=async()=>{};return;}
  const load=async()=>{if(!active)return;if(running){again=true;return;}running=true;again=false;try{
   const next=(await api.get(base+'/state')).data.data;
   const available=(await api.get(base+'/stations')).data.data;
   const ownStats=(await api.get(base+'/stats')).data.data;
   const entries=!user?.scannerOnly&&next.station?.mode==='QUEUE'?(await api.get(base+'/entries')).data.data:[];
   if(active&&epoch===generation.current){setState(next);setStats(ownStats);setStations(available);setRows(entries);setConnected(true);}
  }catch{if(active)setConnected(false);}finally{if(active)setReady(true);running=false;if(again&&active)void load();}};
  reload.current=load;void load();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)void load();},15000);
  const wake=()=>{if(document.visibilityState==='visible')void load();},offline=()=>setConnected(false);
  window.addEventListener('online',wake);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',wake);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',wake);};
 },[base,token,user?.role,user?.scannerOnly]);
 useRealtimeRefresh('attendance',()=>reload.current());
 useRealtimeEvent(['RECEPTION_QUEUE_CHANGED','RESYNC','CHECK_IN_CONFIRMED','PAYMENT_RECORDED','TSHIRT_DELIVERED'],()=>{void reload.current();});
 const act=async(path:string,body:object={})=>{if(busy.current)throw Error('Hay una operación en curso.');busy.current=true;setPending(true);setError('');try{const result=(await api.post(base+path,body)).data.data;await reload.current();return result;}catch(e:any){setError(e.response?.data?.message||'No se pudo completar la operación. Comprueba la conexión.');throw e;}finally{busy.current=false;setPending(false);}};
 const preview=async(token:string,requestKey?:string)=>{const result=(await api.post(base+'/preview',{...queueReadBody(token,state.device,user?.scannerOnly),requestKey})).data.data;void reload.current();return result;};
 const read=async(token:string,selectedTshirtSize?:string,requestKey?:string)=>{const result=(await api.post(base+'/read',{...queueReadBody(token,state.device,user?.scannerOnly),selectedTshirtSize,requestKey})).data.data;void reload.current();return result;};
 return <Context.Provider value={{stats,state,stations,rows,connected,pending,error,ready,scannerOpen,setScannerOpen,refresh:()=>reload.current(),act,read,preview}}>{children}</Context.Provider>;
}
export function useReceptionQueue(){const c=useContext(Context);if(!c)throw Error('ReceptionQueueProvider required');return c;}
