import {describe,it,expect,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
vi.mock('../../frontend/src/context/EditionContext',()=>({useEdition:()=>({currentEvent:{id:'event',settings:{currencyCode:'DOP'}}})}));
vi.mock('../../frontend/src/context/AuthContext',()=>({useAuth:()=>({hasRole:()=>true})}));
vi.mock('../../frontend/src/components/ImportedContributionsPanel',()=>({ImportedContributionsPanel:()=>React.createElement('section',{'data-imported-contributions':'true'})}));
import {SponsorsPage} from '../../frontend/src/pages/SponsorsPage';
describe('sponsor contribution placement',()=>{it('renders exactly one shared contribution manager',()=>{const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(SponsorsPage)));expect((html.match(/data-imported-contributions/g)||[]).length).toBe(1);});});
