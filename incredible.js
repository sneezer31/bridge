const IncredibleEngine = (() => {
    const DB_NAME = 'BridgeDB';
    const STORE_NAME = 'records';
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

    // 2. ローカルデータの全件取得 (アルゴス用)
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

    // 3. 空箱の物理削除と遅延結合マッパー
    const cleanPayload = (data) => {
        const payload = { ...data };
        
        // updatedAtが存在しない（新規）場合は付与
        if (!payload.updatedAt) payload.updatedAt = Date.now();
        
        // 値が空のキーを完全排除
        Object.keys(payload).forEach(key => {
            const val = payload[key];
            if (val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
                delete payload[key];
            }
        });
        return payload;
    };

    // 4. 強制監査・同期 (インクレディブルボタン発火用)
    const forceSync = async () => {
        const db = await initDB();
        const localData = await getAll();
        const localMap = new Map(localData.map(d => [String(d.id), d]));

        // クラウド(Firestore)の records 棚から全件取得
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
            // クラウドに存在しない、またはローカルのほうが新しい場合
            if (!cData || lData.updatedAt > cData.updatedAt) {
                const cleaned = cleanPayload(lData); // マッパー通過
                const docRef = window.db.collection('records').doc(id);
                batch.set(docRef, cleaned);
                batchCount++;
                pushed++;
            }
        }
        if (batchCount > 0) await batch.commit();

        // 【Pull監査】 クラウド -> ローカル
        const pullTx = db.transaction(STORE_NAME, 'readwrite');
        const pullStore = pullTx.objectStore(STORE_NAME);
        
        for (const [id, cData] of cloudMap.entries()) {
            const lData = localMap.get(id);
            // ローカルに存在しない、またはクラウドのほうが新しい場合
            if (!lData || cData.updatedAt > lData.updatedAt) {
                pullStore.put(cData);
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
