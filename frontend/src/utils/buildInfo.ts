import type {BuildMetadata} from '../../../scripts/build-info.mjs';
declare const __EVENTGRID_BUILD__:BuildMetadata;
export const frontendBuild:BuildMetadata=typeof __EVENTGRID_BUILD__==='undefined'?{commit:'unknown',version:'unknown',builtAt:'unknown',environment:'unknown'}:__EVENTGRID_BUILD__;
