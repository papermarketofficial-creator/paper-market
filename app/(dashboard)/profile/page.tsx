"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTradingStore } from '@/stores/tradingStore';
import { User, Mail, Wallet, Crown, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const ProfilePage = () => {
  const router = useRouter();
  const { balance } = useTradingStore();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleLogout = () => {
    toast.success('Logged out successfully');
    router.push('/');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground">Manage your account information</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* User Info Card */}
        <Card className="bg-card border-border md:col-span-2 lg:col-span-1">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <Avatar className="h-24 w-24 border-4 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                JD
              </AvatarFallback>
            </Avatar>
          </div>
          <CardTitle className="text-foreground">John Doe</CardTitle>
          <CardDescription>Paper Trading Account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="text-sm font-medium text-foreground">John Doe</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium text-foreground">john@example.com</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Details */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Account Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-3xl sm:text-4xl font-bold text-foreground">
              {formatCurrency(balance)}
            </p>
            <p className="text-sm text-muted-foreground mt-2">Virtual Balance</p>
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">
              This is simulated money for paper trading only
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account Type */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Account Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <Badge className="text-lg px-4 py-2 bg-primary/20 text-primary border-primary/30">
              Free Plan
            </Badge>
            <p className="text-sm text-muted-foreground mt-4">
              Access to all basic features
            </p>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              Paper trading with virtual money
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              Real-time simulated data
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-success" />
              Trading journal access
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Logout Section */}
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-medium text-foreground">Sign Out</h3>
            <p className="text-sm text-muted-foreground">
              End your current session
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full sm:w-auto"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
  );
};

export default ProfilePage;
