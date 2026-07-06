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
| AWS | `aws_assume_role` | IAM role ARN, payer/member account ID, optional CUR S3 URI |
| Azure | `azure_delegated_app` | Tenant/subscription ID, delegated app or workload identity principal, optional export URI |
| GCP | `gcp_workload_identity` | Billing account/project ID, Workload Identity Federation provider/principal, optional BigQuery export reference |

The onboarding API must reject plaintext access keys, client secrets,
passwords, service-account keys, and base64 credential blobs. Static secrets
are a legacy fallback only and must live in Vault/OpenBao outside the normal
cloud-connection contract.

## Portfolio views
The frontend and API support:

- Separate spend by provider, account, account group, or cloud connection.
- Collective tenant-wide rollups across AWS, Azure, and GCP.
- Account groups for ownership or business-unit views.
- Saved views through `X-Costalyx-View-Id`, still bounded by the token tenant.

## Current production path
1. Operator provisions the Costalyx tenant and OIDC tenant claim.
2. Customer creates read-only cloud trust:
   AWS IAM role, Azure delegated app/workload identity, or GCP Workload
   Identity Federation principal.
3. Admin registers the connection in Costalyx.
4. Costalyx validates the reference structurally now, and live provider
   validation should verify the read-only role before ingestion is marked
   production-ready for that connection.
5. Billing exports are ingested with `tenant_id` and `cloud_connection_id`.
6. Cost, reports, recommendations, savings, and audit rows stay tenant scoped.

## Next connector hardening
- Implement live AWS STS `AssumeRole` validation with external ID and CUR S3
  read probe.
- Implement Azure token acquisition and Cost Management export read probe.
- Implement GCP Workload Identity Federation token exchange and BigQuery
  billing-export row-limit probe.
- Add provider scheduler jobs per connection with last-success and
  last-failure evidence surfaced in the UI.
