// Cooking Chaos - servidor autoritativo. Sin dependencias: solo Node >= 18.
// Sirve cooking-chaos.html y habla WebSocket en el mismo puerto.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||8080;
const MAP=["KTLQGPCCSSOK","M..........K","B..........D","K..........D","K...KKKK...K","K..........K","X..........K","K..........K","KKKKKKKKKKKK"];
const CRATE={T:'tomato',M:'meat',B:'bun',L:'lettuce',Q:'cheese',G:'dough'},CHOP=['tomato','meat','lettuce','cheese'];
const RECIPES={
 ensalada:{time:50,pts:50,from:0,req:[['lettuce','chopped'],['tomato','chopped']]},
 pizza:{time:80,pts:120,from:20,bake:true,req:[['dough','raw'],['tomato','chopped'],['cheese','chopped']]},
 bocata:{time:60,pts:70,from:0,req:[['meat','cooked'],['bun','raw']]},
 burger:{time:75,pts:110,from:35,req:[['meat','cooked'],['bun','raw'],['tomato','chopped']]}};
const rkey=a=>a.map(x=>x[0]+':'+x[1]).sort().join('|');
const GOAL=350,GT=180,COLORS=[0xe8452c,0x2f7de1,0x3fae55,0x9b4fd1];
const tileAt=(c,r)=>(MAP[r]&&MAP[r][c])||null;
const solid=(c,r)=>{const t=tileAt(c,r);return !t||t!=='.'};
function hit(x,z){const c0=Math.floor((x+12)/2),r0=Math.floor((z+9)/2);for(let r=r0-1;r<=r0+1;r++)for(let c=c0-1;c<=c0+1;c++)if(solid(c,r)){const cx=(c-5.5)*2,cz=(r-4)*2,qx=Math.max(cx-1,Math.min(cx+1,x)),qz=Math.max(cz-1,Math.min(cz+1,z));if((x-qx)**2+(z-qz)**2<.2025)return true}return false}
const ni=t=>({kind:'ing',type:t,state:'raw',chop:0,cook:0}),np=()=>({kind:'plate',c:[],bake:0,baked:false,burnt:false});
/* ---------- salas ---------- */
const rooms=new Map();
const uid=()=>crypto.randomBytes(6).toString('hex');
function code(){let c;do{c=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random()*24)]).join('')}while(rooms.has(c));return c}
const send=(c,o)=>{if(c&&c.sock&&!c.sock.destroyed)try{c.sock.write(frame(JSON.stringify(o)))}catch(e){}};
const bc=(rm,o)=>rm.players.forEach(p=>send(p.conn,o));
function lobby(rm){bc(rm,{t:'lobby',code:rm.code,host:rm.host,phase:rm.phase,pl:[...rm.players.values()].map(p=>({id:p.id,n:p.name,c:p.col,r:p.ready,off:!!p.off}))})}
function newPlayer(conn,name,rm){const used=[...rm.players.values()].map(p=>p.col);const col=[0,1,2,3].find(i=>!used.includes(i));
 const p={id:uid(),tok:uid(),name:String(name||'Chef').slice(0,12),col,ready:false,conn,x:-3+rm.players.size*2,z:2,vx:0,vz:0,a:0,held:null,in:{x:0,z:0,w:false},work:false,off:false};rm.players.set(p.id,p);return p}
