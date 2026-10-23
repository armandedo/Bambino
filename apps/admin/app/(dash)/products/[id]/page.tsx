'use client';

import {
  type AdminProduct,
  AdminAddProductImageMutation,
  AdminCreateProductImageUploadMutation,
  AdminCreateProductMutation,
  AdminProductQuery,
  AdminRemoveProductImageMutation,
  AdminUpdateProductMutation,
  AdminUpsertVariantMutation,
  CatalogueFiltersQuery,
  type ProductInput,
} from '@bambino/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  MoneyText,
  SelectField,
  TextField,
  TextareaField,
} from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { QueryState, RequirePermission, useAction } from '@/components/kit';
import { errorMessage } from '@/lib/format';
import { api, useStaff } from '@/lib/session';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function useCatalogueFilters() {
  return useQuery({
    queryKey: ['catalogue-filters-full'],
    queryFn: async () => await api.request(CatalogueFiltersQuery),
  });
}

function ProductForm({ product }: { product: AdminProduct | null }) {
  const { can } = useStaff();
  const router = useRouter();
  const filters = useCatalogueFilters();
  const [error, setError] = useState<string | null>(null);
  const save = useAction(
    async (input: ProductInput) =>
      product
        ? (await api.request(AdminUpdateProductMutation, { id: product.id, input })).adminUpdateProduct
        : (await api.request(AdminCreateProductMutation, { input })).adminCreateProduct,
    { success: 'Product saved', invalidate: [['admin-products'], ['admin-product', product?.id ?? 'new']] },
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const optional = (name: string) => text(name) || null;
    if (!text('categoryId')) return setError('Choose a category.');
    setError(null);
    save.mutate(
      {
        name: text('name'),
        description: text('description'),
        brand: text('brand') || 'Bambino',
        categoryId: text('categoryId'),
        material: optional('material'),
        sustainabilityInfo: optional('sustainabilityInfo'),
        careInstructions: optional('careInstructions'),
        subscriptionEligible: form.get('subscriptionEligible') === 'on',
        oneTimeEligible: form.get('oneTimeEligible') === 'on',
        isActive: form.get('isActive') === 'on',
      },
      { onSuccess: (saved) => !product && router.replace(`/products/${saved.id}`) },
    );
  }

  const readOnly = !can('product:write');
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate aria-label="Product details">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" name="name" defaultValue={product?.name ?? ''} required />
          <TextField label="Brand" name="brand" defaultValue={product?.brand ?? 'Bambino'} />
          <SelectField
            label="Category"
            name="categoryId"
            defaultValue={product?.category.id ?? ''}
            placeholder="Choose a category"
            options={(filters.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <TextareaField
          label="Description"
          name="description"
          defaultValue={product?.description ?? ''}
          rows={3}
          required
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Material" name="material" defaultValue={product?.material ?? ''} />
          <TextField label="Care" name="careInstructions" defaultValue={product?.careInstructions ?? ''} />
          <TextField
            label="Sustainability"
            name="sustainabilityInfo"
            defaultValue={product?.sustainabilityInfo ?? ''}
          />
        </div>
        <div className="flex flex-wrap gap-6">
          <Checkbox
            name="subscriptionEligible"
            label="In subscriptions"
            defaultChecked={product?.subscriptionEligible ?? true}
          />
          <Checkbox
            name="oneTimeEligible"
            label="Sold one-time"
            defaultChecked={product?.oneTimeEligible ?? true}
          />
          <Checkbox name="isActive" label="Visible in the shop" defaultChecked={product?.isActive ?? false} />
        </div>
      </fieldset>
      {readOnly ? null : (
        <Button type="submit" className="w-fit" loading={save.isPending}>
          {product ? 'Save changes' : 'Create product'}
        </Button>
      )}
    </form>
  );
}

function Variants({ product }: { product: AdminProduct }) {
  const { can } = useStaff();
  const filters = useCatalogueFilters();
  const [error, setError] = useState<string | null>(null);
  const add = useAction(
    (input: { sku: string; sizeCode: string; color: string; priceAmount: number }) =>
      api.request(AdminUpsertVariantMutation, { input: { productId: product.id, ...input } }),
    { success: 'Variant saved', invalidate: [['admin-product', product.id]] },
  );
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        caption="Variants"
        captionHidden
        rows={[...product.variants].sort((a, b) => a.size.sortOrder - b.size.sortOrder)}
        rowKey={(v) => v.id}
        empty="No variants yet."
        columns={[
          {
            key: 'sku',
            header: 'SKU',
            rowHeader: true,
            cell: (v) => <span className="font-mono text-xs">{v.sku}</span>,
          },
          { key: 'size', header: 'Size', cell: (v) => v.size.label },
          { key: 'color', header: 'Colour', cell: (v) => v.color },
          { key: 'price', header: 'Price', align: 'end', cell: (v) => <MoneyText value={v.price} /> },
          {
            key: 'stock',
            header: 'New stock',
            cell: (v) => (v.inStock ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>),
          },
          {
            key: 'garments',
            header: 'Garments to reserve',
            cell: (v) => (v.availableForSubscription ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>),
          },
        ]}
      />
      {can('product:write') ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3"
          aria-label="Add a variant"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const priceAmount = Number(form.get('price'));
            if (!Number.isSafeInteger(priceAmount) || priceAmount <= 0)
              return setError('Price must be a positive whole number of francs.');
            setError(null);
            add.mutate(
              {
                sku: String(form.get('sku') ?? '').trim(),
                sizeCode: String(form.get('size') ?? ''),
                color: String(form.get('color') ?? '').trim(),
                priceAmount,
              },
              { onSuccess: () => (event.target as HTMLFormElement).reset() },
            );
          }}
        >
          <TextField label="SKU" name="sku" required />
          <SelectField
            label="Size"
            name="size"
            placeholder="Choose"
            options={(filters.data?.sizes ?? []).map((s) => ({ value: s.code, label: s.label }))}
          />
          <TextField label="Colour" name="color" required />
          <TextField
            label="Price (RWF)"
            name="price"
            inputMode="numeric"
            required
            error={error ?? undefined}
          />
          <Button type="submit" variant="outline" loading={add.isPending}>
            Add variant
          </Button>
        </form>
      ) : null}
      <p className="text-sm text-foreground-muted">
        Price changes are written to the audit log. Existing orders keep the price they were placed at.
      </p>
    </div>
  );
}

