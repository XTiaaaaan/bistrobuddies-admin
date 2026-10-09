// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  /** Delivery fee in PHP. 0 means delivery is free / not configured. */
  deliveryFee: 0,
  /**
   * BistroBuddies backend API base URL (development).
   * The admin app sends authorized requests (e.g. product writes) here.
   * Local development requires the backend running on port 3001.
   */
  apiBaseUrl: 'http://localhost:3001/api',
  firebase: {
    apiKey: 'AIzaSyBETNFotntAk4HHIjDiO0Hf3a0_fTK8xBo',
    authDomain: 'bistrobuddies-4f179.firebaseapp.com',
    projectId: 'bistrobuddies-4f179',
    storageBucket: 'bistrobuddies-4f179.firebasestorage.app',
    messagingSenderId: '12668682749',
    appId: '1:12668682749:web:08b8843982f2c35e23d994',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
