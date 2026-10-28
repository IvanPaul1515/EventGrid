export function selectShirtSize(current:string,original:string,next:string){
 return original&&next!==original&&next!==current?{size:current,pending:next}:{size:next,pending:null};
}
