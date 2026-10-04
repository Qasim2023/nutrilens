// Isolated local UI test backend. No external API requests or real credentials.
import http from 'node:http';
import {createAppServer} from '../server.mjs';
let calls=0;
const provider=http.createServer(async(req,res)=>{
  if(req.url==='/test-status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({calls}));return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400);res.end();return;}
  calls++;
  const content=body.messages?.at(-1)?.content || '';
  const text=typeof content==='string' ? content : content.filter(p=>p.type==='text').map(p=>p.text).join(' ');
  if(text.includes('simulate failure')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Mock provider unavailable'}}));return;}
  if(text.includes('simulate slow'))await new Promise(r=>setTimeout(r,7000));
  else await new Promise(r=>setTimeout(r,1200));
  if(res.destroyed)return;
  const apple=/apple/i.test(text),dish=apple?'Apple test meal':'Eggs and toast';
  const data={dish,summary:'Local mock provider fixture #'+calls,confidence:0.8,portion_notes:apple?'One medium apple.':'2 large eggs and one standard slice of toast.',items:[{name:dish,quantity:'1 described meal',calories:apple?95:238.4,protein_g:apple?0.5:13,carbs_g:apple?25:18,fat_g:apple?0.3:12}],total:{calories:apple?95:238.4,protein_g:apple?0.5:13,carbs_g:apple?25:18,fat_g:apple?0.3:12,fiber_g:apple?4.4:2,sugar_g:apple?19:1,sodium_mg:apple?2:250},micros:{calcium_mg:80,iron_mg:2.3,vitamin_c_mg:apple?8:0,vitamin_b12_ug:0.6},health_score:70,health_summary:'Detailed fixture for full-result persistence tests.',pros:['Includes protein'],cons:['Portions are estimates'],allergens:apple?[]:['egg','gluten'],swaps:[{from:'White toast',to:'Wholegrain toast',why:'More fibre'}],confidence_notes:'Generic test data only.'};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(data)}}]}));
});
provider.listen(5190,'127.0.0.1');
const app=createAppServer({allowedOrigins:['http://127.0.0.1:5190']});
app.listen(5188,'127.0.0.1',()=>console.log('Isolated diary UI test: http://localhost:5188'));
