type StorageAccess=Pick<Storage,'getItem'|'setItem'>;
type Filters=Record<string,string|number>;
const lifetime=60*60*1000;
export const participantFilters={page:1,limit:10,search:'',paymentMethodId:'',salesResponsibleId:'',status:'',isCourtesyFilter:'ALL' as 'ALL'|'COURTESY'|'REGULAR',sortBy:'createdAt',sortOrder:'desc' as 'asc'|'desc'};
export const attendanceFilters={dateFrom:'',dateTo:'',tshirtDelivery:'',search:'',statusFilter:'ALL' as 'ALL'|'ATTENDED'|'PENDING',page:1};
const allowed:Record<string,readonly (string|number)[]>={limit:[10,25,50,100],status:['','CONFIRMED','PENDING','ATTENDED','CANCELLED'],isCourtesyFilter:['ALL','COURTESY','REGULAR'],sortBy:['createdAt','registrationNumber','fullName','email','ticketPrice','totalAmount','saleTimestamp'],sortOrder:['asc','desc'],statusFilter:['ALL','ATTENDED','PENDING']};

export function listNavigationScope(storage:StorageAccess,userId:string|undefined,token:string|null,eventId:string|undefined,view:string) {
  if(!userId||!token||!eventId)return null;
  try {
    const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    if(typeof payload.sid!=='string'||!payload.sid||payload.sid.length>128)return null;
    const prefix='eventgrid:list:v1:'+JSON.stringify([userId,payload.sid]);
    let previous:any;
    try { previous=JSON.parse(storage.getItem(prefix+':edition')||'null'); } catch { previous=null; }
    const revision=Number.isSafeInteger(previous?.revision)&&previous.revision>=0?previous.revision:0;
    const next={eventId,revision:previous?.eventId===eventId?revision:revision+1};
    storage.setItem(prefix+':edition',JSON.stringify(next));
    return prefix+':'+JSON.stringify([eventId,next.revision,view]);
  } catch { return null; }
}

export function readListNavigation<T extends Filters>(storage:StorageAccess,key:string|null,defaults:T,now=Date.now()):{filters:T;scrollTop:number} {
  const fallback={filters:{...defaults},scrollTop:0};
  if(!key)return fallback;
  try {
    const saved=JSON.parse(storage.getItem(key)||'null');
    if(saved?.version!==1||!Number.isFinite(saved.updatedAt)||now-saved.updatedAt>lifetime||saved.updatedAt>now||!saved.filters||Array.isArray(saved.filters))return fallback;
    for(const field of Object.keys(defaults)) {
      const value=saved.filters[field];
      if(typeof value!==typeof defaults[field])continue;
      if(typeof value==='string'&&value.length>500)continue;
      if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<1||value>100000))continue;
      if(allowed[field]&&!allowed[field].includes(value))continue;
      (fallback.filters as Filters)[field]=value;
    }
    fallback.scrollTop=Number.isFinite(saved.scrollTop)&&saved.scrollTop>=0?Math.min(saved.scrollTop,10000000):0;
    return fallback;
  } catch { return fallback; }
}

export function saveListNavigation(storage:StorageAccess,key:string|null,filters:Filters,scrollTop:number,now=Date.now()) {
  if(!key)return;
  try {storage.setItem(key,JSON.stringify({version:1,updatedAt:now,filters,scrollTop}));}catch{/* Restricted storage must not break navigation. */}
}
