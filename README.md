# VIS Runtime

Venture Intelligence System autonomous runtime.

Production branch: `main`
Development branch: `develop`

## VIS V1.6

Runtime architecture:

Sensors -> Scout -> Atlas -> Vector -> D1 -> Slack

Operating loop:

Run -> Observe -> Diagnose -> Repair -> Verify -> Document -> Continue

V1.6 engineering goals:

- controlled development
- automated validation
- migration discipline
- staging
- deployment verification
- rollback capability
- progressive modularization

## Financial Safeguard

Autonomous external spend limit: $0 USD.

Paid spending must not be enabled without explicit Founder authorization.

## Security

Credentials and secrets must never be committed to this repository.

Runtime secrets remain in Cloudflare.

## Deployment

`main` is production.

Development and testing occur on `develop` before promotion.
