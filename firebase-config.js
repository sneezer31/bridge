// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyAlz26igDEILsZBL5LrVVynx6KlsKu6e8U",
    authDomain: "sneezer31-78845.firebaseapp.com",
    projectId: "sneezer31-78845",
    storageBucket: "sneezer31-78845.firebasestorage.app",
    messagingSenderId: "1094107940035",
    appId: "1:1094107940035:web:2f5cfbcccf313feac7ce76"
};

// 重複初期化を防ぎつつ、グローバルな window.db に接続をセットする
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
window.db = firebase.firestore();
window.db.settings({ experimentalForceLongPolling: true });
