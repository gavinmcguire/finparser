import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, isApproved, isAdmin, isLoading, profile } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if admin route
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Check if user is approved (admins bypass this)
  if (!isAdmin && !isApproved) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}
