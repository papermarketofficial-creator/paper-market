"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { stocksList } from '@/content/watchlist';
import { mockUsers } from '@/content/admin';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Settings, Users, RefreshCw, Plus, X, ShieldCheck } from 'lucide-react';

const AdminPage = () => {
  const [users, setUsers] = useState(mockUsers);
  const [stocks, setStocks] = useState(stocksList.map((s) => s.symbol));
  const [newStock, setNewStock] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleResetBalance = (userId: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, balance: 1000000, totalPnL: 0 }
          : user
      )
    );
    setResetUserId(null);
    toast.success('Balance Reset Successfully', {
      description: 'User balance has been reset to ₹10,00,000',
    });
  };

  const handleAddStock = () => {
    if (!newStock.trim()) return;
    const symbol = newStock.toUpperCase().trim();
    if (stocks.includes(symbol)) {
      toast.error('Stock already exists');
      return;
    }
    setStocks((prev) => [...prev, symbol]);
    setNewStock('');
    toast.success('Stock Added', {
      description: `${symbol} has been added to the list`,
    });
  };

  const handleRemoveStock = (symbol: string) => {
    setStocks((prev) => prev.filter((s) => s !== symbol));
    toast.success('Stock Removed', {
      description: `${symbol} has been removed from the list`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground">Manage users and platform settings</p>
        </div>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="users" className="data-[state=active]:bg-background">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="stocks" className="data-[state=active]:bg-background">
            <Settings className="h-4 w-4 mr-2" />
            Stocks
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">User Management</CardTitle>
              <CardDescription>View and manage platform users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {/* Mobile Card View */}
                <div className="sm:hidden space-y-3">
                  {users.map((user) => (
                    <div key={user.id} className="bg-muted/30 rounded-lg p-3 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{user.email}</span>
                        <Badge
                          variant={user.isAdmin ? 'default' : 'secondary'}
                          className={user.isAdmin ? 'bg-primary' : 'bg-muted text-muted-foreground'}
                        >
                          {user.isAdmin ? 'Admin' : 'User'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="block text-muted-foreground mb-0.5">Balance</span>
                          <span className="font-medium text-foreground text-sm">{formatCurrency(user.balance)}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-muted-foreground mb-0.5">Total P&L</span>
                          <span className={cn(
                            'font-medium text-sm',
                            user.totalPnL >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            {user.totalPnL >= 0 ? '+' : ''}{formatCurrency(user.totalPnL)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setResetUserId(user.id)}
                          className="w-full border-border text-muted-foreground hover:text-foreground h-8 text-xs"
                        >
                          <RefreshCw className="h-3 w-3 mr-2" />
                          Reset Balance
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="text-muted-foreground">Email</TableHead>
                        <TableHead className="text-muted-foreground">Role</TableHead>
                        <TableHead className="text-muted-foreground text-right">Balance</TableHead>
                        <TableHead className="text-muted-foreground text-right">Total P&L</TableHead>
                        <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id} className="border-border">
                          <TableCell className="text-foreground font-medium">
                            {user.email}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={user.isAdmin ? 'default' : 'secondary'}
                              className={user.isAdmin ? 'bg-primary' : 'bg-muted text-muted-foreground'}
                            >
                              {user.isAdmin ? 'Admin' : 'User'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-foreground">
                            {formatCurrency(user.balance)}
                          </TableCell>
                          <TableCell className={cn(
                            'text-right font-medium',
                            user.totalPnL >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            {user.totalPnL >= 0 ? '+' : ''}{formatCurrency(user.totalPnL)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setResetUserId(user.id)}
                              className="border-border text-muted-foreground hover:text-foreground"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reset
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stocks Tab */}
        <TabsContent value="stocks">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Stock Management</CardTitle>
              <CardDescription>Add or remove tradeable stock symbols</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Add Stock Form */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter stock symbol (e.g., ONGC)"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
                  className="max-w-xs bg-background border-input"
                />
                <Button onClick={handleAddStock} className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Stock
                </Button>
              </div>

              {/* Stock List */}
              <div className="flex flex-wrap gap-2">
                {stocks.map((symbol) => (
                  <Badge
                    key={symbol}
                    variant="outline"
                    className="px-3 py-1.5 text-sm border-border text-foreground hover:bg-muted/50 cursor-default"
                  >
                    {symbol}
                    <button
                      onClick={() => handleRemoveStock(symbol)}
                      className="ml-2 hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <p className="text-sm text-muted-foreground">
                {stocks.length} stocks available for trading
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reset Balance Dialog */}
      <AlertDialog open={!!resetUserId} onOpenChange={() => setResetUserId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Reset User Balance</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will reset the user's balance to ₹10,00,000 and clear their P&L. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border hover:bg-muted hover:text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetUserId && handleResetBalance(resetUserId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Reset Balance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPage;
