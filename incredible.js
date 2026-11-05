const IncredibleEngine = (() => {
    const DB_NAME = 'BridgeDB';
    const STORE_NAME = 'records'; 
    const LAST_SYNC_KEY = 'bridge_last_sync_time';
    let dbInstance = null;

    const initDB = () => {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);
            // ※IndexedDBの仕様上、バージョン変更による無用な事故を防ぐため、
            // 構造は変えずにJS側でフィルタリングする安全なアプローチを採用します。
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
        // タイムスタンプの揺れを updatedAt に統一
        if (payload.updated_at) { payload.updatedAt = payload.updated_at; delete payload.updated_at; }
        if (payload.created_at) { payload.createdAt = payload.created_at; delete payload.created_at; }
        if (!payload.updatedAt) payload.updatedAt = payload.id || Date.now();
        
        // 無効値のパージ（空箱の配列や文字列は消さずに維持する）
        Object.keys(payload).forEach(key => {
            const val = payload[key];
            if (val === null || val === undefined) {
                delete payload[key];
            }
        });
        return payload;
    };

    // 差分照合と双方向同期（インクレディブル・シンク）
    const forceSync = async () => {
        const db = await initDB();
        const lastSyncTime = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
        const syncStartTime = Date.now();

        // 1. ローカルから「前回同期以降に変更されたデータ」だけを抽出
        const allLocal = await getAll();
        const localDiff = allLocal.filter(d => (d.updatedAt || d.id || 0) > lastSyncTime);

        // 2. クラウド（Firestore）から「前回同期以降に変更されたデータ」だけを抽出
        const cloudMap = new Map();
        let query = window.db.collection(STORE_NAME);
        if (lastSyncTime > 0) {
            query = query.where('updatedAt', '>', lastSyncTime);
        }
        const snap = await query.get();
        snap.forEach(doc => cloudMap.set(String(doc.id), doc.data()));

        let pushed = 0, pulled = 0;
        const pushedIds = new Set();
        let batch = window.db.batch();
        let batchCount = 0;

        // Push: ローカルの差分をクラウドへ（タイムスタンプ勝負）
        for (const lData of localDiff) {
            const id = String(lData.id);
            const cData = cloudMap.get(id);
            const lTime = lData.updatedAt || lData.id;
            const cTime = cData ? (cData.updatedAt || cData.id) : 0;
            
            // ローカルが新しい、またはクラウドに未到達の場合のみ上書き
            if (!cData || lTime > cTime) {
                const cleaned = cleanPayload(lData);
                batch.set(window.db.collection(STORE_NAME).doc(id), cleaned);
                pushedIds.add(id);
                batchCount++; pushed++;
                
                // Firestoreのバッチ制限（500件）回避とオブジェクト再生成
                if (batchCount === 500) { 
                    await batch.commit(); 
                    batch = window.db.batch(); 
                    batchCount = 0; 
                }
            }
        }
        if (batchCount > 0) await batch.commit();

        // Pull: クラウドの差分をローカルへ
        if (cloudMap.size > 0) {
            const pullTx = db.transaction(STORE_NAME, 'readwrite');
            const pullStore = pullTx.objectStore(STORE_NAME);
            
            for (const [id, cData] of cloudMap.entries()) {
                // すでにPushでローカルが勝って送信済みのものは上書きしない
                if (!pushedIds.has(id)) {
                    pullStore.put(cleanPayload(cData));
                    pulled++;
                }
            }
            
            await new Promise((resolve, reject) => {
                pullTx.oncomplete = () => resolve();
                pullTx.onerror = () => reject(pullTx.error);
            });
        }

        // 全ての取引が完了したら、同期時刻を更新
        localStorage.setItem(LAST_SYNC_KEY, syncStartTime.toString());

        return { pushed, pulled };
    };

    return { initDB, getAll, saveLocal, forceSync };
})();
