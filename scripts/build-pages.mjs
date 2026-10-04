import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Only these app files and pinned package assets can reach the published site.
export async function buildPages({outputDirectory=path.join(root,'dist')}={}){
  const output=path.resolve(outputDirectory);
  if(output===root||root.startsWith(output+path.sep))throw new Error('Build output must not contain the project root.');
  const files=new Map();
  const add=(name,source)=>files.set(name,{source});
  add('index.html',path.join(root,'index.html'));
  for(const entry of await fs.readdir(path.join(root,'src'),{withFileTypes:true})){
    if(entry.isFile()&&/\.(js|css)$/.test(entry.name))add('src/'+entry.name,path.join(root,'src',entry.name));
  }
  for(const entry of await fs.readdir(path.join(root,'public'),{withFileTypes:true})){
    if(entry.isFile()&&/\.(svg|png|ico|webmanifest)$/.test(entry.name))add('public/'+entry.name,path.join(root,'public',entry.name));
  }
  files.set('src/hosting-config.js',{data:'// Generated GitHub Pages build: direct browser requests, no backend.\nexport const STATIC_HOSTING = true;\n'});
  files.set('.nojekyll',{data:''});
  add('vendor/mammoth/mammoth.browser.min.js',path.join(root,'node_modules/mammoth/mammoth.browser.min.js'));
  add('vendor/mammoth/LICENSE',path.join(root,'node_modules/mammoth/LICENSE'));
  for(const name of ['pdf.min.mjs','pdf.worker.min.mjs'])add('vendor/pdfjs/'+name,path.join(root,'node_modules/pdfjs-dist/legacy/build',name));
  add('vendor/pdfjs/LICENSE',path.join(root,'node_modules/pdfjs-dist/LICENSE'));
  for(const dir of ['cmaps','standard_fonts'])for(const entry of await fs.readdir(path.join(root,'node_modules/pdfjs-dist',dir),{withFileTypes:true})){
    if(entry.isFile())add(`vendor/pdfjs/${dir}/${entry.name}`,path.join(root,'node_modules/pdfjs-dist',dir,entry.name));
  }
  files.set('vendor/versions.json',{data:JSON.stringify({mammoth:JSON.parse(await fs.readFile(path.join(root,'node_modules/mammoth/package.json'),'utf8')).version,pdfjs:JSON.parse(await fs.readFile(path.join(root,'node_modules/pdfjs-dist/package.json'),'utf8')).version},null,2)+'\n'});
  // Never delete or publish unknown existing files. Refuse symlinks and accidental
  // secrets in the output directory rather than deploying a mixed workspace.
  async function check(directory,prefix=''){
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const relative=prefix+entry.name;
      if(entry.isSymbolicLink())throw new Error('Build output must not contain symbolic links.');
      if(entry.isDirectory())await check(path.join(directory,entry.name),relative+'/');
      else if(!entry.isFile()||!files.has(relative))throw new Error('Unexpected file in build output: '+relative+'. Use an empty output directory.');
    }
  }
  try{const stat=await fs.lstat(output);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Build output must be a normal directory.');await check(output);}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(output,{recursive:true});
  for(const [name,file]of files){const destination=path.join(output,...name.split('/'));await fs.mkdir(path.dirname(destination),{recursive:true});if(file.source)await fs.copyFile(file.source,destination);else await fs.writeFile(destination,file.data);}
  return {output,files:[...files.keys()]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {output,files}=await buildPages();console.log(`GitHub Pages build: ${output} (${files.length} public files; no server, keys or saved data)`);
}
