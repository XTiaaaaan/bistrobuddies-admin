import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withComponentInputBinding,
  withPreloading,
} from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';

import { adminRoutes } from './admin-app.routes';
import { firebaseProviders } from '@shared/core/firebase/firebase';

export const adminAppConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      adminRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules)
    ),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideHttpClient(),
    ...firebaseProviders,
  ],
};
