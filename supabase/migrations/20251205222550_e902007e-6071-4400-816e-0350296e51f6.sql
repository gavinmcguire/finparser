-- Enable realtime for profiles table to detect access revocation immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;