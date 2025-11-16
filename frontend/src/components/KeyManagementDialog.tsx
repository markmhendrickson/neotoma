/**
 * Key management dialog for importing/exporting keys
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { KeyExport } from '../../../src/crypto/types.js';

interface KeyManagementDialogProps {
  maskedPrivateKey: string;
  bearerToken: string;
  onImport: (keyExport: KeyExport) => Promise<boolean>;
  onExport: () => Promise<KeyExport | null>;
  onRegenerate: () => Promise<boolean>;
}

export function KeyManagementDialog({
  maskedPrivateKey,
  bearerToken,
  onImport,
  onExport,
  onRegenerate,
}: KeyManagementDialogProps) {
  const { toast } = useToast();
  const [importText, setImportText] = useState('');
  const [open, setOpen] = useState(false);

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
      const keyExport = JSON.parse(importText) as KeyExport;
      const success = await onImport(keyExport);
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
        <Button variant="outline" size="sm">
          Keys
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Key Management</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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

