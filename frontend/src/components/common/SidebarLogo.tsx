import React from 'react';
import {EditionBrand} from './EditionBrand';

export function SidebarLogo({compact=false,isDark=true,name,logoUrl,compactLogoUrl,loginLogoUrl}:{compact?:boolean;isDark?:boolean;name?:string;logoUrl?:string|null;compactLogoUrl?:string|null;loginLogoUrl?:string|null}) {
  if(!/^BarCamp\b/i.test(name||''))return <EditionBrand name={name} logoUrl={logoUrl} compactLogoUrl={compactLogoUrl} loginLogoUrl={loginLogoUrl} compact={compact}/>;
  return <span className={`flex shrink-0 items-center justify-center bg-transparent ${compact?'h-10 w-12':'h-9 w-16'}`}>
    <img src={isDark?'/barcamp-logo-white.svg':'/barcamp-logo-black.svg'} alt="BarCamp" className="h-8 w-8 max-w-full object-contain"/>
  </span>;
}
