export type ExportAsset={id:string;filename:string;storage_path:string;file_type:string;size_bytes:number;created_at:string;tags?:string[]|null;ai_categories?:string[]|null;notes?:string|null;folder_id?:string|null;photographer?:string|null;export_name?:string};
export const ZIP32_EXPORT_LIMIT=3_500_000_000;

export function safeExportName(value:string){const cleaned=value.replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").replace(/^\.+/,"_").trim();return cleaned||"media"}
export function nameExportAssets(assets:ExportAsset[]){const used=new Set<string>();return assets.map(asset=>{const safe=safeExportName(asset.filename),dot=safe.lastIndexOf("."),stem=dot>0?safe.slice(0,dot):safe,ext=dot>0?safe.slice(dot):"";let name=safe,index=2;while(used.has(name.toLowerCase()))name=`${stem} (${index++})${ext}`;used.add(name.toLowerCase());return{...asset,export_name:name}})}
export function exportManifest(assets:ExportAsset[]){return{format:"Fireova Media Bank export",version:1,exported_at:new Date().toISOString(),count:assets.length,items:assets.map(({storage_path,...asset})=>asset)}}

const table=(()=>{const out=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;out[n]=c>>>0}return out})();
export function crc32(seed:number,chunk:Uint8Array){let value=seed;for(const byte of chunk)value=table[(value^byte)&255]^(value>>>8);return value>>>0}
const bytes=(length:number,write:(view:DataView)=>void)=>{const out=new Uint8Array(length);write(new DataView(out.buffer));return out};
const text=(value:string)=>new TextEncoder().encode(value);
export function zipLocalHeader(name:string){const n=text(name);const out=bytes(30+n.length,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0808,true);v.setUint16(8,0,true);v.setUint16(26,n.length,true)});out.set(n,30);return out}
export function zipDescriptor(crc:number,size:number){return bytes(16,v=>{v.setUint32(0,0x08074b50,true);v.setUint32(4,crc,true);v.setUint32(8,size,true);v.setUint32(12,size,true)})}
export function zipCentralHeader(name:string,crc:number,size:number,offset:number){const n=text(name);const out=bytes(46+n.length,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0808,true);v.setUint16(10,0,true);v.setUint32(16,crc,true);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true)});out.set(n,46);return out}
export function zipEnd(count:number,centralSize:number,centralOffset:number){return bytes(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,centralSize,true);v.setUint32(16,centralOffset,true)})}
