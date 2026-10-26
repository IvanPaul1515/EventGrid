import React, { useMemo, useState } from 'react';
export function responsiveEmailDocument(html: string) {
    const rules = '<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data: cid:; style-src \'unsafe-inline\'; font-src https: data:; script-src \'none\'; form-action \'none\'; base-uri \'none\'"><style>html,body{margin:0;max-width:100%;overflow-wrap:anywhere}img{max-width:100%!important;height:auto}table{max-width:100%!important} @media(max-width:480px){table,td{box-sizing:border-box}table[width],table[style*=\"width\"]{width:100%!important}td{overflow-wrap:anywhere}a{overflow-wrap:anywhere}}</style>';
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, match => match + rules) : '<!doctype html><html><head>' + rules + '</head><body>' + html + '</body></html>';
}
export function EmailPreview({ html, mode: controlledMode, onModeChange, hideControls = false }: {
    html: string;
    mode?: 'desktop' | 'mobile';
    onModeChange?: (mode: 'desktop' | 'mobile') => void;
    hideControls?: boolean;
}) {
    const [localMode, setLocalMode] = useState<'desktop' | 'mobile'>('desktop');
    const mode = controlledMode || localMode;
    const setMode = (value: 'desktop' | 'mobile') => { setLocalMode(value); onModeChange?.(value); };
    const document = useMemo(() => responsiveEmailDocument(html), [html]);
    return <section className="min-w-0 space-y-2" aria-label="Vista previa responsive">{!hideControls && <div className="flex gap-2 flex-wrap">{(['desktop', 'mobile'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-lg border border-border px-3 py-2 text-xs ${mode === value ? 'bg-primary text-white' : 'bg-card'}`}>{value === 'desktop' ? 'PC' : 'iPhone / Móvil'}</button>)}</div>}<div className="bg-muted/40 rounded-xl border border-border p-2 sm:p-4 overflow-x-auto"><div data-testid="email-preview-frame" className={`mx-auto shrink-0 bg-white overflow-hidden ${mode === 'mobile' ? 'border-[8px] border-zinc-700 rounded-[28px]' : 'border border-border rounded-lg'}`} style={{ width: mode === 'mobile' ? 375 : '100%', maxWidth: mode === 'mobile' ? '100%' : 900 }}>{mode === 'mobile' && <div className="bg-zinc-700 h-4"/>}<iframe title="Vista previa de comunicación" sandbox="" referrerPolicy="no-referrer" srcDoc={document} className="w-full h-[460px] border-0"/></div></div><p className="text-xs text-muted-foreground">Simulación de anchura; no garantiza el mismo resultado en Apple Mail. Cambiar de vista no envía correos.</p></section>;
}
