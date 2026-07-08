# Costalyx SLO And Support Guide

## SLOs

| SLO | Target | User impact |
|---|---|---|
| API availability | 99.9% monthly for live, ready, and authenticated API traffic | Users can log in, view spend, and operate workflows. |
| Ingestion freshness | 95% of enabled cloud connections ingest within 24 hours of export availability | Cost and anomaly data remain current enough for daily FinOps. |
| Dashboard latency | p95 seeded dashboard usable within 3 seconds; production target to be measured after RUM is added | Persona workflows remain interactive. |
| Statement delivery auditability | 100% of approved/sent statement transitions have audit evidence | Finance can trust the statement lifecycle. |

## Error Budget Policy

- API availability 99.9% over 30 days allows 43.2 minutes of downtime.
- Burn over 50% in the first week: freeze non-critical releases until root
  cause is mitigated.
- Burn over 100%: block feature deploys except reliability/security fixes.

## Support Escalation Template

Include:
- Tenant ID or customer name.
- Affected provider/account/scope if relevant.
- User role and route.
- Correlation time window.
- Screenshot or run evidence ID.
- Whether data is dummy, sandbox, or real customer cloud data.
- Recent deploy/migration/secret rotation details.

## Known Limitations

- Milestone H real-cloud proof is blocked until real customer read-only cloud
  references and Costalyx broker identities exist.
- Dummy data is verified(mock), not production proof.
- Full clean app-tier Compose browser proof is environment-blocked on this
  workstation by Colima instability; CI or a stable Docker daemon should run it.
- Commitment portfolio planning and business unit-economics metric ingestion are
  accepted roadmap items.
- Formal FOCUS export is an accepted roadmap item.

