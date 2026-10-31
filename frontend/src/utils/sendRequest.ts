/** A synchronous gate prevents double clicks; settlement never waits for delivery/webhooks. */
export function sendRequestGate(){let pending=false;return {get pending(){return pending;},async run<T>(action:()=>Promise<T>,busy:(value:boolean)=>void):Promise<T|undefined>{if(pending)return undefined;pending=true;busy(true);try{return await action();}finally{pending=false;busy(false);}}};}
