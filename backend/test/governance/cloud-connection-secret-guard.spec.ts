import { findCloudConnectionSecretMaterial } from '../../src/governance/cloud-connection-secret-guard';

describe('cloud connection secret guard', () => {
  it('allows readonly role, workload identity, and unsigned billing export references', () => {
    expect(
      findCloudConnectionSecretMaterial({
        readOnlyPrincipal: 'arn:aws:iam::123456789012:role/CostalyxReadOnlyBilling',
        billingExportUri: 's3://customer-cur/costalyx/',
        gcpProvider: 'projects/123456789/locations/global/workloadIdentityPools/costalyx/providers/billing'
      })
    ).toEqual([]);
  });

  it('flags signed export URLs, access keys, and base64 credential blobs', () => {
    const fakeAccessKeyLikePrincipal = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const serviceAccountJson = Buffer.from(
      JSON.stringify({
        type: 'service_account',
        private_key: '-----BEGIN PRIVATE KEY-----redacted-----END PRIVATE KEY-----'
      })
    ).toString('base64');

    expect(
      findCloudConnectionSecretMaterial({
        billingExportUri: 'https://storage.example.test/costalyx/exports/?sig=do-not-store',
        readOnlyPrincipal: fakeAccessKeyLikePrincipal,
        encodedCredential: serviceAccountJson
      })
    ).toEqual(['billingExportUri', 'encodedCredential', 'readOnlyPrincipal']);
  });
});
