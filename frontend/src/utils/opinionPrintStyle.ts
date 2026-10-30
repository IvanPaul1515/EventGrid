/** Standalone print window: do not depend on the administrative Tailwind stylesheet. */
export function opinionPrintStyle(size:'compact'|'a4') {
 const base='body{font-family:system-ui;text-align:center;padding:2cm;color:#111;margin:0}img{max-width:100%;object-fit:contain;display:block;margin:0 auto}img:not([alt="QR de opiniones"]){max-height:1.8cm;max-width:5cm}img[alt="QR de opiniones"]{width:13cm;height:13cm}h1{font-size:28pt}p{font-size:16pt}@page{size:A4;margin:1cm}';
 return size==='compact'?base+'body{padding:8mm}h1{font-size:16pt}p{font-size:11pt}img[alt="QR de opiniones"]{width:8cm;height:8cm}@page{size:A5;margin:5mm}':base;
}
