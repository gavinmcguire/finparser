-- Change the trigger function to default new users to 'approved' instead of 'pending'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    'approved'
  );
  RETURN NEW;
END;
$$;

-- Also update any existing pending users to approved
UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';