export const environment = {
  production: true,
  /** Delivery fee in PHP. 0 means delivery is free / not configured. */
  deliveryFee: 0,
  /**
   * BistroBuddies backend API base URL (production).
   *
   * IMPORTANT: replace this placeholder with the real deployed backend URL
   * before deploying the admin website. It intentionally does NOT point at
   * localhost — a production build must never rely on localhost.
   */
  apiBaseUrl: 'https://your-bistrobuddies-backend.example/api',
  firebase: {
    apiKey: 'AIzaSyBETNFotntAk4HHIjDiO0Hf3a0_fTK8xBo',
    authDomain: 'bistrobuddies-4f179.firebaseapp.com',
    projectId: 'bistrobuddies-4f179',
    storageBucket: 'bistrobuddies-4f179.firebasestorage.app',
    messagingSenderId: '12668682749',
    appId: '1:12668682749:web:08b8843982f2c35e23d994',
  },
};
