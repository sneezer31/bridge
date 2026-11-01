const IncredibleEngine = (() => {
    const DB_NAME = 'BridgeDB';
    const STORE_NAME = 'records';
    let dbInstance = null;

    const initDB = () => {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    };

    const getAll = async () => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    };

    // 現場アプリ用: ローカルへの最速書き込み
    const saveLocal = async (data) => {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            store.put(data);
        });
    };

    const cleanPayload = (data) => {
        const payload = { ...data };
        if (payload.updated_at) { payload.updatedAt = payload.updated_at; delete payload.updated_at; }
        if (payload.created_at) { payload.createdAt = payload.created_at; delete payload.created_at; }
        if (!payload.updatedAt) payload.updatedAt = payload.id || Date.now();
        
        Object.keys(payload).forEach(key => {
            const val = payload[key];
            if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
                delete payload[key];
            }
        });
        return payload;
    };

    // ブリッジ用: 差分照合と双方向同期
    const forceSync = async () => {
        const db = await initDB();
        const localData = await getAll();
        const localMap = new Map(localData.map(d => [String(d.id), d]));

        const snap = await window.db.collection('records').get();
        const cloudMap = new Map();
        snap.forEach(doc => cloudMap.set(String(doc.id), doc.data()));

        let pushed = 0, pulled = 0;
        const batch = window.db.batch();
        let batchCount = 0;

        // Push: ローカルからクラウドへ
        for (const [id, lData] of localMap.entries()) {
            const cData = cloudMap.get(id);
            const lTime = lData.updatedAt || lData.id;
            const cTime = cData ? (cData.updatedAt || cData.id) : 0;
            
            if (!cData || lTime > cTime) {
                const cleaned = cleanPayload(lData);
                batch.set(window.db.collection('records').doc(id), cleaned);
                batchCount++; pushed++;
                if (batchCount === 500) { await batch.commit(); batchCount = 0; }
            }
        }
        if (batchCount > 0) await batch.commit();

        // Pull: クラウドからローカルへ
        const pullTx = db.transaction(STORE_NAME, 'readwrite');
        const pullStore = pullTx.objectStore(STORE_NAME);
        
        for (const [id, cData] of cloudMap.entries()) {
            const lData = localMap.get(id);
            const lTime = lData ? (lData.updatedAt || lData.id) : 0;
            const cTime = cData.updatedAt || cData.id;

            if (!lData || cTime > lTime) {
                pullStore.put(cleanPayload(cData));
                pulled++;
            }
        }

        return new Promise((resolve, reject) => {
            pullTx.oncomplete = () => resolve({ pushed, pulled });
            pullTx.onerror = () => reject(pullTx.error);
        });
    };

    return { initDB, getAll, saveLocal, forceSync };
})();
