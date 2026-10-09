import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonCard,
  IonChip,
  IonContent,
  IonIcon,
  IonSpinner,
  IonToggle,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, alertCircle, cafe, create, trash } from 'ionicons/icons';
import { Product } from '@shared/models/product.model';
import { ProductsService } from '@shared/services/products.service';
import { AdminApiService } from '../../core/api/admin-api.service';

@Component({
  selector: 'admin-products',
  templateUrl: './admin-products.page.html',
  styleUrls: ['./admin-products.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    IonBadge,
    IonButton,
    IonCard,
    IonChip,
    IonContent,
    IonIcon,
    IonSpinner,
    IonToggle,
  ],
})
export class AdminProductsPage implements OnInit {
  readonly products = signal<Product[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly busyId = signal<string | null>(null);

  private readonly productsService = inject(ProductsService);
  private readonly adminApi = inject(AdminApiService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({ add, alertCircle, cafe, create, trash });
  }

  ngOnInit(): void {
    this.productsService
      .watchProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.products.set(this.sort(products));
          this.status.set('ready');
        },
        error: () => this.status.set('error'),
      });
  }

  isAvailable(product: Product): boolean {
    return product.available !== false;
  }

  formatPrice(price: number): string {
    if (typeof price !== 'number' || !Number.isFinite(price)) {
      return '—';
    }
    return `₱${price.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  async toggleAvailability(product: Product, checked: boolean): Promise<void> {
    this.busyId.set(product.id);
    try {
      await this.adminApi.updateProduct(product.id, { available: checked });
    } catch {
      product.available = !checked;
      await this.showError('Could not update availability. Please try again.');
    } finally {
      this.busyId.set(null);
    }
  }

  async confirmDelete(product: Product): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete product?',
      message: `"${product.name}" will be permanently removed from the menu.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void this.deleteProduct(product);
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteProduct(product: Product): Promise<void> {
    this.busyId.set(product.id);
    try {
      await this.adminApi.deleteProduct(product.id);
    } catch {
      await this.showError('Could not delete the product. Please try again.');
    } finally {
      this.busyId.set(null);
    }
  }

  private async showError(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
  }

  private sort(products: Product[]): Product[] {
    return [...products].sort(
      (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
    );
  }
}
