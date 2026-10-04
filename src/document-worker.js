// Dedicated worker: parse local bytes, never render document HTML or run macros.
import {validateDocxArchive} from './docx-archive.js';
const MAX_CHARS=60000;
self.onmessage=async({data:{name,buffer}})=>{
  try{
    const bytes=new Uint8Array(buffer);if(!bytes.length||bytes.length>5*1024*1024)throw new Error('Each recipe attachment must be 5 MB or smaller.');
    let text='',pages;
    if(/\.pdf$/i.test(name)){
      if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new Error('This file is not a valid PDF.');
      const pdfjs=await import('../vendor/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
      const task=pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWasm:false,enableXfa:false,verbosity:0,cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href});
      try{
        const pdf=await task.promise;pages=pdf.numPages;if(pages>30)throw new Error('Attach a recipe excerpt of 30 pages or fewer.');
        for(let i=1;i<=pages;i++){
          const page=await pdf.getPage(i),content=await page.getTextContent();
          for(const item of content.items){if(typeof item.str==='string')text+=item.str+(item.hasEOL?'\n':' ');if(text.length>MAX_CHARS)throw new Error('Recipe text exceeds 60,000 characters. Attach a shorter excerpt.');}
          text+='\n\n';page.cleanup();
        }
      }catch(error){if(error.name==='PasswordException')throw new Error('This PDF is password protected. Attach an unlocked copy.');throw error;}
      finally{await task.destroy();}
    }else if(/\.docx$/i.test(name)){
      validateDocxArchive(bytes);
      await import('../vendor/mammoth/mammoth.browser.min.js');
      const result=await self.mammoth.extractRawText({arrayBuffer:buffer},{externalFileAccess:false});text=result.value;
    }else throw new Error('Choose a PDF or DOCX recipe file.');
    text=text.trim();if(!text)throw new Error('No readable text found. Scanned/image-only recipes need a photo attachment instead.');
    if(text.length>MAX_CHARS)throw new Error('Recipe text exceeds 60,000 characters. Attach a shorter excerpt.');
    self.postMessage({type:'nutrilens:document-result',text,pages});
  }catch(error){
    const safe=/pages|characters|password|readable text|valid PDF|valid DOCX|too large|too complex|unsupported|5 MB/i.test(error.message)?error.message:'Could not read this document. It may be damaged or unsupported; try exporting it to TXT.';
    self.postMessage({type:'nutrilens:document-result',error:safe});
  }
};
