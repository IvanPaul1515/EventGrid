type Worker={recognize:(file:Blob)=>Promise<{data:{text:string}}>;terminate:()=>Promise<unknown>};
export async function runReceiptOcr(file:Blob,create:()=>Promise<Worker>,signal:AbortSignal,timeout=90000){
 let worker:Worker|undefined,ended=false,timer:ReturnType<typeof setTimeout>|undefined;
 const stop=()=>{if(worker)void worker.terminate().catch(()=>{});};let abort=()=>{};
 try{return await Promise.race([(async()=>{worker=await create();if(ended||signal.aborted){stop();throw Error('Lectura cancelada.');}return (await worker.recognize(file)).data.text;})(),new Promise<never>((_,reject)=>{abort=()=>reject(Error('Lectura cancelada.'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(Error('La lectura tardó demasiado. Reintenta con una imagen más clara.')),timeout);})]);}
 finally{ended=true;clearTimeout(timer);signal.removeEventListener('abort',abort);stop();}
}
