# Costalyx Customer Onboarding Checklist

## Day-One Tenant Setup

1. Create the customer tenant.
2. Configure IdP role mappings for `viewer`, `analyst`, and `admin`.
3. Invite the first admin and confirm the tenant claim resolves.
4. Verify login, `/portfolio`, `/costs`, and `/settings`.

## Connect AWS

Customer provides:
- AWS account ID.
- Read-only role ARN.
- Unsigned CUR S3 URI.

Costalyx provides:
- Generated external ID.
- Trust policy.
- Read-only permissions policy.
- CloudFormation and Terraform artifacts from the onboarding endpoint.
- Broker principal ARN for the customer trust policy.

Verification:
1. Run `npm run probe:live-readiness`.
2. Run `npm run probe:aws-live`.
3. Confirm validation run evidence in Cloud Portfolio.

## Connect Azure

Customer provides:
- Billing scope ID.
- Delegated principal ID.
- Unsigned Cost Management export Blob URI.

Costalyx provides:
- Broker identity details.
- Required read-only RBAC scope guidance.

Verification:
1. Run `npm run probe:live-readiness`.
2. Run `npm run probe:azure-live`.
3. Confirm validation run evidence in Cloud Portfolio.

## Connect GCP

Customer provides:
- Billing resource ID.
- Workload Identity Federation provider path.
- BigQuery billing export URI.
- Optional BigQuery location.

Costalyx provides:
- Broker identity / workload identity details.
- Required read-only BigQuery billing export access guidance.

Verification:
1. Run `npm run probe:live-readiness`.
2. Run `npm run probe:gcp-live`.
3. Confirm validation run evidence in Cloud Portfolio.

## First Analysis

1. Confirm each account appears separately in Portfolio.
2. Create or inspect the first account group.
3. Map the first allocation dimension.
4. Review Costs and Cost Explorer table fallback.
5. Run anomaly scan.
6. Review a statement draft.
7. Invite viewers and verify their scoped access.

## Boundary

Do not ask customers for access keys, SAS URLs, service-account JSON, private
keys, signed URLs, client secrets, or base64 credential blobs. The product is
designed around read-only references plus Costalyx-owned broker identities.

