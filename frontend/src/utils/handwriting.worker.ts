import {pipeline,env} from '@huggingface/transformers';
env.allowLocalModels=false;
if(env.backends.onnx.wasm){env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;}
let recognizer:Promise<any>|undefined;
self.onmessage=async(event:MessageEvent<{lines:string[]}>)=>{try{
 self.postMessage({status:'loading'});
 recognizer ||= pipeline('image-to-text','Xenova/trocr-small-handwritten',{device:'wasm',dtype:'q8'});
 const read=await recognizer;const output:string[]=[];
 for(let i=0;i<event.data.lines.length;i++){const result=await read(event.data.lines[i],{max_new_tokens:160});output.push(result[0]?.generated_text||'');self.postMessage({status:'progress',current:i+1,total:event.data.lines.length});}
 self.postMessage({status:'done',text:output.join('\n')});
 }catch{recognizer=undefined;self.postMessage({status:'error'});}};
