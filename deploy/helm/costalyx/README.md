# Costalyx Helm Chart

This chart deploys the Costalyx backend and frontend to Kubernetes. It
assumes production Postgres, Keycloak, Vault, and Redpanda are operated
outside the chart by default, matching `09-DEPLOYMENT.md`.

## Required Secret

Create a runtime secret before install:

```bash
kubectl create secret generic costalyx-runtime-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=vault-token='...' \
  --namespace costalyx
```

For production, source those values from Vault, External Secrets Operator,
or the platform secret manager rather than typing them by hand.

## Cloud Probe Config

Set `config.awsBrokerPrincipalArn` to the Costalyx-controlled AWS IAM
principal that customers trust with the generated external ID. Set
`config.liveCloudProbes=enabled` only when the backend pods have broker AWS
credentials and network access to provider APIs. `config.awsProbeRegion`
can override the AWS probe region.

## Render

```bash
helm template costalyx ./deploy/helm/costalyx \
  --namespace costalyx \
  --set backend.image.tag="$COMMIT_SHA" \
  --set frontend.image.tag="$COMMIT_SHA"
```

## Rollback

```bash
kubectl rollout undo deployment/costalyx-backend -n costalyx
kubectl rollout undo deployment/costalyx-frontend -n costalyx
kubectl rollout status deployment/costalyx-backend -n costalyx
kubectl rollout status deployment/costalyx-frontend -n costalyx
```
