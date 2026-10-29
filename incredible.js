// incredible.js - ハイブリッド同期コアエンジン

const IncredibleEngine = (() => {
    const DB_NAME = 'PersonalDataHub';
    const STORE_NAME = 'records';
    let localDB = null;

    const enforceSchema = (data) => ({
        id: data.id || Date.now().toString(),
        app: data.app || 'unknown',
        updatedAt: data.updatedAt || Date.now(),
        content: data.content || '',
        type: data.type || 'text',
        version: data.version || 1,
        tags: Array.isArray(data.tags) ? data.tags : [],
        status: data.status || 'active',
        source: data.source || '',
        memo: data.memo || '',
        crew: data.crew || 'captain'
    });

    const initLocalDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
            };
            request.onsuccess = (e) => { localDB = e.target.result; resolve(); };
            request.onerror = (e) => reject(e.target.error);
        });
    };

    const push = async (rawData) => {
        if (!localDB) await initLocalDB();
        const data = enforceSchema(rawData);
        data.updatedAt = Date.now();

        const tx = localDB.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data);

        try {
            await window.db.collection(STORE_NAME).doc(data.id).set(data, { merge: true });
            console.log(`[Incredible] Push OK: ${data.id}`);
        } catch (e) {
            console.warn(`[Incredible] Push保留（オフライン状態）: ${data.id}`);
        }
        return data;
    };

    const pull = async (lastSyncTime = 0) => {
        if (!localDB) await initLocalDB();
        try {
            const snapshot = await window.db.collection(STORE_NAME)
                                     .where('updatedAt', '>', lastSyncTime)
                                     .get();
            
            const tx = localDB.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            snapshot.forEach(doc => {
                const validData = enforceSchema(doc.data());
                store.put(validData);
            });
            console.log(`[Incredible] Pull完了: 差分${snapshot.size}件`);
        } catch (e) {
            console.warn(`[Incredible] Pullスキップ（オフライン状態）`);
        }
    };

    const forceSync = async () => {
        if (!localDB) await initLocalDB();
        // ※監査ロジック本体は将来拡張予定。今回はモックとして返却
        return { pushed: 0, pulled: 0 };
    };

    // アルゴス監視用の全件取得メソッド
    const getAll = async () => {
        if (!localDB) await initLocalDB();
        return new Promise((resolve, reject) => {
            const tx = localDB.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    };

    return { push, pull, forceSync, enforceSchema, getAll };
})();
