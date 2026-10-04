// DOCX files are ZIP containers. Bound expanded size before invoking a parser.
export function validateDocxArchive(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(bytes.length<22||view.getUint32(0,true)!==0x04034b50)throw new Error('This file is not a valid DOCX document.');
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
    if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  }
  if(end<0)throw new Error('This file is not a valid DOCX document.');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
  if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count!==view.getUint16(end+8,true)||count>1000||count===65535||offset+size>end)throw new Error('DOCX archive is too complex or unsupported. Export the recipe as TXT.');
  let cursor=offset,expanded=0,documentFound=false;
  const decoder=new TextDecoder();
  for(let i=0;i<count;i++){
    if(cursor+46>end||view.getUint32(cursor,true)!==0x02014b50)throw new Error('This file is not a valid DOCX document.');
    const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),length=view.getUint32(cursor+24,true);
    const nameLength=view.getUint16(cursor+28,true),extraLength=view.getUint16(cursor+30,true),commentLength=view.getUint16(cursor+32,true);
    const next=cursor+46+nameLength+extraLength+commentLength;
    if(next>offset+size||flags&1||![0,8].includes(method)||length===0xffffffff)throw new Error('DOCX archive is encrypted or unsupported. Export the recipe as TXT.');
    expanded+=length;
    if(length>10*1024*1024||expanded>20*1024*1024)throw new Error('DOCX expanded content is too large. Export a shorter recipe as TXT.');
    if(decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength))==='word/document.xml')documentFound=true;
    cursor=next;
  }
  if(cursor!==offset+size||!documentFound)throw new Error('This file is not a valid DOCX document.');
}
