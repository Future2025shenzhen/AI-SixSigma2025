import {databaseBootstrap,adaptFMEA,toolDatabase} from './tool-storage.js';
const $=id=>document.getElementById(id);
let session=null,me=null,config=null,filter='all',viewId=null,viewUrl=null,refreshing=false,viewChannel=null;
const catalog=[{id:'dmaic',title:'DMAIC 项目计划',subtitle:'京东方车载显示教学案例',category:'项目管理',desc:'沿着定义、测量、分析、改进与控制，组织项目计划和进度。',tag:'教学案例 · 甘特图'},{id:'flow',title:'详细流程图工作台',subtitle:'让复杂流程清晰可见',category:'流程改善',desc:'梳理关键流程与过程环节，为问题分析和持续改善建立基础。',tag:'流程建模 · 可视化'},{id:'fmea',title:'FMEA Studio',subtitle:'失效模式与影响分析',category:'风险分析',desc:'以七步法梳理潜在失效，连接风险识别、评价与改进行动。',tag:'七步法 · 离线交互'},{id:'lab',title:'精密机床统计实验室',subtitle:'在实验中理解过程波动',category:'统计实验',desc:'走进数控机床教学场景，探索统计方法与精密制造的关系。',tag:'制造场景 · 交互实验'}];
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function date(x){return x?new Date(x).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'长期有效';}
function localTime(x){const d=new Date(new Date(x).getTime()+8*3600000);return d.toISOString().slice(0,16);}
function fromLocal(x){return x?new Date(x+':00+08:00').toISOString():null;}
function notify(s){$('toast').textContent=s;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',4500);}
const artOriginal=[`<g stroke="#7d9cac" fill="none"><path d="M55 70H110M155 70H205M110 70V110H205"/><rect x="25" y="53" width="45" height="33" rx="5"/><rect x="110" y="53" width="45" height="33" rx="5"/><rect x="205" y="53" width="45" height="33" rx="5"/><rect x="205" y="100" width="45" height="26" rx="5"/></g><circle cx="132" cy="69" r="6" fill="#1f8d9e"/>`,`<g fill="#81aab8"><rect x="53" y="95" width="15" height="35" rx="2"/><rect x="80" y="75" width="15" height="55" rx="2"/><rect x="107" y="55" width="15" height="75" rx="2"/><rect x="134" y="42" width="15" height="88" rx="2"/><rect x="161" y="65" width="15" height="65" rx="2"/><rect x="188" y="85" width="15" height="45" rx="2"/><rect x="215" y="109" width="15" height="21" rx="2"/></g><path d="M40 120Q80 122 112 60Q145 10 177 72Q200 116 244 123" fill="none" stroke="#007e95" stroke-width="2"/>`,`<g stroke="#83a8b6" fill="white"><rect x="30" y="68" width="55" height="29" rx="4"/><path d="M85 83H113M167 83H200M140 98V123H200" fill="none"/><path d="M140 55L168 83L140 110L112 83Z"/><rect x="200" y="68" width="48" height="29" rx="4"/><rect x="200" y="112" width="48" height="22" rx="4"/></g><circle cx="140" cy="82" r="5" fill="#008e91"/>`,`<g stroke="#d7e3e8"><path d="M52 45V135M92 45V135M132 45V135M172 45V135M212 45V135M252 45V135"/></g><g fill="#5c99ad"><rect x="52" y="53" width="70" height="12" rx="3"/><rect x="88" y="77" width="87" height="12" rx="3"/><rect x="132" y="101" width="72" height="12" rx="3"/><rect x="190" y="125" width="60" height="12" rx="3"/></g><path d="M172 43V141" stroke="#008e91" stroke-dasharray="3 3"/>`];
const art=[artOriginal[3],artOriginal[2],artOriginal[0],artOriginal[1]];
function render(){const list=(me?.tools||catalog).filter(t=>(filter==='all'||t.category===filter)&&[t.title,t.subtitle,t.desc].join('').toLowerCase().includes($('search').value.toLowerCase()));$('cards').innerHTML=list.map(t=>`<article class="card"><div class="card-art"><span class="art-label">0${catalog.findIndex(c=>c.id===t.id)+1} / ${esc(t.category)}</span><svg viewBox="0 0 280 160" aria-hidden="true">${art[catalog.findIndex(c=>c.id===t.id)]}</svg></div><div class="card-body"><div class="card-category">${esc(t.category)}</div><h3>${esc(t.title)}</h3><span class="card-subtitle">${esc(t.subtitle)}</span><p>${esc(t.desc)}</p><span class="card-tag">${esc(t.tag)}</span><div class="card-bottom"><span class="status ${t.allowed?'allowed':''}">${t.allowed?'● '+(t.expires_at?'至 '+date(t.expires_at):'已授权'):session?'○ 尚未授权':'○ 授权访问'}</span><button data-open="${t.id}">${t.allowed?'打开工具':session?'查看权限':'登录访问'} ↗</button></div></div></article>`).join('')||'<p>没有找到匹配的工具。</p>';}
function loginError(message,status=401){const error=Error(message);error.status=status;return error;}
function normalizeSession(data){
 if(!data||typeof data.access_token!=='string'||data.access_token.split('.').length!==3)throw loginError('登录响应无效，请重新登录');
 let jwtExpiry;try{jwtExpiry=JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp;}catch{}
 const lifetime=Number(data.expires_in);
 const expires_at=Number.isFinite(lifetime)&&lifetime>0?Date.now()/1000+lifetime:Number(data.expires_at||jwtExpiry);
 if(!Number.isFinite(expires_at))throw loginError('登录有效期无法确认，请重新登录');
 return {...data,expires_at};
}
async function authRequest(action,body={}){const r=await fetch((config?.apiBase||'')+'/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{}),...(config?.apiBase?{apikey:config.key}:{})},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw loginError(data.error||'服务连接失败，请稍后重试',r.status);return data;}
let refreshPromise=null;
async function refreshSession(){
 if(refreshPromise)return refreshPromise;
 if(!session?.refresh_token)throw loginError('登录会话已失效，请重新登录；工具授权期限不受影响');
 const before=session;
 refreshPromise=(async()=>{const result=normalizeSession(await authRequest('refresh',{refresh_token:before.refresh_token}));if(session!==before)throw loginError('登录状态已变更，请重新登录');session=result;})().finally(()=>{refreshPromise=null;});
 return refreshPromise;
}
async function api(p,options={}){
 if(!session)throw loginError('请先登录');
 if(session.expires_at*1000<Date.now()+60000)await refreshSession();
 const request=()=>fetch((config?.apiBase||'')+p,{...options,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',...(config?.apiBase?{apikey:config.key}:{}),...options.headers}});
 let r=await request();if(r.status===401&&session?.refresh_token){await refreshSession();r=await request();}
 if(!r.ok){let data={};try{data=await r.json();}catch{}throw loginError(data.error||'请求失败',r.status);}
 return p.startsWith('/api/tool/')?r.text():r.json();
}
async function load(){me=await api('/api/me');$('account').textContent=me.user.email+' · 退出';$('admin-nav').hidden=!me.admin;$('access-note').textContent='已登录 · '+me.user.email+' / 所有授权时间以北京时间显示';render();if(me.admin)renderGrants();}
function renderGrants(){const list=me.grants||[],current=Date.parse(me.server_now)||Date.now();$('grant-list').innerHTML=list.length?list.map((g,i)=>`<div class="grant-row"><div><b>${esc(g.email)}</b> · ${esc(catalog.find(t=>t.id===g.tool_id)?.title)}<small>${g.revoked?'已停用':Date.parse(g.starts_at)>current?'待生效':g.expires_at&&Date.parse(g.expires_at)<=current?'已到期':'有效'} · ${date(g.starts_at)} → ${date(g.expires_at)}</small></div><button data-edit="${i}">修改</button></div>`).join(''):'<p>暂无授权。在上方添加第一项用户授权。</p>';}
function closeViewer(){if(session&&viewId){api('/api/events',{method:'POST',body:JSON.stringify({action:'tool_close',tool_id:viewId})}).catch(()=>{});}if($('viewer-dialog').open)$('viewer-dialog').close();$('tool-frame').src='about:blank';if(viewUrl)URL.revokeObjectURL(viewUrl);viewUrl=null;viewId=null;viewChannel=null;}
async function openTool(id){if(!session){$('login-dialog').showModal();return;}const t=me.tools.find(t=>t.id===id);if(!t.allowed){notify('该工具尚未授权或授权已到期，请联系管理员。');return;}try{let html=await api('/api/tool/'+id);viewId=id;viewChannel=crypto.randomUUID();if(id==='fmea')html=adaptFMEA(html);
// Tools run in an opaque sandbox; their original localStorage is bridged without sharing session credentials.
let saved={};try{saved=JSON.parse(localStorage.getItem('tool:'+me.user.id+':'+id)||'{}');}catch{}
const bootstrap=`<script>${id==='fmea'?databaseBootstrap(viewChannel):''}(()=>{const channel=${JSON.stringify(viewChannel)};const data=${JSON.stringify(saved).replace(/</g,'\\u003c')};const storage={getItem:k=>Object.hasOwn(data,k)?String(data[k]):null,setItem:(k,v)=>{data[k]=String(v);parent.postMessage({kind:'tool-storage',channel,data},'*')},removeItem:k=>{delete data[k];parent.postMessage({kind:'tool-storage',channel,data},'*')},clear:()=>{for(const k in data)delete data[k];parent.postMessage({kind:'tool-storage',channel,data},'*')},key:i=>Object.keys(data)[i]??null,get length(){return Object.keys(data).length}};Object.defineProperty(window,'localStorage',{value:storage});Object.defineProperty(window,'sessionStorage',{value:storage});})();<\/script>`;
html=html.replace(/<head([^>]*)>/i,'<head$1>'+bootstrap);viewUrl=URL.createObjectURL(new Blob([html],{type:'text/html'}));$('tool-frame').src=viewUrl;$('viewer-title').textContent=t.title;$('viewer-expiry').textContent=t.expires_at?'授权至 '+date(t.expires_at):'长期有效';$('watermark').textContent=me.user.email+' · '+date(new Date().toISOString())+' · 授权使用';$('viewer-dialog').showModal();}catch(e){notify(e.message);}}
window.addEventListener('message',e=>{if(e.source!==$('tool-frame').contentWindow||!viewId||e.data?.kind!=='tool-storage'||e.data.channel!==viewChannel||!e.data.data||typeof e.data.data!=='object')return;try{const value=JSON.stringify(e.data.data);if(value.length<4000000)localStorage.setItem('tool:'+me.user.id+':'+viewId,value);}catch{notify('本机存储空间不足，请使用工具的导出功能保存。');}});
$('cards').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openTool(b.dataset.open);};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));render();});$('search').oninput=render;
$('account').onclick=async()=>{if(!session){$('login-dialog').showModal();return;}if(confirm('确认退出当前工作空间？')){try{if(session.expires_at*1000<Date.now()+60000)await refreshSession();await authRequest('logout');}catch{}session=null;me=null;closeViewer();$('admin-dialog').close();$('account').textContent='登录工作空间 ↗';$('admin-nav').hidden=true;$('access-note').textContent='登录后查看您的可用工具与授权期限。';render();}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('login-form').onsubmit=async e=>{e.preventDefault();$('login-error').textContent='';const b=e.submitter;b.disabled=true;try{if(!config?.configured)throw Error('网站尚未连接 Supabase。请由管理员完成部署配置。');session=normalizeSession(await authRequest('login',{email:$('email').value.trim(),password:$('password').value}));await load();$('password').value='';$('login-dialog').close();}catch(e){session=null;$('login-error').textContent=e.message;}finally{b.disabled=false;}};
$('admin-nav').onclick=()=>{if(!me?.admin)return;$('grant-start').value=localTime(new Date());$('admin-dialog').showModal();loadAudit().catch(error=>$('audit-message').textContent=error.message);};
$('grant-tools').innerHTML=catalog.map(t=>`<label class="tool-choice"><input type="checkbox" name="grant-tools" value="${t.id}"><span>${esc(t.title)}</span></label>`).join('');
const selectedTools=()=>[...document.querySelectorAll('[name="grant-tools"]:checked')].map(input=>input.value);
$('select-all-tools').onclick=()=>{const inputs=[...document.querySelectorAll('[name="grant-tools"]')],all=inputs.every(input=>input.checked);inputs.forEach(input=>input.checked=!all);};
$('grant-list').onclick=e=>{const b=e.target.closest('[data-edit]');if(!b)return;const g=me.grants[Number(b.dataset.edit)];$('grant-email').value=g.email;document.querySelectorAll('[name="grant-tools"]').forEach(input=>input.checked=input.value===g.tool_id);$('grant-start').value=localTime(g.starts_at);$('grant-end').value=g.expires_at?localTime(g.expires_at):'';$('grant-revoked').checked=g.revoked;$('grant-email').focus();};
$('grant-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{if(!selectedTools().length)throw Error('请至少选择一个工具');await api('/api/grants',{method:'POST',body:JSON.stringify({email:$('grant-email').value.trim(),tool_ids:selectedTools(),starts_at:fromLocal($('grant-start').value),expires_at:fromLocal($('grant-end').value),revoked:$('grant-revoked').checked})});await load();$('grant-message').textContent='已保存 '+selectedTools().length+' 个工具的授权。请确认已在第一步创建客户登录账号。';}catch(e){$('grant-message').textContent=e.message;}finally{e.submitter.disabled=false;}};
$('close-viewer').onclick=closeViewer;$('viewer-dialog').addEventListener('cancel',e=>{e.preventDefault();closeViewer();});$('fullscreen').onclick=()=>{if(!document.fullscreenElement)$('viewer-dialog').requestFullscreen?.();else document.exitFullscreen?.();};
setInterval(async()=>{if(!session||refreshing)return;refreshing=true;try{await load();if(viewId&&!me.tools.find(t=>t.id===viewId)?.allowed){closeViewer();notify('授权已到期或被撤销，请联系管理员。');}}catch(error){closeViewer();if(error.status===401||error.status===403){session=null;me=null;$('admin-dialog').close();$('admin-nav').hidden=true;$('account').textContent='登录工作空间 ↗';$('access-note').textContent='请重新登录或联系管理员。';render();}notify(error.message||'无法验证当前授权，工具已关闭。');}finally{refreshing=false;}},15000);
render();try{const file=await fetch('./account-config.json');config=file.ok?await file.json():await(await fetch('/api/config')).json();}catch{notify('服务连接失败，请刷新页面。');}

$('customer-action').onchange=()=>{$('customer-id-label').hidden=$('customer-action').value!=='reset';$('customer-id').required=$('customer-action').value==='reset';};
$('account-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('account-message').textContent='';try{const result=await api('/api/accounts',{method:'POST',body:JSON.stringify({email:$('customer-email').value.trim(),password:$('customer-password').value,action:$('customer-action').value,user_id:$('customer-id').value.trim()})});$('customer-password').value='';$('customer-id').value=result.id;$('grant-email').value=result.email;$('grant-start').value=localTime(new Date());$('account-message').textContent=(result.action==='create'?'客户账号已创建。请在下方配置工具授权；未授权前无法打开工具。':'密码已重置。')+' 用户ID：'+result.id;}catch(err){$('account-message').textContent=err.message;}finally{button.disabled=false;}};

window.addEventListener('message',async event=>{
 const message=event.data;
 if(!session||event.source!==$('tool-frame').contentWindow||viewId!=='fmea'||!viewChannel||message?.kind!=='tool-db'||message.channel!==viewChannel||!Number.isSafeInteger(message.id))return;
 const channel=viewChannel,userId=me.user.id;
 try{const value=await toolDatabase(userId,'fmea',message.operation);if(channel===viewChannel)event.source.postMessage({kind:'tool-db-result',channel,id:message.id,value},'*');}
 catch(error){if(channel===viewChannel)event.source.postMessage({kind:'tool-db-result',channel,id:message.id,error:error.message},'*');}
});

let auditData=null;
const actionLabels={login:'登录成功',login_failed:'登录失败',login_blocked:'登录被拒绝',logout:'主动退出',tool_requested:'打开工具',tool_open:'工具提供确认',tool_close:'关闭工具',tool_denied:'工具访问被拒绝',grant_created:'新增授权',grant_updated:'修改授权',account_created:'创建客户',password_reset:'重置密码',account_disabled:'停用账号',account_enabled:'启用账号',sessions_revoked:'结束全部会话'};
function locationLabel(row){let country='';try{if(row.country)country=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(row.country);}catch{}return esc([row.ip,country].filter(Boolean).join(' · ')||'未提供');}
function table(headers,rows){return '<table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map(cells=>'<tr>'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'">暂无记录</td></tr>')+'</tbody></table>';}
async function loadAudit(page=1){
 if(!me?.admin)return;
 $('audit-message').textContent='正在读取…';
 auditData=await api('/api/admin/activity?page='+page+'&email='+encodeURIComponent($('audit-email').value.trim()));
 $('audit-users').innerHTML=table(['用户','状态','操作'],auditData.users.map(user=>[esc(user.email),user.disabled?'已停用':user.approved?'可登录':'待管理员开通',user.administrator?'管理员':`<button type="button" data-control="${user.disabled||!user.approved?'enable':'disable'}" data-user="${esc(user.id)}">${!user.approved?'开通':user.disabled?'启用':'停用'}</button> <button type="button" data-control="revoke" data-user="${esc(user.id)}">结束会话</button>`]));
 const now=Date.parse(auditData.server_now);
 $('audit-sessions').innerHTML=table(['用户','登录时间','主动退出时间','最近活动','IP / 国家或地区','状态'],auditData.sessions.map(row=>[esc(row.email),esc(date(row.logged_in_at)),row.logged_out_at?esc(date(row.logged_out_at)):'—',esc(date(row.last_seen_at)),locationLabel(row),row.revoked_at?'管理员已结束':row.logged_out_at?'已退出':now-Date.parse(row.last_seen_at)>90000?'可能离线':'近期在线']));
 $('audit-events').innerHTML=table(['时间','用户 / 对象','操作','工具','IP / 国家或地区'],auditData.events.map(row=>[esc(date(row.happened_at)),esc(row.email)+(row.details?.subject_email?'<small>对象：'+esc(row.details.subject_email)+'</small>':''),esc(actionLabels[row.action]||row.action),esc(catalog.find(tool=>tool.id===row.tool_id)?.title||'—'),locationLabel(row)]));
 $('audit-page').textContent='第 '+auditData.page+' 页（每类最多100条）';$('audit-prev').disabled=auditData.page<=1;$('audit-next').disabled=!auditData.has_more;
 $('audit-message').textContent='停用后新请求立即拒绝；在线页面约每15秒复核，后台标签页或断网可能延迟。启用账号后须重新登录。';
}
$('audit-filter').onsubmit=event=>{event.preventDefault();loadAudit().catch(error=>$('audit-message').textContent=error.message);};
$('audit-prev').onclick=()=>loadAudit(Math.max(1,(auditData?.page||1)-1)).catch(error=>$('audit-message').textContent=error.message);
$('audit-next').onclick=()=>loadAudit((auditData?.page||1)+1).catch(error=>$('audit-message').textContent=error.message);
$('audit-users').onclick=async event=>{
 const button=event.target.closest('[data-control]');if(!button)return;
 const user=auditData?.users.find(user=>user.id===button.dataset.user);if(!user)return;
 const label={disable:'停用账号并结束全部会话',enable:'启用账号（旧会话不会恢复）',revoke:'结束该用户全部现有会话'}[button.dataset.control];
 if(!confirm(label+'：'+user.email+'？'))return;button.disabled=true;
 try{await api('/api/admin/control',{method:'POST',body:JSON.stringify({user_id:user.id,action:button.dataset.control})});await loadAudit(auditData.page);}catch(error){$('audit-message').textContent=error.message;}finally{button.disabled=false;}
};
