// ========== FIREBASE CONFIGURATION ==========
// Run House Inventory System
var firebaseConfig = {
    apiKey: "AIzaSyA2BcP17tc5wJm2_j5T846oP6eqrbV-HO4",
    authDomain: "run-house-inventory-system.firebaseapp.com",
    projectId: "run-house-inventory-system",
    storageBucket: "run-house-inventory-system.firebasestorage.app",
    messagingSenderId: "941280109503",
    appId: "1:941280109503:web:9db6a27c51dc412898370a"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();

console.log('Firebase initialized for project:', firebaseConfig.projectId);
