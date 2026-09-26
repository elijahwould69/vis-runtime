# VIS Database Migrations

VIS V1.6 migration policy:

1. Production D1 changes must be additive unless explicitly approved.
2. Schema changes must be idempotent.
3. Existing production data must never be destroyed automatically.
4. Destructive migrations require Founder approval.
5. Runtime schema repair remains available through the protected admin route.
6. Production migrations must be verified before a release is considered healthy.

V1.6 initially preserves the proven V1.5 ensureSchema() behavior.
