// Parsing happens in a disposable worker, without uploading files to a server.
let active=0;
export async function extractBrowserDocument(file){
  if(active>=2)throw new Error('Two recipe files are already being read. Wait and try again.');
  active++;
  let worker,timer;
  try{
    const buffer=await file.arrayBuffer();
    return await new Promise((resolve,reject)=>{
      worker=new Worker(new URL('./document-worker.js',import.meta.url),{type:'module'});
      timer=setTimeout(()=>reject(new Error('Document reading timed out. Try a shorter recipe or a TXT file.')),30000);
      worker.onmessage=({data})=>{
        // PDF.js also emits worker control messages. Only our parser reply
        // completes this request; otherwise a ready event looks like empty text.
        if(data?.type!=='nutrilens:document-result')return;
        if(data.error)reject(new Error(data.error));else resolve(data);
      };
      worker.onerror=()=>reject(new Error('The browser document reader is unavailable. Try a TXT file or a photo.'));
      worker.postMessage({name:file.name,buffer},[buffer]);
    });
  }finally{clearTimeout(timer);worker?.terminate();active--;}
}
