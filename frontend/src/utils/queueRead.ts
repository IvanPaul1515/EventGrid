export function queueReadBody(token:string,device:{id:string;status:string}|null,scannerOnly=false) {
  if(scannerOnly&&device?.status!=='LINKED')throw {response:{status:409,data:{details:{code:'SCANNER_UNLINKED'}}}};
  return {token,...(device?{deviceId:device.id}:{})};
}
