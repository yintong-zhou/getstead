ALTER TABLE public.stead_users
  ADD COLUMN display_name VARCHAR(60),
  ADD CONSTRAINT stead_users_display_name_check
    CHECK (display_name IS NULL OR char_length(btrim(display_name)) BETWEEN 1 AND 60);