/** Uploads straight to object storage with a signed URL; the API checks the stored file before attaching it. */
function Images({ product }: { product: AdminProduct }) {
  const { can } = useStaff();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useAction(
    async () => {
      if (!file) throw new Error('Choose a file.');
      const { adminCreateProductImageUpload: target } = await api.request(
        AdminCreateProductImageUploadMutation,
        {
          productId: product.id,
          contentType: file.type,
          byteSize: file.size,
        },
      );
      const response = await fetch(target.uploadUrl, {
        method: target.method,
        headers: Object.fromEntries(target.headers.map((h) => [h.name, h.value])),
        body: file,
      });
      if (!response.ok) throw new Error(`The storage service refused the upload (${response.status}).`);
      return api.request(AdminAddProductImageMutation, {
        productId: product.id,
        mediaAssetId: target.mediaAssetId,
        altText: altText.trim(),
      });
    },
    { success: 'Photo added', invalidate: [['admin-product', product.id]] },
  );
  const remove = useAction((imageId: string) => api.request(AdminRemoveProductImageMutation, { imageId }), {
    success: 'Photo removed',
    invalidate: [['admin-product', product.id]],
  });

  return (
    <div className="flex flex-col gap-4">
      {product.images.length === 0 ? (
        <p className="text-sm text-foreground-muted">No photos yet. The shop shows a drawn placeholder.</p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {product.images.map((image) => (
          <li key={image.id} className="flex flex-col gap-2">
            {/* Plain img: photos are served from object storage. */}
            <img
              src={image.url}
              alt={image.altText}
              className="aspect-square w-full rounded-lg border border-border object-cover"
            />
            {can('product:write') ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove.mutate(image.id)}
                loading={remove.isPending && remove.variables === image.id}
              >
                Remove<span className="sr-only"> photo: {image.altText}</span>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {can('product:write') ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
          aria-label="Add a photo"
          onSubmit={(event) => {
            event.preventDefault();
            if (!file) return setProblem('Choose a file.');
            if (!IMAGE_TYPES.includes(file.type)) return setProblem('Use a JPEG, PNG or WebP image.');
            if (file.size > MAX_IMAGE_BYTES) return setProblem('The image must be 5 MB or smaller.');
            if (altText.trim().length < 3)
              return setProblem('Describe the photo for people who cannot see it.');
            setProblem(null);
            upload.mutate(undefined, {
              onSuccess: () => {
                setFile(null);
                setAltText('');
                (event.target as HTMLFormElement).reset();
              },
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Photo (JPEG, PNG or WebP, up to 5 MB)
            <input
              type="file"
              accept={IMAGE_TYPES.join(',')}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm font-normal file:mr-3 file:rounded-full file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:font-semibold file:text-primary-soft-foreground"
            />
          </label>
          <TextField
            label="Description (alt text)"
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            error={problem ?? undefined}
          />
          <Button type="submit" variant="outline" className="w-fit" loading={upload.isPending}>
            Upload photo
          </Button>
          {upload.isError ? <p className="text-sm text-danger">{errorMessage(upload.error)}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function ProductEditor({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['admin-product', id],
    queryFn: async () => (await api.request(AdminProductQuery, { id })).adminProduct,
    enabled: id !== 'new',
  });
  if (id === 'new') {
    return (
      <Card>
        <CardHeader title="New product" description="Add variants and photos after creating it." level={2} />
        <ProductForm product={null} />
      </Card>
    );
  }
  return (
    <QueryState query={query} what="this product">
      {(product) =>
        !product ? (
          <Alert tone="warning">Product not found.</Alert>
        ) : (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader title={product.name} description={`/shop/${product.slug}`} level={2} />
              <ProductForm product={product} />
            </Card>
            <Card>
              <CardHeader title="Variants and prices" level={2} />
              <Variants product={product} />
            </Card>
            <Card>
              <CardHeader title="Photos" level={2} />
              <Images product={product} />
            </Card>
          </div>
        )
      }
    </QueryState>
  );
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequirePermission permission="product:read">
      <ProductEditor id={id} />
    </RequirePermission>
  );
}
