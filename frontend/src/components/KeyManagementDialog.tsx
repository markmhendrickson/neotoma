/**
 * Key management dialog for importing/exporting keys
 */

import { ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useSettings } from '@/hooks/useSettings';
interface KeyManagementDialogProps {
  maskedPrivateKey: string;
  bearerToken: string;
  onImport: (keyExports: { x25519: any; ed25519: any }) => Promise<boolean>;
  onExport: () => Promise<{ x25519: any; ed25519: any } | null>;
  onRegenerate: () => Promise<boolean>;
  trigger?: ReactNode;
}

export function KeyManagementDialog({
  maskedPrivateKey,
  bearerToken,
  onImport,
  onExport,
  onRegenerate,
  trigger,
}: KeyManagementDialogProps) {
  const { toast } = useToast();
  const { settings, saveSettings } = useSettings();
  const [importText, setImportText] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOpenRequest = () => {
      setOpen(true);
    };

    window.addEventListener('open-settings', handleOpenRequest);
    return () => {
      window.removeEventListener('open-settings', handleOpenRequest);
    };
  }, []);

  const handleExport = async () => {
    try {
      const keyExport = await onExport();
      if (keyExport) {
        const json = JSON.stringify(keyExport, null, 2);
        navigator.clipboard.writeText(json);
        toast({
          title: 'Keys exported',
          description: 'Keys copied to clipboard',
        });
      }
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export keys',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    try {
      const keyExports = JSON.parse(importText) as { x25519: any; ed25519: any };
      const success = await onImport(keyExports);
      if (success) {
        toast({
          title: 'Keys imported',
          description: 'Keys imported successfully',
        });
        setImportText('');
        setOpen(false);
        window.location.reload();
      } else {
        toast({
          title: 'Import failed',
          description: 'Invalid key format',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Invalid JSON',
        variant: 'destructive',
      });
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Are you sure? This will generate new keys and you will lose access to data encrypted with the old keys.')) {
      return;
    }

    const success = await onRegenerate();
    if (success) {
      toast({
        title: 'Keys regenerated',
        description: 'New keys generated successfully',
      });
      setOpen(false);
      window.location.reload();
    } else {
      toast({
        title: 'Regeneration failed',
        description: 'Failed to regenerate keys',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl" aria-describedby="settings-description">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <p id="settings-description" className="sr-only">
          Manage settings: enable/disable API sync, view keys, export/import keys, or regenerate new keys.
        </p>
        <div className="space-y-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                id="apiSyncEnabled"
                checked={settings.apiSyncEnabled}
                onChange={(e) => saveSettings({ apiSyncEnabled: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="apiSyncEnabled" className="font-normal cursor-pointer">
                Enable API Sync
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              When enabled, records will be synced to the API after being saved locally. When disabled, records are stored locally only.
            </p>
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                id="csvRowRecordsEnabled"
                checked={settings.csvRowRecordsEnabled}
                onChange={(e) => saveSettings({ csvRowRecordsEnabled: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="csvRowRecordsEnabled" className="font-normal cursor-pointer">
                Create per-row records for CSV uploads
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              When enabled, CSV uploads create one record per row plus relationships linking them to the source file.
            </p>
          </div>
          <div>
            <Label>Private Key (masked)</Label>
            <Input value={maskedPrivateKey} readOnly className="font-mono text-xs" />
          </div>
          <div>
            <Label>Bearer Token (for ChatGPT Actions)</Label>
            <Input value={bearerToken} readOnly className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground mt-1">
              Use this as your Bearer Token in ChatGPT Actions configuration
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline">
              Export Keys
            </Button>
            <Button onClick={handleRegenerate} variant="destructive">
              Regenerate Keys
            </Button>
          </div>
          <div>
            <Label>Import Keys</Label>
            <textarea
              className="w-full h-32 p-2 border rounded font-mono text-xs"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste exported keys JSON here"
            />
            <Button onClick={handleImport} className="mt-2" disabled={!importText.trim()}>
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

