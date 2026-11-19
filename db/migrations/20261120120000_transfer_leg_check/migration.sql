BEGIN;

-- The first version of this check let a paired row without a leg through: with a NULL transfer_leg
-- the sign test evaluates to SQL UNKNOWN, and a CHECK accepts UNKNOWN. Require the leg explicitly.
ALTER TABLE "stead_movements" DROP CONSTRAINT "stead_movements_transfer_check";

ALTER TABLE "stead_movements" ADD CONSTRAINT "stead_movements_transfer_check"
    CHECK (
        (transfer_id IS NULL AND transfer_leg IS NULL)
        OR (
            transfer_id IS NOT NULL
            AND transfer_leg IS NOT NULL
            AND ((transfer_leg = 'OUT' AND amount_cents < 0) OR (transfer_leg = 'IN' AND amount_cents > 0))
        )
    );

COMMIT;
