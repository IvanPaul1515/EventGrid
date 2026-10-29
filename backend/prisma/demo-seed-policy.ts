/** Explicit demo activation only. Installing or restarting an operational instance never seeds demo identities. */
export function demoSeedAllowed(env:Record<string,string|undefined>){return env.DEMO_QUICK_ACCESS==='true';}
