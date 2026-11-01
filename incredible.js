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

    return { initDB, getAll };
})();
