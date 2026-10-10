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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonToggle,
  ToastController,
} from '@ionic/angular';
import { authErrorMessage } from '@shared/core/auth/auth-errors';
import { formatPhp } from '@shared/core/format/format';
import {
  CUSTOM_CATEGORY_VALUE,
  KNOWN_CATEGORIES,
  STANDARD_SIZE_PRICES,
  buildProductInput,
  sizePricesForEdit,
} from '@shared/core/products/product-form';
import { Product } from '@shared/models/product.model';
import { ProductsService } from '@shared/services/products.service';
import {
  AdminApiError,
  AdminApiService,
} from '../../core/api/admin-api.service';
import { ProductImageUploadService } from '../../core/api/product-image-upload.service';

/** Sugar choices supported by the customer app today. */
const SUGAR_CHOICES = ['No Sugar', 'Less Sugar', 'Regular', 'Extra Sugar'];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () =>
      reject(new Error('The selected file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** User-facing reason an upload failed (backend message when there is one). */
function uploadFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return (
    'The image could not be uploaded. Check that the backend is running and try again.'
  );
}

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
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonToggle,
  ],
})
export class AdminProductFormPage implements OnInit {
  readonly customCategoryValue = CUSTOM_CATEGORY_VALUE;
  /** Formats the legacy flat price shown for tier-less products. */
  readonly formatPrice = formatPhp;

  name = '';
  description = '';
  category = '';
  customCategory = '';
  imageUrl = '';
  /** Size prices in PHP. New products start at the standard coffee prices. */
  smallPrice = String(STANDARD_SIZE_PRICES.small);
  mediumPrice = String(STANDARD_SIZE_PRICES.medium);
  largePrice = String(STANDARD_SIZE_PRICES.large);

  readonly sugarChoices = SUGAR_CHOICES;
  readonly selectedSugar = signal<string[]>([...SUGAR_CHOICES]);
  readonly available = signal(true);

  /** Categories known to the app plus every category already in use. */
  readonly categoryOptions = signal<string[]>([...KNOWN_CATEGORIES]);

  /** Preview of the image: the saved product image, or an in-memory data URL
   * for a newly selected file. Only the data URL is local — nothing here is
   * uploaded; the saved value is the `imageUrl` returned by the backend. */
  readonly imagePreview = signal<string | null>(null);
  /** True once the admin picked a file, i.e. the image will be replaced. */
  readonly imageSelected = signal(false);
  /**
   * Set when the loaded product has only a legacy flat price: its size fields
   * are pre-filled with that amount, which is not three distinct prices.
   */
  readonly legacyFlatPrice = signal<number | null>(null);
  /** Status message about the selected image (uploaded, or why it failed). */
  readonly uploadNotice = signal('');
  /** True when `uploadNotice` describes a failure rather than a success. */
  readonly uploadNoticeError = signal(false);
  /** True while the selected file is being uploaded to the backend. */
  readonly uploading = signal(false);

  readonly productId = signal<string | null>(null);
  readonly editing = computed(() => this.productId() !== null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');

  private existing: Product | null = null;
  private readonly knownCategories = new Set<string>(KNOWN_CATEGORIES);

  /** File selected but not yet confirmed by the backend upload endpoint. */
  private pendingFile: File | null = null;
  /** Upload started for `pendingFile`, shared so save() waits for it. */
  private uploadInFlight: Promise<string> | null = null;
  /** Bumped on every selection change so a stale upload is never applied. */
  private uploadGeneration = 0;

  private readonly productsService = inject(ProductsService);
  private readonly adminApi = inject(AdminApiService);
  private readonly imageUpload = inject(ProductImageUploadService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const id = params.get('id');
        this.productId.set(id);
        if (id) {
          void this.loadProduct(id);
        }
      });

