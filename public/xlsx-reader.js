/* Local XLSX reader: ZIP + Office Open XML, no network dependencies. */
window.readSalesXlsx=async function(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),dv=new DataView(bytes.buffer),decoder=new TextDecoder();let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65558);i--)if(dv.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('File bukan XLSX yang valid. Gunakan format .xlsx.');
 const entries=new Map();let pos=dv.getUint32(end+16,true);const n=dv.getUint16(end+10,true);
 for(let i=0;i<n;i++){if(dv.getUint32(pos,true)!==0x02014b50)throw Error('Struktur ZIP tidak valid.');const method=dv.getUint16(pos+10,true),size=dv.getUint32(pos+20,true),len=dv.getUint16(pos+28,true),extra=dv.getUint16(pos+30,true),comment=dv.getUint16(pos+32,true),offset=dv.getUint32(pos+42,true),name=decoder.decode(bytes.slice(pos+46,pos+46+len));entries.set(name,{method,size,offset});pos+=46+len+extra+comment;}
 async function xml(name){const e=entries.get(name);if(!e)return null;const start=e.offset+30+dv.getUint16(e.offset+26,true)+dv.getUint16(e.offset+28,true);let b=bytes.slice(start,start+e.size);if(e.method===8)b=new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else if(e.method!==0)throw Error('Kompresi XLSX tidak didukung.');const doc=new DOMParser().parseFromString(decoder.decode(b),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('XML di file tidak valid.');return doc;}
 const texts=node=>Array.from(node.getElementsByTagName('t')).map(x=>x.textContent).join('');
 const ss=await xml('xl/sharedStrings.xml'),strings=ss?Array.from(ss.getElementsByTagName('si')).map(texts):[];
 const wb=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels');if(!wb||!rels)throw Error('Workbook tidak ditemukan.');
 const targets=new Map(Array.from(rels.getElementsByTagName('Relationship')).map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 const date1904=wb.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904')==='1';
 const required=['Posting Date','Branch Name','Distribution Channel','Customer/Vendor Code','Customer/Vendor Name','Billing Number','Item Code','Description.','Sales','CTN Qty','Cancel Bill. Doc.','Billing Type','Salesman ID','Salesman Name'];
 for(const sheet of Array.from(wb.getElementsByTagName('sheet'))){const target=targets.get(sheet.getAttribute('r:id'));if(!target)continue;const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');const doc=await xml(path);if(!doc)continue;let headers=null,out=[];
 for(const row of Array.from(doc.getElementsByTagName('row'))){let vals=[];for(const c of Array.from(row.getElementsByTagName('c'))){const ref=c.getAttribute('r')||'',letters=ref.replace(/\d/g,'');let col=0;for(const ch of letters)col=col*26+ch.charCodeAt(0)-64;const type=c.getAttribute('t'),v=c.getElementsByTagName('v')[0]?.textContent??'';vals[col-1]=type==='s'?strings[Number(v)]:type==='inlineStr'?texts(c):v;}
 if(!headers){if(vals.includes('Posting Date')&&vals.includes('Branch Name')){headers=required.map(k=>vals.indexOf(k));const missing=required.filter((k,i)=>headers[i]<0);if(missing.length)throw Error('Kolom wajib tidak ditemukan: '+missing.join(', '));}continue;}
 if(vals.every(v=>v==null||v===''))continue;
 const r=headers.map(i=>vals[i]??'');
 if(!r[0]&&!r[3]&&!r[5])continue;
 let date=String(r[0]).trim();if(/^\d+(\.\d+)?$/.test(date)){const d=new Date((Number(date)-(date1904?24107:25569))*86400000);date=d.toISOString().slice(0,10);}else if(/^\d{4}-\d{2}-\d{2}/.test(date))date=date.slice(0,10);else {const m=date.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(m)date=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Posting Date tidak valid di baris '+row.getAttribute('r'));
 r[0]=date;for(const idx of [8,9]){if(String(r[idx]).trim()===''||!Number.isFinite(Number(r[idx])))throw Error('Sales/CTN Qty tidak valid di baris '+row.getAttribute('r'));r[idx]=Number(r[idx]);}out.push(r);
 }
 if(headers&&out.length)return {name:file.name,rows:out};
 }
 throw Error('Sheet sales report atau baris data tidak ditemukan.');
};
