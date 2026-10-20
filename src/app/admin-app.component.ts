import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonRouterOutlet,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  cafe,
  gridOutline,
  logOutOutline,
  logOutSharp,
  mailOutline,
  receipt,
} from 'ionicons/icons';

import { AdminSessionService } from './core/auth/admin-session.service';
import { AdminNotificationsBellComponent } from './components/admin-notifications-bell/admin-notifications-bell.component';

@Component({
  selector: 'admin-root',
  templateUrl: './admin-app.component.html',
  styleUrls: ['./admin-app.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonRouterOutlet,
    AdminNotificationsBellComponent,
  ],
})
export class AdminAppComponent implements OnInit {
  readonly signedIn = signal(false);
  readonly onLogin = signal(false);

  private readonly router = inject(Router);
  private readonly session = inject(AdminSessionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({
      cafe,
      gridOutline,
      logOutOutline,
      logOutSharp,
      mailOutline,
      receipt,
    });
  }

  ngOnInit(): void {
    this.session.signedIn$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((signedIn) => this.signedIn.set(signedIn));

    this.onLogin.set(this.router.url.startsWith('/login'));
    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event instanceof NavigationEnd) {
          this.onLogin.set(event.urlAfterRedirects.startsWith('/login'));
        }
      });
  }

  async logout(): Promise<void> {
    try {
      await this.session.logout();
    } catch (error) {
      console.error('Logout failed', error);
    }
    await this.router.navigate(['/login'], { replaceUrl: true });
  }
}