function startRoom(rm){rm.phase='play';rm.tl={};rm.orders=[];Object.assign(rm,{time:GT,el:0,nx:1,score:0,combo:0,oid:0,ev:[]});let i=0;rm.players.forEach(p=>{Object.assign(p,{x:-3+i*2,z:2,vx:0,vz:0,a:0,held:null,work:false});i++});bc(rm,{t:'go'})}
function endRoom(rm){rm.phase='lobby';bc(rm,{t:'end',score:rm.score,win:rm.score>=GOAL,goal:GOAL});rm.players.forEach(p=>p.ready=false);lobby(rm)}
/* ---------- reglas del juego (autoridad) ---------- */
const ev=(rm,e,m,to)=>rm.ev.push({e,m,to});
function target(p){for(const d of[.8,1.3,1.8]){const c=Math.floor((p.x+Math.sin(p.a)*d+12)/2),r=Math.floor((p.z+Math.cos(p.a)*d+9)/2),ch=tileAt(c,r);if(ch&&ch!=='.')return{c,r,ch,k:r+','+c}}return null}
function addPlate(rm,p,pl,ing){if(pl.baked||pl.burnt)return ev(rm,'bad','Ese plato ya está horneado',p.id);if(ing.state==='burnt')return ev(rm,'bad','Eso está quemado: a la basura',p.id);if(pl.c.length>=3)return ev(rm,'bad','El plato está lleno',p.id);pl.c.push({type:ing.type,state:ing.state});return true}
function act(rm,p){const t=target(p),bad=m=>ev(rm,'bad',m,p.id);if(!t)return bad('No hay nada cerca');const h=p.held,s=rm.tl[t.k],ch=t.ch;
 if(CRATE[ch]){if(h)return bad('Tienes las manos ocupadas');p.held=ni(CRATE[ch]);return ev(rm,'pick',0,p.id)}
 if(ch==='P'){if(h)return bad('Tienes las manos ocupadas');p.held=np();return ev(rm,'pick',0,p.id)}
 if(ch==='X'){if(!h)return bad('No llevas nada');p.held=null;return ev(rm,'put',0,p.id)}
 if(ch==='D'){if(!h||h.kind!=='plate')return bad('Necesitas un plato con comida');
  const k=rkey(h.c.map(x=>[x.type,x.state])),m=rm.orders.filter(o=>rkey(RECIPES[o.r].req)===k&&!!RECIPES[o.r].bake===!!h.baked&&!h.burnt).sort((a,b)=>a.t-b.t)[0];
  if(!m)return bad(h.c.some(x=>x.type==='dough')&&!h.baked?'La pizza aún no está horneada':'Ningún pedido coincide con este plato');
  p.held=null;rm.orders=rm.orders.filter(o=>o!==m);rm.combo++;const mult=Math.min(2.5,1+(rm.combo-1)*.25),pts=Math.round((RECIPES[m.r].pts+Math.floor(m.t/m.max*30))*mult);rm.score+=pts;
  return ev(rm,'ok','+'+pts+' puntos ('+p.name+')'+(mult>1?'  combo x'+mult:''))}
 if(h&&!s){
  if(ch==='C'&&!(h.kind==='ing'&&CHOP.includes(h.type)&&h.state==='raw'))return bad('En la tabla solo se pica tomate, carne, lechuga o queso crudos');
  if(ch==='S'&&!(h.kind==='ing'&&h.type==='meat'&&(h.state==='chopped'||h.state==='cooked')))return bad('En el fogón solo va carne picada');
  if(ch==='O'&&!(h.kind==='plate'&&h.c.some(x=>x.type==='dough')&&!h.burnt))return bad('El horno es para pizzas montadas en un plato');
  rm.tl[t.k]=h;p.held=null;return ev(rm,'put',0,p.id)}
 if(!h&&s){delete rm.tl[t.k];p.held=s;return ev(rm,'pick',0,p.id)}
 if(h&&s){
  if(h.kind==='plate'&&s.kind==='ing'){if(addPlate(rm,p,h,s)===true)delete rm.tl[t.k];return}
  if(h.kind==='ing'&&s.kind==='plate'&&ch==='K'){if(addPlate(rm,p,s,h)===true)p.held=null;return}
  return bad('No se pueden combinar')}}
