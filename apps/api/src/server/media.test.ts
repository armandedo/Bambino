import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp, errorCode, errorReason } from '../testing/test-app';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ catalogue: true });
}, 120_000);

afterAll(async () => {
  await t.close();
});

const CREATE_UPLOAD = `mutation ($productId: ID!, $type: String!, $size: Int!) {
  adminCreateProductImageUpload(productId: $productId, contentType: $type, byteSize: $size) {
    mediaAssetId uploadUrl method headers { name value } expiresAt } }`;
const ATTACH = `mutation ($productId: ID!, $assetId: ID!) {
  adminAddProductImage(productId: $productId, mediaAssetId: $assetId, altText: "Folded bodysuit") { images { id url altText } } }`;
const REMOVE = 'mutation ($id: ID!) { adminRemoveProductImage(imageId: $id) { images { id } } }';

async function productId(slug: string): Promise<string> {
  const response = await t.gql('query ($slug: String!) { product(slug: $slug) { id } }', { slug });
  return (response.data?.product as { id: string }).id;
}

describe('product images', () => {
  it('uploads directly to storage, verifies the stored file and attaches it', async () => {
    const admin = await t.registerStaff('CONTENT_MANAGER');
    const id = await productId('seed-organic-cotton-bodysuit');

    const upload = (
      await t.gql(
        CREATE_UPLOAD,
        { productId: id, type: 'image/webp', size: 120_000 },
        { token: admin.accessToken },
      )
    ).data?.adminCreateProductImageUpload as {
      mediaAssetId: string;
      uploadUrl: string;
      method: string;
      headers: { name: string; value: string }[];
    };
    expect(upload.method).toBe('PUT');
    expect(upload.headers).toEqual([{ name: 'content-type', value: 'image/webp' }]);
    const objectKey = t.storage.uploads.at(-1) ?? '';
    expect(objectKey).toMatch(new RegExp(`^products/${id}/[0-9a-f-]{36}\\.webp$`));

    // Attaching before the file arrives is refused.
    expect(
      errorReason(
        await t.gql(ATTACH, { productId: id, assetId: upload.mediaAssetId }, { token: admin.accessToken }),
      ),
    ).toBe('UPLOAD_MISSING');

    t.storage.put(objectKey, { contentType: 'image/webp', byteSize: 118_431 });
    const attached = await t.gql(
      ATTACH,
      { productId: id, assetId: upload.mediaAssetId },
      { token: admin.accessToken },
    );
    expect(attached.errors).toBeUndefined();
    const images = (
      attached.data?.adminAddProductImage as { images: { id: string; url: string; altText: string }[] }
    ).images;
    expect(images).toEqual([
      { id: expect.any(String), url: `http://storage.test/${objectKey}`, altText: 'Folded bodysuit' },
    ]);

    // The public catalogue now shows it.
    const publicView = await t.gql('{ product(slug: "seed-organic-cotton-bodysuit") { images { url } } }');
    expect(publicView.data?.product).toEqual({ images: [{ url: `http://storage.test/${objectKey}` }] });

    expect(
      errorReason(
        await t.gql(ATTACH, { productId: id, assetId: upload.mediaAssetId }, { token: admin.accessToken }),
      ),
    ).toBe('IMAGE_ALREADY_ATTACHED');
    const removed = await t.gql(REMOVE, { id: images[0]?.id }, { token: admin.accessToken });
    expect(removed.data?.adminRemoveProductImage).toEqual({ images: [] });
  });

  it('rejects unsupported types, oversized files, mismatched uploads and other products', async () => {
    const admin = await t.registerStaff('CONTENT_MANAGER');
    const id = await productId('seed-footed-romper');
    const otherId = await productId('seed-sleep-suit');

    expect(
      errorCode(
        await t.gql(
          CREATE_UPLOAD,
          { productId: id, type: 'image/svg+xml', size: 1_000 },
          { token: admin.accessToken },
        ),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(
      errorCode(
        await t.gql(
          CREATE_UPLOAD,
          { productId: id, type: 'image/png', size: 6_000_000 },
          { token: admin.accessToken },
        ),
      ),
    ).toBe('VALIDATION_FAILED');

    const upload = (
      await t.gql(
        CREATE_UPLOAD,
        { productId: id, type: 'image/png', size: 50_000 },
        { token: admin.accessToken },
      )
    ).data?.adminCreateProductImageUpload as { mediaAssetId: string };
    const objectKey = t.storage.uploads.at(-1) ?? '';

    // An upload reserved for one product cannot be attached to another.
    expect(
      errorCode(
        await t.gql(
          ATTACH,
          { productId: otherId, assetId: upload.mediaAssetId },
          { token: admin.accessToken },
        ),
      ),
    ).toBe('NOT_FOUND');

    t.storage.put(objectKey, { contentType: 'text/html', byteSize: 50_000 });
    expect(
      errorReason(
        await t.gql(ATTACH, { productId: id, assetId: upload.mediaAssetId }, { token: admin.accessToken }),
      ),
    ).toBe('UPLOAD_TYPE_MISMATCH');
    t.storage.put(objectKey, { contentType: 'image/png', byteSize: 9_000_000 });
    expect(
      errorReason(
        await t.gql(ATTACH, { productId: id, assetId: upload.mediaAssetId }, { token: admin.accessToken }),
      ),
    ).toBe('UPLOAD_TOO_LARGE');
  });

  it('is limited to staff who can edit products', async () => {
    const support = await t.registerStaff('CUSTOMER_SUPPORT');
    const id = await productId('seed-footed-romper');
    expect(
      errorCode(
        await t.gql(
          CREATE_UPLOAD,
          { productId: id, type: 'image/png', size: 1_000 },
          { token: support.accessToken },
        ),
      ),
    ).toBe('FORBIDDEN');
  });
});
