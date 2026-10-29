import {Grid} from 'lucide-react';
import {resolveImageUrl} from '../../utils/imageUrl';
export function EditionBrand({name,logoUrl,compactLogoUrl,compact=false}:{name?:string;logoUrl?:string|null;compactLogoUrl?:string|null;compact?:boolean}) {
 const source=compact?(compactLogoUrl||logoUrl):logoUrl;
 return <span className={`flex items-center justify-center min-w-0 ${compact?'h-10 w-12':'h-9 max-w-24'}`}>
  {source?<img src={resolveImageUrl(source)} alt={name||'EventGrid'} className="h-full w-full min-w-0 max-w-full object-contain"/>:<Grid aria-label="EventGrid" role="img" className="h-8 w-8 text-primary shrink-0"/>}
 </span>;
}
