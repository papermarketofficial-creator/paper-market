"use client";
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Moon, Sun, Bell, Mail, Smartphone, RotateCcw, Palette, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';

const SettingsPage = () => {
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState({
    tradeAlerts: true,
    priceAlerts: false,
    emailDigest: true,
    pushNotifications: false,
    soundAlerts: true,
  });

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    toast.success('Preference updated');
  };

  const handleResetPreferences = () => {
    setNotifications({
      tradeAlerts: true,
      priceAlerts: false,
      emailDigest: true,
      pushNotifications: false,
      soundAlerts: true,
    });
    setTheme('dark');
    toast.success('All preferences reset to defaults');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Customize your trading experience</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Theme Settings */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>Customize the look and feel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Sun className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-foreground font-medium">Theme</Label>
                  <p className="text-sm text-muted-foreground">
                    Switch between dark and light mode
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === 'light' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  className="w-20"
                >
                  <Sun className="h-4 w-4 mr-1" />
                  Light
                </Button>
                <Button
                  variant={theme === 'dark' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  className="w-20"
                >
                  <Moon className="h-4 w-4 mr-1" />
                  Dark
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Settings */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>Manage your notification preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Trade Alerts</Label>
              </div>
              <Switch
                checked={notifications.tradeAlerts}
                onCheckedChange={() => handleNotificationChange('tradeAlerts')}
              />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Price Alerts</Label>
              </div>
              <Switch
                checked={notifications.priceAlerts}
                onCheckedChange={() => handleNotificationChange('priceAlerts')}
              />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Email Digest</Label>
              </div>
              <Switch
                checked={notifications.emailDigest}
                onCheckedChange={() => handleNotificationChange('emailDigest')}
              />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Push Notifications</Label>
              </div>
              <Switch
                checked={notifications.pushNotifications}
                onCheckedChange={() => handleNotificationChange('pushNotifications')}
              />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-foreground">Sound Alerts</Label>
              </div>
              <Switch
                checked={notifications.soundAlerts}
                onCheckedChange={() => handleNotificationChange('soundAlerts')}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Preferences */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <RotateCcw className="h-4 w-4" />
                Reset Preferences
              </h3>
              <p className="text-sm text-muted-foreground">
                Restore all settings to their default values
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleResetPreferences}
              className="w-full sm:w-auto border-border"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset All
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
