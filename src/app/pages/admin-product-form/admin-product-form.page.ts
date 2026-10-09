import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
  IonToggle,
  ToastController,
} from '@ionic/angular';
import { authErrorMessage } from '@shared/core/auth/auth-errors';
import { Product, ProductInput } from '@shared/models/product.model';
import { ProductsService } from '@shared/services/products.service';
import {
  AdminApiError,
  AdminApiService,
} from '../../core/api/admin-api.service';

/** Sugar choices supported by the customer app today. */
const SUGAR_CHOICES = ['No Sugar', 'Less Sugar', 'Regular', 'Extra Sugar'];

@Component({
  selector: 'admin-product-form',
  templateUrl: './admin-product-form.page.html',
  styleUrls: ['./admin-product-form.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    IonButton,
    IonContent,
    IonInput,
    IonItem,
    IonList,
    IonSpinner,
    IonToggle,
  ],
})
export class AdminProductFormPage implements OnInit {
  name = '';
  description = '';
  category = '';
  imageUrl = '';
  smallPrice = '';
  mediumPrice = '';
  largePrice = '';

  readonly sugarChoices = SUGAR_CHOICES;
  readonly selectedSugar = signal<string[]>([...SUGAR_CHOICES]);
  readonly available = signal(true);

  readonly productId = signal<string | null>(null);
  readonly editing = computed(() => this.productId() !== null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');

  private existing: Product | null = null;

  private readonly productsService = inject(ProductsService);
  private readonly adminApi = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      this.productId.set(id);
      if (id) {
        void this.loadProduct(id);
      }
    });
  }

  toggleSugar(option: string): void {
    const current = this.selectedSugar();
    this.selectedSugar.set(
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  }

  async save(): Promise<void> {
    const input = this.buildInput();
    if (!input) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const id = this.productId();
      if (id) {
        await this.adminApi.updateProduct(id, input);
      } else {
        await this.adminApi.createProduct(input);
      }

      const toast = await this.toastCtrl.create({
        message: 'Product saved.',
        duration: 2500,
        color: 'success',
      });
      await toast.present();
      await this.router.navigate(['/products'], { replaceUrl: true });
    } catch (error) {
      this.errorMessage.set(
        error instanceof AdminApiError
          ? error.message
          : authErrorMessage(error)
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async loadProduct(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const product = await this.productsService.getProduct(id);
      if (!product) {
        this.errorMessage.set('This product no longer exists.');
        return;
      }
      this.existing = product;
      this.name = product.name;
      this.description = product.description ?? '';
      this.category = product.category ?? '';
      this.imageUrl = product.imageUrl ?? '';
      this.smallPrice = this.toInput(product.smallPrice);
      this.mediumPrice = this.toInput(product.mediumPrice);
      this.largePrice = this.toInput(product.largePrice);
      this.available.set(product.available !== false);
      if (product.sugarOptions && product.sugarOptions.length > 0) {
        this.selectedSugar.set([...product.sugarOptions]);
      }
    } catch {
      this.errorMessage.set('Could not load this product. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private buildInput(): ProductInput | null {
    const name = this.name.trim();
    const category = this.category.trim();

    if (!name) {
      this.errorMessage.set('Product name is required.');
      return null;
    }
    if (!category) {
      this.errorMessage.set('Category is required.');
      return null;
    }

    const smallPrice = this.parsePrice(this.smallPrice, 'Small');
    const mediumPrice = this.parsePrice(this.mediumPrice, 'Medium');
    const largePrice = this.parsePrice(this.largePrice, 'Large');
    if (
      smallPrice === null ||
      mediumPrice === null ||
      largePrice === null
    ) {
      return null;
    }

    if (this.selectedSugar().length === 0) {
      this.errorMessage.set('Select at least one sugar option.');
      return null;
    }

    this.errorMessage.set('');
    return {
      name,
      description: this.description.trim(),
      category,
      imageUrl: this.imageUrl.trim(),
      cloudinaryPublicId: this.existing?.cloudinaryPublicId ?? '',
      smallPrice,
      mediumPrice,
      largePrice,
      sugarOptions: this.selectedSugar(),
      available: this.available(),
    };
  }

  private parsePrice(raw: string, label: string): number | null {
    const value = Number(String(raw).trim());
    if (!Number.isFinite(value) || value <= 0) {
      this.errorMessage.set(`Enter a valid ${label} price greater than 0.`);
      return null;
    }
    return value;
  }

  private toInput(price: number | undefined): string {
    return typeof price === 'number' && Number.isFinite(price)
      ? String(price)
      : '';
  }
}
