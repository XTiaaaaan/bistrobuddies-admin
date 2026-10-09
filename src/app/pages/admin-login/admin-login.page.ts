import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
} from '@ionic/angular';
import { authErrorMessage } from '@shared/core/auth/auth-errors';
import {
  AdminAccessDeniedError,
  AdminSessionService,
} from '../../core/auth/admin-session.service';

@Component({
  selector: 'admin-login',
  templateUrl: './admin-login.page.html',
  styleUrls: ['./admin-login.page.scss'],
  standalone: true,
  imports: [FormsModule, IonButton, IonContent, IonInput, IonItem, IonList],
})
export class AdminLoginPage implements OnInit {
  email = '';
  password = '';

  readonly errorMessage = signal('');
  readonly status = signal('');
  readonly loading = signal(false);

  private readonly session = inject(AdminSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('denied')) {
      this.errorMessage.set(
        'Administrator access required. Sign in with an admin account.'
      );
    }
  }

  async signIn(): Promise<void> {
    if (!this.credentialsValid()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.status.set('Signing in...');

    try {
      await this.session.loginAsAdmin(this.email, this.password, (message) =>
        this.status.set(message)
      );
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      await this.router.navigateByUrl(
        redirect && redirect.startsWith('/') ? redirect : '/dashboard',
        { replaceUrl: true }
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof AdminAccessDeniedError
          ? error.message
          : authErrorMessage(error)
      );
    } finally {
      this.loading.set(false);
      this.status.set('');
    }
  }

  private credentialsValid(): boolean {
    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Enter your email and password.');
      return false;
    }
    return true;
  }
}
