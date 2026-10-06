// QA local: LiquidJS para el marcado y Chromium para URL/controles. Los filtros exclusivos de Shopify usan adaptadores de fixtures.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createServer } from 'node:http';
import { CATALOG } from '../lib/shopify/components/catalog';
import { productMetafields } from '../lib/shopify/publish/mapping';
import { SETTINGS } from '../lib/store-preview/theme.generated';
const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium, expect } = require('@playwright/test');
const { Liquid } = require(process.env.PI_LIQUIDJS_ROOT ? join(process.env.PI_LIQUIDJS_ROOT, 'node_modules/liquidjs') : 'liquidjs');
const theme = join(process.cwd(), 'lib/shopify/themes/DropPulse');
const clean = (s:string) => s.replace(/{%-?\s*doc\s*-?%}[\s\S]*?{%-?\s*enddoc\s*-?%}/g,'').replace(/{%-?\s*(stylesheet|schema|javascript)\s*-?%}[\s\S]*?{%-?\s*end\1\s*-?%}/g,'');
const engine = new Liquid({root:join(theme,'snippets'), extname:'.liquid', fs: {
 exists:async(p:string)=>existsSync(p), existsSync, readFile:async(p:string)=>clean(readFileSync(p,'utf8')), readFileSync:(p:string)=>clean(readFileSync(p,'utf8')),
 resolve:(dir:string,file:string,ext:string)=>resolve(dir,file.endsWith(ext)?file:file+ext), dirname, sep:"/",
}});
engine.registerFilter('asset_url',(v:string)=>'/assets/'+v);
engine.registerFilter('stylesheet_tag',()=> '');
engine.registerFilter('color_brightness',()=>200);
engine.registerFilter('color_to_hex',(v:string)=>v);
engine.registerFilter('color_to_rgb',(v:string)=>v);
engine.registerFilter('color_modify',(v:string)=>v);
engine.registerFilter('image_url',(v:Record<string,unknown>)=>v?.url??'/test.svg');
engine.registerFilter('image_tag',(v:string)=>`<img src="${v}" alt="Imagen de prueba local" width="120" height="120">`);
engine.registerFilter('money',(v:number)=>'$'+(v/100).toFixed(0));
engine.registerFilter('money_with_currency',(v:number)=>'$'+(v/100).toFixed(0));
engine.registerFilter('font_url',()=> '');
engine.registerFilter('video_tag',()=>'<video muted preload="none"></video>');
const listing = {title:'Organizador para tu escritorio',short_name:'Organizador',short_description:'Mantén tus útiles juntos y encuentra lo que necesitas en tu escritorio.',offer_line:'Organiza tu escritorio · Paga al recibir',seo_title:'Organizador para escritorio',seo_description:'Ordena tus útiles en el escritorio y encuentra lo que necesitas. Paga al recibir en tu casa.'};
const v = (content:unknown)=>[
 {key:'default',angle_id:null,hook_id:null,content},
 {key:'comfort',angle_id:'angle_1',hook_id:null,content:content && typeof content==='object' && 'title' in content ? {...content,title:'Organiza tus útiles con comodidad'} : content},
 {key:'opening',angle_id:'angle_1',hook_id:'hook_2',content:content && typeof content==='object' && 'title' in content ? {...content,title:'Encuentra tus útiles en el escritorio'} : content},
];
const components=CATALOG.map(c=>({id:c.id,content:v(c.examples[0]),variantImages:c.id==='ugc-slider'?[{key:'default',images:{videos:['video-a']}},{key:'comfort',images:{videos:['video-b']}},{key:'opening',images:{videos:['video-b','video-a']}}]:c.id==='image-with-benefits'?[{key:'default',images:{main:['base']}},{key:'comfort',images:{main:['other']}},{key:'opening',images:{main:['third']}}]:undefined,images:c.id==='ugc-slider'?{videos:['video-a']}:c.id==='image-with-benefits'?{main:['base']}:c.id==='stats-with-image'?{collage:['base']}:c.id==='insta-story'?{stories:['base','other','third']}:c.id==='gif-strip'?{gifs:['base']}:{} }));
const mapped=productMetafields({listing,listingVariants:v(listing),components,reviews:Array.from({length:4},(_,i)=>({id:'r'+(i+1),author:'M***a',rating:5,body:'Reseña para la prueba local del componente. El producto llegó como esperaba.',photos:[]})),packs:[{units:1,price:19990},{units:2,price:29990}],accent:null,gallery:[]},new Map([['base','gid://shopify/MediaImage/1'],['other','gid://shopify/MediaImage/2'],['third','gid://shopify/MediaImage/3'],['video-a','gid://shopify/Video/1'],['video-b','gid://shopify/Video/2']]));
const img={url:'/test.svg',width:120,height:120,aspect_ratio:1,media_type:'image',preview_image:{url:'/test.svg',width:120,height:120}};
const metafields:Record<string,unknown>={};
for(const m of mapped.set) metafields[m.key]={value:m.type==='json'?JSON.parse(m.value):m.type==='list.file_reference'?JSON.parse(m.value).map((id:string)=>id.includes('/Video/')?{id:id.split('/').pop(),media_type:'video',preview_image:img,sources:[{url:'/test-'+id.split('/').pop()+'.mp4',mime_type:'video/mp4',format:'mp4'}]}:({...img,url:'/test.svg?file='+id.split('/').pop()})):m.type==='file_reference'?img:m.value};
metafields.ugc_videos={value:[{id:1,media_type:'video',preview_image:img,sources:[{url:'/test.mp4',mime_type:'video/mp4',format:'mp4'}]}]};
const product={id:123,title:listing.title,url:'/products/test',available:true,metafields:{dropflex:metafields},featured_image:img,images:[img],variants:[{id:9,price:1999000,available:true,inventory_quantity:10,inventory_management:'shopify'}],options:['Title']};
const shop={metafields:{dropflex:{policies:{value:{cod:true,free_shipping:true,return_days:30,warranty_months:6,whatsapp:'123'}},logistics:{value:{handling_days:1,transit_days_min:2,transit_days_max:4,cutoff_hour:12,timezone:'America/Santiago',business_days_only:true}}}},money_format:'${{amount_no_decimals}}',currency:'CLP'};
const request={page_type:'product',design_mode:false,locale:{iso_code:'es'}};
let html=readFileSync(join(theme,'snippets/df-landing-selector.liquid'),'utf8');
for(const c of CATALOG){const source=clean(readFileSync(join(theme,c.file),'utf8'));const settings={...SETTINGS[c.id],product};html+=await engine.parseAndRender(source,{product,closest:{product},shop,request,section:{id:'sec-'+c.id,settings,blocks:[]},block:{id:'block-'+c.id,settings}});}
for(const name of ['df-title','df-subtitle','df-pack-offers']) html+=await engine.parseAndRender(clean(readFileSync(join(theme,'blocks',name+'.liquid'),'utf8')),{product,closest:{product},shop,request,section:{id:'listing',settings:{}},block:{id:name,settings:{}}});
html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+readFileSync(join(process.cwd(), 'components/store-preview/store.generated.css'),'utf8')+'</style></head><body><div class="df-store">'+html+'</div></body></html>';
writeFileSync('/private/tmp/pi-variants-rendered.html',html);
const server=createServer((req,res)=>{const pathname=new URL(req.url??'/','http://localhost').pathname;if(pathname.startsWith('/assets/')){const file=join(theme,pathname);if(existsSync(file)){res.setHeader('content-type',file.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(file));return;}}if(pathname==='/test.svg'){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#eee"/></svg>');return;}res.setHeader('content-type','text/html; charset=utf-8');res.end(html);});
await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const address=server.address();if(!address||typeof address==='string')throw Error('address');
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
  const page=await browser.newPage({viewport});const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
  for(const [query,key] of [['','default'],['?df_angle=angle_1','comfort'],['?df_angle=angle_1&df_hook=hook_2','opening'],['?df_angle=angle_1&df_hook=unknown','comfort'],['?df_angle=unknown&df_hook=hook_2','default'],['?df_hook=hook_2','default'],['?df_angle=angle_1&df_angle=other','default'],['?df_angle=%3Cscript%3E','default']]){
   await page.goto(`http://127.0.0.1:${address.port}/${query}`);await page.waitForLoadState('networkidle');
   await expect(page.locator('df-landing-content')).toHaveCount(19);
   await expect(page.locator('[data-df-component="df-title"] > [data-df-active] h1')).toHaveText(key==='opening'?'Encuentra tus útiles en el escritorio':key==='comfort'?'Organiza tus útiles con comodidad':listing.title);
   const selected=await page.locator('df-landing-content').evaluateAll((nodes:Element[])=>nodes.map(n=>n.getAttribute('data-df-selected')));
   if(selected.some((s:string)=>s!==key)) throw Error(JSON.stringify({query,selected}));
   const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)});
   if(duplicates.length)throw Error('Duplicate live IDs: '+duplicates.join(','));
   const videoSources=await page.locator('[data-df-component="df-ugc-slider"] > [data-df-active] [data-src]').evaluateAll((nodes:Element[])=>nodes.map(n=>n.getAttribute('data-src')));
   const expectedVideos=key==='opening'?['/test-2.mp4','/test-1.mp4']:key==='comfort'?['/test-2.mp4']:['/test-1.mp4'];
   if(JSON.stringify(videoSources)!==JSON.stringify(expectedVideos))throw Error('UGC video order: '+JSON.stringify({query,videoSources,expectedVideos}));
   await page.locator('.df-faq-and-text summary').first().click();
   await expect(page.locator('.df-faq-and-text details').first()).toHaveAttribute('open', '');
   await expect(page.locator('[data-df-component="df-image-with-benefits"] > [data-df-active] img').first()).toHaveAttribute('src', '/test.svg?file='+(key==='opening'?'3':key==='comfort'?'2':'1'));
  }
  await page.evaluate(()=>{history.pushState({},'', '?df_angle=angle_1&df_hook=hook_2');dispatchEvent(new PopStateEvent('popstate'));});
  if((await page.locator('df-landing-content[data-df-selected="opening"]').count())!==19)throw Error('popstate');
  if(errors.length)throw Error(errors.join('\n'));
  await page.screenshot({path:`/private/tmp/pi-variants-${viewport.width}.png`,fullPage:true});await page.close();
 }
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();await page.goto(`http://127.0.0.1:${address.port}/?df_angle=angle_1`);await expect(page.locator('[data-df-component="df-title"] > [data-df-active] h1')).toContainText(listing.title);await context.close();
 console.log('Liquid + Chromium: 19 components, 8 URL cases × 2 viewports, IDs, history navigation and no-JS fallback passed. Shopify-only filters use fixture adapters.');
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
