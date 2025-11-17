import { useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyManagementDialog } from './KeyManagementDialog';
import { useKeys } from '@/hooks/useKeys';
import { useSettings } from '@/hooks/useSettings';

export function FloatingSettingsButton() {
  const { bearerToken, maskedPrivateKey, loading, importKeys, exportKeys, regenerateKeys } = useKeys();
  const { updateBearerToken } = useSettings();
  const lastBearerTokenRef = useRef<string>('');

  useEffect(() => {
    if (bearerToken && !loading && bearerToken !== lastBearerTokenRef.current) {
      lastBearerTokenRef.current = bearerToken;
      updateBearerToken(bearerToken);
    }
  }, [bearerToken, loading, updateBearerToken]);

  if (loading) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <KeyManagementDialog
        maskedPrivateKey={maskedPrivateKey}
        bearerToken={bearerToken}
        onImport={importKeys}
        onExport={exportKeys}
        onRegenerate={regenerateKeys}
        trigger={
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-xl bg-primary text-primary-foreground hover:bg-primary/90"
            aria-label="Open settings"
          >
            <Settings className="h-5 w-5" />
          </Button>
        }
      />
    </div>
  );
}


