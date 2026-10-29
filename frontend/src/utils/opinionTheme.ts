import {hexToHSL} from '../context/ThemeContext';
const valid=(value?:string)=>value&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)?value:undefined;
export function contrastText(hex:string){
 const value=hex.length===4?'#'+[...hex.slice(1)].map(c=>c+c).join(''):hex;
 const rgb=[1,3,5].map(index=>parseInt(value.slice(index,index+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722>0.179?'#000000':'#ffffff';
}
/** Scope the existing CSS variable theme to the anonymous page; never change the signed-in edition. */
export function opinionTheme(appearance?:{primaryColor?:string;backgroundColor?:string}|null):Record<string,string>{
 const primary=valid(appearance?.primaryColor)||'#2563eb',background=valid(appearance?.backgroundColor)||'#09090b',foreground=contrastText(background),dark=foreground==='#ffffff';
 return {'--primary':hexToHSL(primary),'--primary-hover':hexToHSL(primary),'--ring':hexToHSL(primary),accentColor:primary,'--primary-foreground':hexToHSL(contrastText(primary)),
  '--background':hexToHSL(background),'--foreground':hexToHSL(foreground),'--card':dark?'240 6% 10%':'0 0% 100%',
  '--card-foreground':hexToHSL(foreground),'--muted':dark?'240 5% 18%':'240 5% 96%','--muted-foreground':hexToHSL(foreground),
  '--border':dark?'240 5% 40%':'240 5% 60%',colorScheme:dark?'dark':'light'};
}
