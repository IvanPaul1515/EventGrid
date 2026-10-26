// Presentation only: no persistence, scheduling or provider calls.
export function responsiveEmailHtml(html: string) {
    const head = '<meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{max-width:100%;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%} @media(max-width:480px){table[width],table[style*="width"]{width:100%!important;max-width:100%!important}td{box-sizing:border-box;overflow-wrap:anywhere}img{max-width:100%!important}a{overflow-wrap:anywhere}}</style>';
    const source = html.replace(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/gi, '');
    return /<head\b[^>]*>/i.test(source) ? source.replace(/<head\b[^>]*>/i, m => m + head) : '<!doctype html><html><head>' + head + '</head><body>' + source + '</body></html>';
}
