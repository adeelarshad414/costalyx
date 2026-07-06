# 12-MULTITENANT-CLOUD-PORTFOLIO.md - Costalyx Tenant Cloud Portfolio

## Purpose
This document captures the production architecture for connecting real
customer cloud accounts. Costalyx should operate like a tenant-scoped FinOps
control plane: customers grant read-only cloud access, Costalyx ingests and
normalizes billing data, and users can view spend by individual account,
account group, cloud connection, provider, or whole tenant portfolio.

## Tenancy model
- Every authenticated request carries a tenant claim from OIDC:
  `costalyx_tenant_id`, `tenant_id`, or `org_id`.
- Backend repositories enforce `tenant_id` on cost, governance,
  optimization, audit, report, and idempotency reads/writes.
- Users do not choose tenant scope through query strings. Query filters can
  narrow within the tenant only.
- Local development may use the documented default tenant; production must
  issue real tenant claims through the identity provider.

## Cloud connection model
`cloud_connections` stores read-only access references:

| Provider | Access mode | Required reference |
|---|---|---|
| AWS | `aws_assume_role` | IAM role ARN, payer/member account ID, CUR S3 URI |
| Azure | `azure_delegated_app` | Tenant/subscription ID, delegated app or workload identity principal, optional export URI |
| GCP | `gcp_workload_identity` | Billing account/project ID, Workload Identity Federation provider/principal, optional BigQuery export reference |

The onboarding API must reject plaintext access keys, client secrets,
passwords, service-account keys, and base64 credential blobs. Static secrets
are a legacy fallback only and must live in Vault/OpenBao outside the normal
cloud-connection contract.

For AWS, Costalyx returns a generated `externalId` for each cloud connection:
`costalyx:{tenant_id}:{cloud_connection_id}`. The customer configures that
value in the IAM role trust policy. Costalyx does not ask the customer to
invent or send an external ID, and the external ID is not treated as a
secret.
Admins can call `GET /api/v1/cloud-connections/{id}/onboarding` to retrieve
the AWS trust policy and least-privilege CUR S3 read policy template. The
trust policy is returned only when `COSTALYX_AWS_BROKER_PRINCIPAL_ARN` is
configured with the Costalyx-controlled broker principal; otherwise the API
returns an explicit `broker_principal_missing` state.
For Azure, the onboarding response returns delegated-app/workload-identity role
assignment guidance for Reader, Cost Management Reader, and export storage
read access. For GCP, it returns Workload Identity Federation principal-set
guidance plus Billing Viewer and BigQuery read/job IAM bindings. The endpoint
does not accept signed export URLs, SAS tokens, service-account JSON, customer
access keys, client secrets, or base64 credential blobs.

## Portfolio views
The frontend and API support:

- Separate spend by provider, account, account group, or cloud connection.
- Collective tenant-wide rollups across AWS, Azure, and GCP.
- Account groups for ownership or business-unit views.
- Saved views through `X-Costalyx-View-Id`, still bounded by the token tenant.
- Latest validation and ingestion run evidence per cloud connection, including
  success/failure status, timestamps, sanitized probe codes, batch IDs, row
  counts, and duplicate counts.

## Current production path
1. Operator provisions the Costalyx tenant and OIDC tenant claim.
2. Admin registers the connection reference in Costalyx.
3. The admin loads the provider onboarding template and gives the customer the
   generated AWS trust/S3 policies, Azure role assignments, or GCP IAM
   bindings.
4. Customer grants read-only cloud trust: AWS IAM role, Azure delegated
   app/workload identity, or GCP Workload Identity Federation principal.
5. Costalyx validates the reference. With `COSTALYX_LIVE_CLOUD_PROBES`
   unset, the connection reaches `ready_for_live_probe` after structural
   validation. With `COSTALYX_LIVE_CLOUD_PROBES=enabled` and broker AWS
   credentials configured, AWS validation runs STS `AssumeRole`, verifies the
   assumed account ID, and lists the CUR S3 prefix before marking the
   connection `validated`. Operators can run the same AWS path before or
   during customer launch with `npm run probe:aws-live` by supplying only the
   tenant ID, customer account ID, read-only role ARN, and unsigned CUR S3
   URI; the command prints the generated external ID and sanitized validation
   evidence, not credential material. Azure validation uses the Costalyx
   broker identity to query Cost Management and list the unsigned Blob export
   prefix. GCP validation uses Workload Identity Federation / Application
   Default Credentials to read one row from the BigQuery billing export.
   Operators can preflight those same paths with `npm run probe:azure-live`
   and `npm run probe:gcp-live`.
6. Validation and ingestion attempts write sanitized rows to
   `cloud_connection_runs`, and the portfolio UI surfaces latest run evidence
   per connection.
7. A single scheduler worker can periodically validate every registered
   connection and, when scheduled ingestion is explicitly enabled, ingest each
   registered export URI into the same tenant-scoped run ledger. AWS CUR
   ingestion reads CSV/CSV.GZ objects directly from the registered S3 prefix
   through the customer read-only role and generated external ID.
8. Billing exports are ingested with `tenant_id` and `cloud_connection_id`.
9. Cost, reports, recommendations, savings, and audit rows stay tenant scoped.

## Next connector hardening
- Execute live AWS/Azure/GCP probes against real customer cloud accounts once
  broker identities and read-only customer grants are supplied.
- Add provider-native Azure Blob and GCP BigQuery scheduled export readers;
  AWS S3 CUR object reads are implemented.
