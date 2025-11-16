import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSettings } from '@/hooks/useSettings';
import { useToast } from '@/components/ui/use-toast';

export function Header() {
  const { settings, saveSettings } = useSettings();
  const { toast } = useToast();
  const [apiBase, setApiBase] = useState(settings.apiBase);
  const [token, setToken] = useState(settings.bearerToken);

  const handleSave = () => {
    saveSettings({ apiBase: apiBase.trim() || 'http://localhost:8080', bearerToken: token.trim() });
    toast({
      title: 'Settings saved',
      description: 'Settings have been saved successfully.',
    });
    window.location.reload();
  };

  return (
    <header className="flex justify-between items-center px-4 py-3 border-b bg-background shrink-0 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold m-0">Neotoma</h1>
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex flex-col gap-1">
          <Label htmlFor="apiBase" className="text-xs text-muted-foreground">
            API Base URL
          </Label>
          <Input
            id="apiBase"
            placeholder="http://localhost:8080"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            className="h-8 w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="token" className="text-xs text-muted-foreground">
            Bearer Token
          </Label>
          <Input
            id="token"
            type="password"
            placeholder="ACTIONS_BEARER_TOKEN"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="h-8 w-48"
          />
        </div>
        <Button onClick={handleSave} className="h-8">
          Save & Reload
        </Button>
      </div>
    </header>
  );
}

