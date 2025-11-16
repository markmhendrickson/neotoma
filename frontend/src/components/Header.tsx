import { useKeys } from '@/hooks/useKeys';
import { useSettings } from '@/hooks/useSettings';
import { KeyManagementDialog } from './KeyManagementDialog';
import { useEffect } from 'react';

export function Header() {
  const { bearerToken, maskedPrivateKey, loading, importKeys, exportKeys, regenerateKeys } = useKeys();
  const { updateBearerToken } = useSettings();

  // Update bearer token in settings when keys are loaded
  useEffect(() => {
    if (bearerToken && !loading) {
      updateBearerToken(bearerToken);
    }
  }, [bearerToken, loading, updateBearerToken]);

  return (
    <header className="flex justify-between items-center px-4 py-3 border-b bg-background shrink-0 flex-shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold m-0">Neotoma</h1>
        {!loading && maskedPrivateKey && (
          <span className="text-xs text-muted-foreground font-mono">
            Key: {maskedPrivateKey}
          </span>
        )}
      </div>
      <div className="flex gap-3 items-center">
        {!loading && (
          <KeyManagementDialog
            maskedPrivateKey={maskedPrivateKey}
            bearerToken={bearerToken}
            onImport={importKeys}
            onExport={exportKeys}
            onRegenerate={regenerateKeys}
          />
        )}
      </div>
    </header>
  );
}

