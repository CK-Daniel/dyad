import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IpcClient } from "@/ipc/ipc_client";
import { showError, showSuccess, showInfo } from "@/lib/toast";
import { Play, Square, Globe, Terminal, Database, RefreshCw, Settings } from "lucide-react";
import { App } from "@/ipc/ipc_types";

interface WordPressToolbarProps {
  app: App;
  onRefresh?: () => void;
}

export function WordPressToolbar({ app, onRefresh }: WordPressToolbarProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [phpPort, setPhpPort] = useState<number | null>(null);
  const [mysqlPort, setMysqlPort] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const [installForm, setInstallForm] = useState({
    siteTitle: app.name,
    adminUser: "admin",
    adminPassword: "",
    adminEmail: "admin@example.com",
  });

  // Check WordPress status on mount and when app changes
  useEffect(() => {
    checkStatus();
  }, [app.id]);

  const checkStatus = async () => {
    try {
      const status = await IpcClient.getInstance().wordpressStatus({ appId: app.id });
      setIsRunning(status.running);
      setPhpPort(status.phpPort || null);
      setMysqlPort(status.mysqlPort || null);
    } catch (error) {
      console.error("Error checking WordPress status:", error);
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const result = await IpcClient.getInstance().wordpressStart({ appId: app.id });
      setPhpPort(result.phpPort);
      setMysqlPort(result.mysqlPort);
      setIsRunning(true);
      showSuccess(`WordPress started on port ${result.phpPort}`);
      onRefresh?.();
    } catch (error: any) {
      showError(`Failed to start WordPress: ${error.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await IpcClient.getInstance().wordpressStop({ appId: app.id });
      setIsRunning(false);
      setPhpPort(null);
      setMysqlPort(null);
      showInfo("WordPress stopped");
      onRefresh?.();
    } catch (error: any) {
      showError(`Failed to stop WordPress: ${error.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const handleOpenInBrowser = () => {
    if (phpPort) {
      window.open(`http://localhost:${phpPort}`, '_blank');
    }
  };

  const handleOpenAdmin = () => {
    if (phpPort) {
      window.open(`http://localhost:${phpPort}/wp-admin`, '_blank');
    }
  };

  const handleInstall = async () => {
    if (!installForm.adminPassword) {
      showError("Please enter an admin password");
      return;
    }

    try {
      await IpcClient.getInstance().wordpressInstall({
        appId: app.id,
        siteTitle: installForm.siteTitle,
        adminUser: installForm.adminUser,
        adminPassword: installForm.adminPassword,
        adminEmail: installForm.adminEmail,
      });
      showSuccess("WordPress installed successfully!");
      setShowInstallDialog(false);
    } catch (error: any) {
      showError(`Failed to install WordPress: ${error.message}`);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {!isRunning ? (
          <Button
            onClick={handleStart}
            disabled={isStarting}
            size="sm"
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {isStarting ? "Starting..." : "Start WordPress"}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleStop}
              disabled={isStopping}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Square className="h-4 w-4" />
              {isStopping ? "Stopping..." : "Stop"}
            </Button>
            
            <Button
              onClick={handleOpenInBrowser}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Globe className="h-4 w-4" />
              View Site
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Settings className="h-4 w-4" />
                  Tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleOpenAdmin}>
                  <Terminal className="h-4 w-4 mr-2" />
                  Admin Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowInstallDialog(true)}>
                  <Database className="h-4 w-4 mr-2" />
                  Install WordPress
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={checkStatus}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {phpPort && (
              <span className="text-sm text-muted-foreground">
                Running on port {phpPort}
              </span>
            )}
          </>
        )}
      </div>

      <Dialog open={showInstallDialog} onOpenChange={setShowInstallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install WordPress</DialogTitle>
            <DialogDescription>
              Set up your WordPress site with an admin account
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="siteTitle">Site Title</Label>
              <Input
                id="siteTitle"
                value={installForm.siteTitle}
                onChange={(e) => setInstallForm({ ...installForm, siteTitle: e.target.value })}
                placeholder="My WordPress Site"
              />
            </div>
            
            <div>
              <Label htmlFor="adminUser">Admin Username</Label>
              <Input
                id="adminUser"
                value={installForm.adminUser}
                onChange={(e) => setInstallForm({ ...installForm, adminUser: e.target.value })}
                placeholder="admin"
              />
            </div>
            
            <div>
              <Label htmlFor="adminPassword">Admin Password</Label>
              <Input
                id="adminPassword"
                type="password"
                value={installForm.adminPassword}
                onChange={(e) => setInstallForm({ ...installForm, adminPassword: e.target.value })}
                placeholder="Strong password"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="adminEmail">Admin Email</Label>
              <Input
                id="adminEmail"
                type="email"
                value={installForm.adminEmail}
                onChange={(e) => setInstallForm({ ...installForm, adminEmail: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInstallDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInstall}>
              Install WordPress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}