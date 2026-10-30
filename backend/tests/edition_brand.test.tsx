import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {EditionBrand} from '../../frontend/src/components/common/EditionBrand';
describe('configurable expanded and compact edition branding',()=>{
 it('uses a configured login logo when the main asset is absent or whitespace, without event-specific defaults',()=>{const html=renderToStaticMarkup(<EditionBrand compact logoUrl=" " compactLogoUrl=" " loginLogoUrl=" /configured-login.svg "/>);expect(html).toContain('src="/configured-login.svg"');expect(html).not.toContain('aria-label="EventGrid"');});
 it('centers a bounded compact asset without substituting an institution logo',()=>{const html=renderToStaticMarkup(<EditionBrand compact name="Evento QA" logoUrl="/wide.svg" compactLogoUrl="/compact.svg"/>);expect(html).toContain('/compact.svg');expect(html).not.toContain('/wide.svg');expect(html).toContain('object-contain');expect(html).toContain('h-10 w-12');expect(html).toContain('Evento QA');});
 it('adapts the configured wide logo if no compact asset is available',()=>{const html=renderToStaticMarkup(<EditionBrand compact logoUrl="/wide.svg"/>);expect(html).toContain('/wide.svg');expect(html).toContain('max-w-full');});
 it('uses the edition logo in expanded mode and a neutral themed fallback when unavailable',()=>{expect(renderToStaticMarkup(<EditionBrand logoUrl="/wide.svg" compactLogoUrl="/compact.svg"/>)).toContain('/wide.svg');const html=renderToStaticMarkup(<EditionBrand compact/>);expect(html).toContain('aria-label="EventGrid"');expect(html).toContain('text-primary');expect(html.toLowerCase()).not.toContain('barcamp');});
});