    this.productsService
      .watchProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          for (const product of products) {
            if (product.category) {
              this.knownCategories.add(product.category);
            }
          }
          this.categoryOptions.set([...this.knownCategories].sort());
        },
        error: () => {
          // Keep the built-in categories when the catalog cannot be read.
        },
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

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Allow selecting the same file again after a change.
    input.value = '';

    // Anything still in flight belongs to a selection that no longer exists.
    const generation = ++this.uploadGeneration;
    this.uploadInFlight = null;

    if (!file) {
      this.imagePreview.set(null);
      this.imageSelected.set(false);
      this.pendingFile = null;
      this.uploading.set(false);
      this.uploadNotice.set('');
      this.uploadNoticeError.set(false);
      return;
    }

    const issue = this.imageUpload.validate(file);
    if (issue) {
      this.imagePreview.set(null);
      this.imageSelected.set(false);
      this.pendingFile = null;
      this.uploading.set(false);
      this.uploadNotice.set(issue);
      this.uploadNoticeError.set(true);
      return;
    }

    try {
      const preview = await readFileAsDataUrl(file);
      if (generation !== this.uploadGeneration) {
        return;
      }
      this.imagePreview.set(preview);
    } catch {
      if (generation !== this.uploadGeneration) {
        return;
      }
      this.imagePreview.set(null);
      this.imageSelected.set(false);
      this.pendingFile = null;
      this.uploading.set(false);
      this.uploadNotice.set('The selected file could not be read.');
      this.uploadNoticeError.set(true);
      return;
    }

    this.pendingFile = file;
    this.imageSelected.set(true);
    this.uploadNotice.set('');
    this.uploadNoticeError.set(false);
    this.uploading.set(true);
    try {
      const imageUrl = await this.startUpload();
      if (generation !== this.uploadGeneration) {
        return;
      }
      this.applyUploaded(imageUrl);
    } catch (error) {
      if (generation !== this.uploadGeneration) {
        return;
      }
      // Keep the file selected so saving retries the upload before writing.
      this.uploadInFlight = null;
      this.uploadNotice.set(uploadFailureMessage(error));
      this.uploadNoticeError.set(true);
    } finally {
      if (generation === this.uploadGeneration) {
        this.uploading.set(false);
      }
    }
  }

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const draft = buildProductInput(
      {
        name: this.name,
        description: this.description,
        category: this.category,
        customCategory: this.customCategory,
        imageUrl: this.imageUrl,
        smallPrice: this.smallPrice,
        mediumPrice: this.mediumPrice,
        largePrice: this.largePrice,
        sugarOptions: this.selectedSugar(),
        available: this.available(),
      },
      this.existing?.cloudinaryPublicId ?? ''
    );
    if (!draft.ok) {
      this.errorMessage.set(draft.error);
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      // 1) Image upload — no-op unless a new file was selected. A failure
      //    aborts the save, so a product is never written with a stale URL.
      const imageUrl = await this.ensureImageUploaded();
      // 2) Product write carrying the URL the backend returned.
      const input = { ...draft.input, imageUrl };
      const id = this.productId();
      if (id) {
        await this.adminApi.updateProduct(id, input);
      } else {
        await this.adminApi.createProduct(input);
      }

      // Success is reported only after BOTH steps succeeded.
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

  /**
   * Resolves with the `imageUrl` the product must store: it uploads the
   * pending file (waiting for an upload that is already in flight instead of
   * sending it twice) and otherwise returns the URL already on the form.
   * Rejects when the upload did not succeed, so `save()` reports failure and
   * never claims the product was saved.
   */
  private async ensureImageUploaded(): Promise<string> {
    if (!this.pendingFile) {
      return this.imageUrl.trim();
    }

    this.uploading.set(true);
    this.uploadNotice.set('');
    this.uploadNoticeError.set(false);
    try {
      const imageUrl = await this.startUpload();
      this.applyUploaded(imageUrl);
      return imageUrl;
    } catch (error) {
      // The file stays selected: the next save attempt retries the upload.
      this.uploadInFlight = null;
      const message = uploadFailureMessage(error);
      this.uploadNotice.set(message);
      this.uploadNoticeError.set(true);
      throw error;
    } finally {
      this.uploading.set(false);
    }
  }

  /** Starts the upload for the pending file, or reuses the running one. */
  private startUpload(): Promise<string> {
    const file = this.pendingFile;
    if (!file) {
      return Promise.resolve(this.imageUrl.trim());
    }
    if (!this.uploadInFlight) {
      this.uploadInFlight = this.imageUpload.upload(file);
    }
    return this.uploadInFlight;
  }

  /** Stores the URL the backend confirmed and marks the file as uploaded. */
  private applyUploaded(imageUrl: string): void {
    this.imageUrl = imageUrl;
    this.pendingFile = null;
    this.uploadInFlight = null;
    this.uploadNotice.set('Image uploaded. Only this URL is saved with the product.');
    this.uploadNoticeError.set(false);
  }

  private async loadProduct(id: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    this.legacyFlatPrice.set(null);
    this.resetImageState();
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
      if (product.category) {
        this.knownCategories.add(product.category);
        this.categoryOptions.set([...this.knownCategories].sort());
      }
      // The saved image is kept exactly as stored: nothing is uploaded unless
      // the admin picks a replacement file.
      this.imageUrl = product.imageUrl ?? '';
      this.imagePreview.set(this.imageUrl || null);
      const sizes = sizePricesForEdit(product);
      this.smallPrice = sizes.small;
      this.mediumPrice = sizes.medium;
      this.largePrice = sizes.large;
      this.legacyFlatPrice.set(sizes.legacyFlatPrice);
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

  /**
   * Drops whatever was picked for the previously loaded product so an edit
   * never keeps (or re-uploads) a file that does not belong to this form.
   */
  private resetImageState(): void {
    this.uploadGeneration++; // an upload still in flight becomes stale
    this.uploadInFlight = null;
    this.pendingFile = null;
    this.imageUrl = '';
    this.imagePreview.set(null);
    this.imageSelected.set(false);
    this.uploading.set(false);
    this.uploadNotice.set('');
    this.uploadNoticeError.set(false);
  }
}
