// FMEA's IndexedDB runs in the parent, scoped to the signed-in user and tool.
// The opaque tool frame receives only its own records, never login credentials.
const stores = ['projects', 'snapshots', 'evidence'];

export function databaseBootstrap(channel) {
  return `(() => {
    const channel=${JSON.stringify(channel)}, pending=new Map(); let next=0;
    window.__portalDB = operation => new Promise((resolve,reject) => {
      const id=++next, timer=setTimeout(()=>{pending.delete(id);reject(Error('本机数据库响应超时'));},30000);
      pending.set(id,{resolve,reject,timer});
      parent.postMessage({kind:'tool-db',channel,id,operation},'*');
    });
    window.addEventListener('message',event=>{
      const m=event.data;
      if(event.source!==parent||m?.kind!=='tool-db-result'||m.channel!==channel)return;
      const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
      if(m.error)p.reject(Error(m.error));else p.resolve(m.value);
    });
  })();`;
}

export function adaptFMEA(html) {
  const replacements = {
    openDBV5: "function openDBV5(){return window.__portalDB({type:'open'});}",
    dbReadV5: "async function dbReadV5(store,id){return window.__portalDB({type:'read',store,id});}",
    dbWriteV5: "async function dbWriteV5(p){return window.__portalDB({type:'project',project:clone(p)});}",
    putEvidenceV5: "async function putEvidenceV5(records){if(records.length)return window.__portalDB({type:'evidence',records});}"
  };
  for (const [name, replacement] of Object.entries(replacements)) {
    const pattern = new RegExp('^(?:async )?function '+name+'\\([^\\n]*$', 'm');
    if (!pattern.test(html)) throw Error('FMEA 数据库版本不匹配，请联系管理员');
    html = html.replace(pattern, replacement);
  }
  return html;
}

export async function toolDatabase(userId, toolId, operation, factory = globalThis.indexedDB) {
  if (!userId || toolId !== 'fmea' || !factory) throw Error('本机数据库不可用');
  if (!operation || !['open','read','project','evidence'].includes(operation.type)) throw Error('无效的数据库操作');
  if (operation.type === 'read' && !stores.includes(operation.store)) throw Error('无效的数据表');
  const db = await new Promise((resolve,reject) => {
    const request = factory.open('ai-six-sigma:'+userId+':'+toolId+':review-v1',1);
    request.onupgradeneeded = () => stores.forEach(name => request.result.createObjectStore(name,{keyPath:'id'}));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('本机数据库被其他窗口占用'));
  });
  try {
    if (operation.type === 'open') return true;
    return await new Promise((resolve,reject) => {
      const names = operation.type === 'read' ? [operation.store] : operation.type === 'project' ? ['projects','snapshots'] : ['evidence'];
      const tx = db.transaction(names,operation.type === 'read' ? 'readonly' : 'readwrite');
      let result = true;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || Error('本机数据库操作失败'));
      tx.onabort = () => reject(tx.error || Error('本机数据库操作已中止'));
      try {
        if (operation.type === 'read') {
          const store = tx.objectStore(operation.store);
          const request = operation.id ? store.get(operation.id) : store.getAll();
          request.onsuccess = () => {result = request.result;};
        } else if (operation.type === 'project') {
          const project = structuredClone(operation.project), snapshots = project.versions;
          if (typeof project.id !== 'string' || !Array.isArray(snapshots)) throw Error('无效的项目数据');
          project.versions = [];
          const record = {project,projectId:project.id,date:new Date().toISOString(),snapshotIds:snapshots.map(s=>project.id+'::'+s.id)};
          tx.objectStore('projects').put({...record,id:'active'});
          tx.objectStore('projects').put({...record,id:project.id});
          for (const snapshot of snapshots) tx.objectStore('snapshots').put({id:project.id+'::'+snapshot.id,value:snapshot});
        } else {
          if (!Array.isArray(operation.records)) throw Error('无效的附件数据');
          for (const record of operation.records) {
            if (typeof record.id !== 'string' || !(record.blob instanceof Blob) || record.blob.size > 10*1024*1024) throw Error('附件无效或超过10MB');
            tx.objectStore('evidence').put(record);
          }
        }
      } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
}
