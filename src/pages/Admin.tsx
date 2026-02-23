import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  ArrowLeft, 
  Check, 
  X, 
  Loader2,
  Users,
  UserCheck,
  UserX,
  Sparkles,
  FileText,
  Ban
} from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  documentCount?: number;
}

export default function Admin() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isLoading: authLoading, user } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileError) throw profileError;

      // Fetch document counts per user
      const { data: docCounts, error: docError } = await supabase
        .from('document_analyses')
        .select('user_id');

      if (docError) throw docError;

      // Count documents per user
      const countMap: Record<string, number> = {};
      (docCounts || []).forEach((doc: any) => {
        countMap[doc.user_id] = (countMap[doc.user_id] || 0) + 1;
      });

      const usersWithCounts = (profileData || []).map(p => ({
        ...p,
        documentCount: countMap[p.id] || 0,
      })) as UserProfile[];

      setUsers(usersWithCounts);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserStatus = async (userId: string, status: 'approved' | 'rejected') => {
    setUpdatingId(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', userId);

      if (error) throw error;

      setUsers(prev => prev.map(u => 
        u.id === userId ? { ...u, status } : u
      ));

      toast({
        title: status === 'rejected' ? 'User kicked' : 'User restored',
        description: status === 'rejected' ? 'User has been removed and will be signed out' : 'User access restored',
      });
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: 'Failed to update user status',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center animate-pulse">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const activeUsers = users.filter(u => u.status === 'approved');
  const kickedUsers = users.filter(u => u.status === 'rejected');
  const totalDocs = users.reduce((sum, u) => sum + (u.documentCount || 0), 0);

  const UserCard = ({ user: profile }: { user: UserProfile }) => (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
      profile.status === 'rejected' 
        ? 'bg-destructive/5 border-destructive/20' 
        : 'bg-muted/30 border-border/50 hover:border-border'
    }`}>
      <div className="space-y-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{profile.full_name || 'No name'}</p>
          {profile.status === 'rejected' && (
            <Badge variant="destructive" className="text-[10px] h-5">
              <Ban className="h-2.5 w-2.5 mr-1" />Kicked
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground font-mono truncate">{profile.email}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {profile.documentCount || 0} uploads
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {profile.id !== user?.id && (
          <>
            {profile.status === 'rejected' ? (
              <Button
                size="sm"
                variant="outline"
                className="text-success hover:bg-success/10 hover:border-success/50 text-xs"
                onClick={() => updateUserStatus(profile.id, 'approved')}
                disabled={updatingId === profile.id}
              >
                {updatingId === profile.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Restore
                  </>
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:border-destructive/50 text-xs"
                onClick={() => updateUserStatus(profile.id, 'rejected')}
                disabled={updatingId === profile.id}
              >
                {updatingId === profile.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    Kick
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background relative">
      <div className="fixed inset-0 grid-pattern opacity-30 pointer-events-none" />
      <div className="fixed top-0 right-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent to-primary flex items-center justify-center glow-accent">
                <Shield className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-mono tracking-tight">
                  <span className="gradient-text">Admin Dashboard</span>
                </h1>
                <p className="text-xs text-muted-foreground">Manage users & track usage</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 relative">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="stat-card flex items-center gap-4 hover-lift">
            <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
              <UserCheck className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-foreground">{activeUsers.length}</p>
              <p className="text-sm text-muted-foreground">Active Users</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4 hover-lift">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-foreground">{totalDocs}</p>
              <p className="text-sm text-muted-foreground">Total Uploads</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-4 hover-lift">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <UserX className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-3xl font-bold font-mono text-foreground">{kickedUsers.length}</p>
              <p className="text-sm text-muted-foreground">Kicked</p>
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="glass-card rounded-2xl p-6 mb-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Active Users ({activeUsers.length})
          </h2>
          {activeUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No active users</p>
          ) : (
            <div className="space-y-3">
              {activeUsers.map(profile => (
                <UserCard key={profile.id} user={profile} />
              ))}
            </div>
          )}
        </div>

        {/* Kicked Users */}
        {kickedUsers.length > 0 && (
          <div className="glass-card rounded-2xl p-6 animate-fade-in border-destructive/20">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              Kicked Users ({kickedUsers.length})
            </h2>
            <div className="space-y-3">
              {kickedUsers.map(profile => (
                <UserCard key={profile.id} user={profile} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
