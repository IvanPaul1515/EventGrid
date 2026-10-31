import fs from 'node:fs';
import path from 'node:path';
export function emailLogoPreview(html:string,logoUrl:string,root?:string){const prepared=emailLogo(html,logoUrl,root),logo=prepared.attachments[0];return logo?prepared.html.replaceAll('cid:event-logo',`data:${logo.contentType};base64,${logo.content.toString('base64')}`):prepared.html;}
export function emailLogo(html:string,logoUrl:string,root=path.resolve(process.cwd(),'uploads/logos')) {
 const removeLogo=()=>html.replace(/<img\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/gi,(tag,_quote,src)=>src===logoUrl||src.replace(/&amp;/g,'&')===logoUrl?'':tag);
 let pathname='';try{pathname=decodeURIComponent(new URL(logoUrl,'http://local.invalid').pathname);}catch{return {html,attachments:[]};}
 const match=pathname.match(/^\/uploads\/logos\/([a-zA-Z0-9_.-]+\.(?:png|jpe?g|gif|webp))$/i);
 if(!match){
  // An unreachable local image is worse than a text-only header. Never attach arbitrary paths.
  let safe=false;try{const u=new URL(logoUrl);safe=u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)&&u.hostname.includes('.')&&!/\.(local|internal)$/i.test(u.hostname);}catch{}
  return {html:safe?html:removeLogo(),attachments:[]};
 }
 const target=path.join(root,match[1]);
 try{const real=fs.realpathSync(target),base=fs.realpathSync(root);if(!real.startsWith(base+path.sep)||!fs.statSync(real).isFile()||fs.statSync(real).size>2*1024*1024)return {html:html.replace(/<img\b[^>]*src=["'][^"']*\/uploads\/logos\/[^>]*>/gi,''),attachments:[]};
  const content=fs.readFileSync(real);const contentType=content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':content[0]===255&&content[1]===216?'image/jpeg':/^GIF8[79]a/.test(content.toString('ascii',0,6))?'image/gif':content.toString('ascii',0,4)==='RIFF'&&content.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!contentType)return {html:html.replace(/<img\b[^>]*src=["'][^"']*\/uploads\/logos\/[^>]*>/gi,''),attachments:[]};
  let used=false;const updated=html.replace(/src=(["'])([^"']+)\1/gi,(all,quote,url)=>{try{if(decodeURIComponent(new URL(url,'http://local.invalid').pathname)===pathname){used=true;return `src=${quote}cid:event-logo${quote}`;}}catch{}return all;});
  return {html:updated,attachments:used?[{content,cid:'event-logo',contentType,contentDisposition:'inline'}]:[]};
 }catch{return {html:html.replace(/<img\b[^>]*src=["'][^"']*\/uploads\/logos\/[^>]*>/gi,''),attachments:[]};}
}
