export function inheritSmtpPassword(config:any,global:any) {
 if(!config?.password&&global?.password&&config?.eventId&&config.host===global.host&&config.port===global.port&&Boolean(config.secure)===Boolean(global.secure)&&config.user===global.user)return {...config,password:global.password,passwordInherited:true};
 return config;
}
export function smtpPolicy(env:Record<string,string|undefined>=process.env) {
 const blocked=env.BLOCK_REAL_EMAIL==='true'||env.DEMO_QUICK_ACCESS==='true'||env.NODE_ENV==='test'||Boolean(env.VITEST)||(env.NODE_ENV==='development'&&env.ALLOW_REAL_EMAIL_IN_DEV!=='true');
 const simulationAllowed=env.NODE_ENV==='test'||Boolean(env.VITEST)||env.NODE_ENV==='development'||env.DEMO_QUICK_ACCESS==='true'||env.CONTAINER_MODE!=='true';
 return {realEmailBlocked:blocked,realEmailAllowed:!blocked,simulationAllowed};
}
export function smtpConfigured(config:any) {return Boolean(config?.host&&config?.port&&config?.fromEmail&&(!config.user||config.password));}
export function publicSmtpStatus(config:any) {return Object.fromEntries(['isEnabled','isConfigured','connectionVerified','realEmailBlocked','realEmailAllowed','passwordInherited','simulationAllowed'].map(key=>[key,Boolean(config?.[key])]));}
