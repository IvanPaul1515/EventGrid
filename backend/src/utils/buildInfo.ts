import {readFileSync} from 'node:fs';
import {buildMetadata} from '../../../scripts/build-info.mjs';
export function getBuildInfo() {
 try{return buildMetadata(JSON.parse(readFileSync(new URL('../../build-info.json',import.meta.url),'utf8')));}
 catch{return buildMetadata({environment:process.env.NODE_ENV});}
}