function step(rm,dt){if(rm.phase!=='play')return;rm.time-=dt;if(rm.time<=0)return endRoom(rm);rm.el+=dt;
 rm.nx-=dt;if(rm.nx<=0&&rm.orders.length<Math.min(4,2+Math.floor(rm.el/60))){const ids=Object.keys(RECIPES).filter(k=>RECIPES[k].from<=rm.el),r=ids[Math.floor(Math.random()*ids.length)];rm.orders.push({id:++rm.oid,r,t:RECIPES[r].time,max:RECIPES[r].time});rm.nx=Math.max(8,15-rm.el/18);ev(rm,'ding')}
 for(const o of rm.orders.slice()){o.t-=dt;if(o.t<=0){rm.orders=rm.orders.filter(x=>x!==o);rm.combo=0;rm.score=Math.max(0,rm.score-20);ev(rm,'bad','¡Pedido caducado! -20')}}
 rm.players.forEach(p=>{if(p.off){p.vx=p.vz=0;p.work=false;return}let{x:ix,z:iz}=p.in;const l=Math.hypot(ix,iz);if(l>1){ix/=l;iz/=l}const k=Math.min(1,dt*14);p.vx+=(ix*7-p.vx)*k;p.vz+=(iz*7-p.vz)*k;
  let nx=p.x+p.vx*dt;if(!hit(nx,p.z))p.x=nx;else p.vx=0;let nz=p.z+p.vz*dt;if(!hit(p.x,nz))p.z=nz;else p.vz=0;
  if(l>.15){let d=Math.atan2(ix,iz)-p.a;p.a+=Math.atan2(Math.sin(d),Math.cos(d))*k}
  p.work=false;const t=target(p),it=t&&t.ch==='C'&&rm.tl[t.k];if(p.in.w&&l<.15&&it&&it.kind==='ing'&&it.state==='raw'){p.work=true;it.chop+=dt/1.4;if(it.chop>=1){it.state='chopped';ev(rm,'ding')}}});
 for(const k in rm.tl){const it=rm.tl[k],ch=MAP[+k.split(',')[0]][+k.split(',')[1]];
  if(ch==='S'&&it.kind==='ing'&&(it.state==='chopped'||it.state==='cooked')){it.cook+=dt;if(it.state==='chopped'&&it.cook>=5){it.state='cooked';ev(rm,'ding','¡Carne lista!')}else if(it.state==='cooked'&&it.cook>=10){it.state='burnt';ev(rm,'burn','¡Se quemó la carne!')}}
  if(ch==='O'&&it.kind==='plate'&&!it.burnt){it.bake+=dt;if(!it.baked&&it.bake>=6){it.baked=true;ev(rm,'ding','¡Pizza horneada!')}else if(it.baked&&it.bake>=12){it.burnt=true;ev(rm,'burn','¡Se quemó la pizza!')}}}}
function snap(rm){bc(rm,{t:'s',time:rm.time,score:rm.score,combo:rm.combo,orders:rm.orders.map(o=>({id:o.id,r:o.r,t:o.t,max:o.max})),tl:rm.tl,ev:rm.ev,
 pl:[...rm.players.values()].map(p=>({id:p.id,n:p.name,c:p.col,x:p.x,z:p.z,a:p.a,h:p.held,w:p.work,off:p.off}))});rm.ev=[]}
let tick=0;setInterval(()=>{tick++;rooms.forEach((rm,k)=>{step(rm,1/30);if(tick%2===0&&rm.phase==='play')snap(rm);
 rm.players.forEach((p,id)=>{if(p.off&&Date.now()-p.off>30000){if(p.held)p.held=null;rm.players.delete(id);if(rm.host===id)rm.host=[...rm.players.keys()][0];lobby(rm)}});
 if(!rm.players.size)rooms.delete(k)})},1000/30);
