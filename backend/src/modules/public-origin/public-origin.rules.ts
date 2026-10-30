import {isIP} from 'node:net';
import {BadRequestError} from '../../utils/errors.js';
export function publicOrigin(value:string) {
 if(/[\u0000-\u0020\u007f]/.test(value.trim())||!/^https:\/\//i.test(value.trim()))throw new BadRequestError('Introduce una URL HTTPS válida.');
 let u:URL;try{u=new URL(value.trim());}catch{throw new BadRequestError('Introduce una URL HTTPS válida.');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.port||isIP(u.hostname)||!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i.test(u.hostname)||/\.(localhost|local|internal|test|invalid|example)$/i.test(u.hostname))throw new BadRequestError('Usa un dominio público HTTPS, sin ruta, puerto, credenciales, parámetros ni fragmentos.');
 return u.origin;
}
export function publicAddress(address:string) {
 if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(isIP(address)===6){const a=address.toLowerCase();return !a.includes('.')&&/^[23][0-9a-f]{3}:/.test(a)&&!a.startsWith('2001:db8:');}
 return false;
}
export type PublicRoute='activation'|'recovery'|'opinions';
export function publicRoutePath(route:PublicRoute,value:string) {
 if(route==='opinions'){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw new BadRequestError('Identificador público no válido.');return '/opinions/'+value;}
 if(!/^[a-zA-Z0-9_-]{20,200}$/.test(value))throw new BadRequestError('Token público no válido.');
 if(route==='activation')return '/activate#token='+encodeURIComponent(value);
 if(route==='recovery')return '/reset-password#token='+encodeURIComponent(value);
 throw new BadRequestError('Ruta pública no permitida.');
}
