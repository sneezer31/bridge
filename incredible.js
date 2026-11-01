const IncredibleEngine = (() => {
    const DB_NAME = 'BridgeDB';
    const STORE_NAME = 'records'; // 棚は分けない。すべてここへ突っ込む
    let dbInstance = null;

    // 1. IndexedDBの初期化・接続
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

    // 2. ローカルデータの全件取得 (アルゴスでの目視用)
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

    // 3. ペイロードの削ぎ落としとキーの矯正（マッパー）
    const cleanPayload = (data) => {
        const payload = { ...data };
        
        // 20号等の表記揺れ (updated_at) を updatedAt に強制統一
        if (payload.updated_at) {
            payload.updatedAt = payload.updated_at;
            delete payload.updated_at;
        }
        if (payload.created_at) {
            payload.createdAt = payload.created_at;
            delete payload.created_at;
        }
        if (!payload.updatedAt) payload.updatedAt = payload.id || Date.now();
        
        // 空箱の物理排除 (通信コストの極小化)
        Object.keys(payload).forEach(key => {
            const val = payload[key];
            if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
                delete payload[key];
            }
        });
        return payload;
    };

    // 4. 強制監査・同期エンジン本体
    const forceSync = async () => {
        const db = await initDB();
        
        // ローカルデータの展開
        const localData = await getAll();
        const localMap = new Map(localData.map(d => [String(d.id), d]));

        // クラウド(Firestore)の records コレクションから全件取得（フラット構造）
        const snap = await window.db.collection('records').get();
        const cloudData = [];
        snap.forEach(doc => cloudData.push(doc.data()));
        const cloudMap = new Map(cloudData.map(d => [String(d.id), d]));

        let pushed = 0;
        let pulled = 0;

        // 【Push監査】 ローカル -> クラウド
        const batch = window.db.batch();
        let batchCount = 0;

        for (const [id, lData] of localMap.entries()) {
            const cData = cloudMap.get(id);
            // 比較用に時間を取得（揺れに対応）
            const lTime = lData.updatedAt || lData.updated_at || lData.id;
            const cTime = cData ? (cData.updatedAt || cData.updated_at || cData.id) : 0;
            
            // クラウドにない、またはローカル側が新しい場合のみPush
            if (!cData || lTime > cTime) {
                const cleaned = cleanPayload(lData); // マッパー通過
                const docRef = window.db.collection('records').doc(id);
                batch.set(docRef, cleaned); // 上書き
                batchCount++;
                pushed++;
                
                // Firestoreのバッチ制限(500件)を考慮
                if (batchCount === 500) {
                    await batch.commit();
                    batchCount = 0;
                }
            }
        }
        if (batchCount > 0) await batch.commit();

        // 【Pull監査】 クラウド -> ローカル
        const pullTx = db.transaction(STORE_NAME, 'readwrite');
        const pullStore = pullTx.objectStore(STORE_NAME);
        
        for (const [id, cData] of cloudMap.entries()) {
            const lData = localMap.get(id);
            const lTime = lData ? (lData.updatedAt || lData.updated_at || lData.id) : 0;
            const cTime = cData.updatedAt || cData.updated_at || cData.id;

            // ローカルにない、またはクラウド側が新しい場合のみPull
            if (!lData || cTime > lTime) {
                const normalized = cleanPayload(cData); // 保存前にローカル側も綺麗にする
                pullStore.put(normalized);
                pulled++;
            }
        }

        return new Promise((resolve, reject) => {
            pullTx.oncomplete = () => resolve({ pushed, pulled });
            pullTx.onerror = () => reject(pullTx.error);
        });
    };

    return { initDB, getAll, forceSync };
})();