/* ---------- mensajes ---------- */
function onMsg(c,m){let rm=c.rm,p=c.p;
 if(m.t==='create'){rm={code:code(),players:new Map(),phase:'lobby',tl:{},orders:[],ev:[],time:GT,score:0,combo:0,el:0,nx:1,oid:0};rooms.set(rm.code,rm);p=newPlayer(c,m.name,rm);rm.host=p.id;c.rm=rm;c.p=p;send(c,{t:'hello',id:p.id,tok:p.tok,code:rm.code});return lobby(rm)}
 if(m.t==='join'){rm=rooms.get(String(m.code||'').toUpperCase());if(!rm)return send(c,{t:'err',m:'Sala no encontrada'});if(rm.phase!=='lobby')return send(c,{t:'err',m:'La partida ya empezó'});if(rm.players.size>=4)return send(c,{t:'err',m:'Sala llena (máx. 4)'});
  p=newPlayer(c,m.name,rm);c.rm=rm;c.p=p;send(c,{t:'hello',id:p.id,tok:p.tok,code:rm.code});return lobby(rm)}
 if(m.t==='rejoin'){rm=rooms.get(String(m.code||'').toUpperCase());p=rm&&[...rm.players.values()].find(q=>q.tok===m.tok);if(!p)return send(c,{t:'err',m:'No se pudo reconectar',fatal:1});if(p.conn&&p.conn!==c&&p.conn.sock)try{p.conn.rm=null;p.conn.sock.destroy()}catch(e){}
  p.conn=c;p.off=false;c.rm=rm;c.p=p;send(c,{t:'hello',id:p.id,tok:p.tok,code:rm.code});lobby(rm);if(rm.phase==='play')send(c,{t:'go'});return}
 if(!rm||!p)return;
 if(m.t==='ready'){p.ready=!!m.v;return lobby(rm)}
 if(m.t==='color'){const i=m.c|0;if(i>=0&&i<4&&![...rm.players.values()].some(q=>q!==p&&q.col===i)){p.col=i;lobby(rm)}return}
 if(m.t==='start'){if(rm.host!==p.id||rm.phase!=='lobby')return;if([...rm.players.values()].some(q=>q.id!==rm.host&&!q.ready))return send(c,{t:'err',m:'Todos deben estar listos'});return startRoom(rm)}
 if(m.t==='in'&&rm.phase==='play'){p.in={x:Math.max(-1,Math.min(1,+m.x||0)),z:Math.max(-1,Math.min(1,+m.z||0)),w:!!m.w}}
 if(m.t==='act'&&rm.phase==='play'&&!p.off)act(rm,p)}
function onClose(c){const rm=c.rm,p=c.p;if(!rm||!p||p.conn!==c)return;if(rm.phase==='play'){p.off=Date.now();p.in={x:0,z:0,w:false};lobby(rm)}else{rm.players.delete(p.id);if(rm.host===p.id)rm.host=[...rm.players.keys()][0];lobby(rm)}}
/* ---------- WebSocket mínimo (RFC 6455) ---------- */
function frame(s){const b=Buffer.from(s),n=b.length;let h;if(n<126)h=Buffer.from([0x81,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(n,2)}else{h=Buffer.alloc(10);h[0]=0x81;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([h,b])}
const srv=http.createServer((q,r)=>{if(q.url==='/health'){r.end('ok');return}fs.readFile(path.join(__dirname,'cooking-chaos.html'),(e,d)=>{if(e){r.writeHead(500);return r.end('Falta cooking-chaos.html')}r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end(d)})});
srv.on('upgrade',(q,sock)=>{const k=q.headers['sec-websocket-key'];if(!k)return sock.destroy();
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
 const c={sock,rm:null,p:null};let buf=Buffer.alloc(0);sock.setNoDelay(true);
 sock.on('data',d=>{buf=Buffer.concat([buf,d]);while(buf.length>=2){const op=buf[0]&15,mk=buf[1]&128;let n=buf[1]&127,o=2;if(n===126){if(buf.length<4)return;n=buf.readUInt16BE(2);o=4}else if(n===127){if(buf.length<10)return;n=Number(buf.readBigUInt64BE(2));o=10}
  if(n>65536)return sock.destroy();if(buf.length<o+(mk?4:0)+n)return;const mask=mk?buf.subarray(o,o+4):null;if(mk)o+=4;const pl=Buffer.from(buf.subarray(o,o+n));if(mask)for(let i=0;i<n;i++)pl[i]^=mask[i&3];buf=buf.subarray(o+n);
  if(op===8){sock.end();return}if(op===9){sock.write(Buffer.concat([Buffer.from([0x8a,n]),pl]));continue}
  if(op===1)try{onMsg(c,JSON.parse(pl.toString()))}catch(e){console.error('msg',e.message)}}});
 sock.on('close',()=>onClose(c));sock.on('error',()=>{})});
srv.listen(PORT,()=>console.log('Cooking Chaos en http://localhost:'+PORT));
