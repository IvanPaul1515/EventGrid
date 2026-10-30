import React from 'react';
import {resolveImageUrl} from '../../utils/imageUrl';
import {EditionBrand} from './EditionBrand';
export function HeaderBrand({name,logoUrl,horizontalLogoUrl,isDark}:{name?:string;logoUrl?:string|null;horizontalLogoUrl?:string|null;isDark:boolean}) {
 const source=horizontalLogoUrl||(/^BarCamp\b/i.test(name||'')?(isDark?'/barcamp-logo-nav.svg':'/barcamp-logo-nav-on-light.svg'):null);
 return source?<span className="flex h-8 w-28 lg:w-32 xl:w-40 items-center justify-center bg-transparent shrink-0"><img src={resolveImageUrl(source)} alt={name||'EventGrid'} className="h-full w-full object-contain"/></span>:<EditionBrand name={name} logoUrl={logoUrl}/>;
}
