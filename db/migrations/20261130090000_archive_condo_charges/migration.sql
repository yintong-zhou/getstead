-- Keep every historical charge and its original IDs. Millesimal tables can now be removed independently.
ALTER TABLE "stead_condo_charges"
  DROP CONSTRAINT "stead_condo_charges_user_id_property_id_table_id_fkey";
