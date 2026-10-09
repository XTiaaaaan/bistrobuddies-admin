import { bootstrapApplication } from '@angular/platform-browser';

import { AdminAppComponent } from './app/admin-app.component';
import { adminAppConfig } from './app/admin-app.config';

bootstrapApplication(AdminAppComponent, adminAppConfig).catch((err) =>
  console.error(err)
);
