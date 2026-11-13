// IndexedDB persistence; localStorage is retained as a fallback/migration source.
let dbPromise;
function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(Error('IndexedDB unavailable'));const req=indexedDB.open('mantar-pano-db',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('boards'))req.result.createObjectStore('boards');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return dbPromise;}
export async function persistBoard(data,key){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction('boards','readwrite');tx.objectStore('boards').put({...data,savedAt:Date.now()},key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('IndexedDB yazması iptal edildi'));});}
export async function readBoard(key){let idb=null,ls=null;try{const db=await openDB();idb=await new Promise((resolve,reject)=>{const r=db.transaction('boards').objectStore('boards').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}catch(e){}
  try{ls=JSON.parse(localStorage.getItem(key));}catch(_){}
  // İki kaynak da varsa daha yeni kaydedilen kazanır (IndexedDB yazması başarısız olduysa localStorage yedeği daha yeni olabilir).
  return idb&&ls?((ls.savedAt||0)>(idb.savedAt||0)?ls:idb):(idb||ls||null);}
export async function deleteBoard(key){try{localStorage.removeItem(key);}catch(_){}try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('boards','readwrite');tx.objectStore('boards').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('abort'));});}catch(_){}}
