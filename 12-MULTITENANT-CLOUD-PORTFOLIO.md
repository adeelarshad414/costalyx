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

## Portfolio views
The frontend and API support:

- Separate spend by provider, account, account group, or cloud connection.
- Collective tenant-wide rollups across AWS, Azure, and GCP.
- Account groups for ownership or business-unit views.
- Saved views through `X-Costalyx-View-Id`, still bounded by the token tenant.

## Current production path
1. Operator provisions the Costalyx tenant and OIDC tenant claim.
2. Admin registers the connection reference in Costalyx.
3. For AWS, the admin copies the returned `externalId` into the customer IAM
   role trust policy for the Costalyx broker principal.
4. Customer grants read-only cloud trust: AWS IAM role, Azure delegated
   app/workload identity, or GCP Workload Identity Federation principal.
5. Costalyx validates the reference. With `COSTALYX_LIVE_CLOUD_PROBES`
   unset, the connection reaches `ready_for_live_probe` after structural
   validation. With `COSTALYX_LIVE_CLOUD_PROBES=enabled` and broker AWS
   credentials configured, AWS validation runs STS `AssumeRole`, verifies the
   assumed account ID, and lists the CUR S3 prefix before marking the
   connection `validated`.
6. Billing exports are ingested with `tenant_id` and `cloud_connection_id`.
7. Cost, reports, recommendations, savings, and audit rows stay tenant scoped.

## Next connector hardening
- Add scheduled AWS validation and ingestion jobs per connection with
  last-success and last-failure evidence surfaced in the UI.
- Implement Azure token acquisition and Cost Management export read probe.
- Implement GCP Workload Identity Federation token exchange and BigQuery
  billing-export row-limit probe.
