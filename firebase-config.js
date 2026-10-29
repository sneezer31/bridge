// firebase-config.js - 全アプリ共通の通信設定
// ※各HTMLファイルの <head> で firebase-app-compat.js 等を読み込んだ後にロードされます。

const firebaseConfig = {
    apiKey: "AIzaSyAlz26igDEILsZBL5LrVVynx6KlsKu6e8U",
    authDomain: "sneezer31-78845.firebaseapp.com",
    projectId: "sneezer31-78845",
    storageBucket: "sneezer31-78845.firebasestorage.app",
    messagingSenderId: "1094107940035",
    appId: "1:1094107940035:web:2f5cfbcccf313feac7ce76"
};

// 初期化とFirestoreインスタンスの生成
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// グローバルオブジェクトとして結線
window.db = firebase.firestore();

// ※IncredibleEngine（ローカルファースト）を絶対優先するため、
// Firebase側のオフラインキャッシュ（enablePersistence）は意図的に呼び出さず、純粋な通信機として運用します。
