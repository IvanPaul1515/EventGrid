import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function buildMetadata(input={}) {
 const commit=/^[a-f0-9]{7,40}$/.test(input.commit||'')?input.commit:'unknown';
 const version=/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(input.version||'')?input.version:'unknown';
 const validDate=/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(input.builtAt||'')&&Number.isFinite(Date.parse(input.builtAt));
 const environment=['docker','docker-private','demo','production','development','test'].includes(input.environment)?input.environment:'unknown';
 return {commit,version,builtAt:validDate?new Date(input.builtAt).toISOString():'unknown',environment};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const version=JSON.parse(readFileSync(process.argv[3],'utf8')).version;
 writeFileSync(process.argv[2],JSON.stringify(buildMetadata({version,commit:process.env.VCS_REF,builtAt:process.env.BUILD_DATE,environment:process.env.BUILD_ENV})));
}
