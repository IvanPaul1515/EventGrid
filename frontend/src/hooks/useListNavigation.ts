import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useAuth} from '../context/AuthContext';
import {useEdition} from '../context/EditionContext';
import {listNavigationScope,readListNavigation,saveListNavigation} from '../utils/listNavigation';

export function useListNavigationScope(view:string){
 const {user,token}=useAuth(),{currentEvent}=useEdition();
 return useMemo(()=>{try{return listNavigationScope(sessionStorage,user?.id,token,currentEvent?.id,view);}catch{return null;}},[user?.id,token,currentEvent?.id,view]);
}

export function useListNavigation(key:string|null,filters:Record<string,string|number>,loading:boolean,detailOpen:boolean,enabled=true){
 const initial=useRef<{scrollTop:number}|null>(null);
 if(!initial.current){try{initial.current=readListNavigation(sessionStorage,key,filters);}catch{initial.current={scrollTop:0};}}
 const position=useRef(initial.current.scrollTop),latest=useRef(filters),restore=useRef(true),wasOpen=useRef(false);
 const open=useRef(detailOpen);open.current=detailOpen;
 latest.current=filters;
 const save=()=>{try{saveListNavigation(sessionStorage,key,latest.current,position.current);}catch{/* Storage may be unavailable. */}};
 useEffect(()=>{if(enabled)save();},[key,filters,enabled]);
 useLayoutEffect(()=>{
  if(!enabled)return;
  const element=document.querySelector<HTMLElement>('[data-app-scroll]');
  const remember=()=>{if(!restore.current&&!open.current&&element)position.current=element.scrollTop;};
  element?.addEventListener('scroll',remember,{passive:true});
  return()=>{element?.removeEventListener('scroll',remember);save();};
 },[key,enabled]);
 useEffect(()=>{
  if(!enabled)return;
  if(detailOpen){if(!wasOpen.current){position.current=document.querySelector<HTMLElement>('[data-app-scroll]')?.scrollTop||0;save();}wasOpen.current=true;return;}
  if(wasOpen.current){restore.current=true;wasOpen.current=false;}
  if(loading||!restore.current)return;
  const frame=requestAnimationFrame(()=>{document.querySelector<HTMLElement>('[data-app-scroll]')?.scrollTo({top:position.current,behavior:'instant'});restore.current=false;});
  return()=>cancelAnimationFrame(frame);
 },[key,loading,detailOpen,enabled]);
}
