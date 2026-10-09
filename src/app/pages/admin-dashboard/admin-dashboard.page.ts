import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircle, cafe } from 'ionicons/icons';
import { Product } from '@shared/models/product.model';
import { ProductsService } from '@shared/services/products.service';

@Component({
  selector: 'admin-dashboard',
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonIcon,
    IonSpinner,
  ],
})
export class AdminDashboardPage implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');

  readonly total = computed(() => this.products().length);
  readonly available = computed(
    () => this.products().filter((product) => product.available !== false).length
  );
  readonly unavailable = computed(() => this.total() - this.available());

  private readonly productsService = inject(ProductsService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({ alertCircle, cafe });
  }

  ngOnInit(): void {
    this.productsService
      .watchProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.products.set(products);
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }
}
