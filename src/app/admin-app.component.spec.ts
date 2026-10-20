import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { provideRouter } from '@angular/router';
import { AdminAppComponent } from './admin-app.component';
import { AdminSessionService } from './core/auth/admin-session.service';
import { AdminNotificationsService } from './services/admin-notifications.service';

describe('AdminAppComponent navigation', () => {
  function setup(signedIn: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AdminAppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AdminSessionService,
          useValue: {
            signedIn$: new BehaviorSubject(signedIn),
            logout: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AdminNotificationsService,
          useValue: {
            notifications: () => [],
            unreadCount: () => 0,
            authorized: () => false,
            start: vi.fn(),
            markAllRead: vi.fn(),
            markRead: vi.fn(),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(AdminAppComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows a Customer Messages link to signed-in administrators', () => {
    const element = setup(true);
    const links = [...element.querySelectorAll('a')];

    const messagesLink = links.find(
      (link) => link.getAttribute('href') === '/messages'
    );
    expect(messagesLink).toBeDefined();
    expect(messagesLink?.textContent).toContain('Customer Messages');
    expect(messagesLink?.querySelector('ion-icon')?.getAttribute('name')).toBe(
      'mail-outline'
    );
  });

  it('keeps the existing Dashboard, Products and Orders links', () => {
    const element = setup(true);
    const hrefs = [...element.querySelectorAll('a')].map((link) =>
      link.getAttribute('href')
    );

    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/products');
    expect(hrefs).toContain('/orders');
    expect(hrefs).toContain('/messages');
  });

  it('hides the navigation when signed out', () => {
    const element = setup(false);

    expect(element.querySelector('.admin-nav')).toBeNull();
  });
});
