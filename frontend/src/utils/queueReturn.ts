// Returning from a receipt clears the selection, never the operator's list context.
export function returnToReception<T extends {selected:unknown}>(context:T){return {...context,selected:null};}
