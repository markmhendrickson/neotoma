import { useRealtime } from "@/contexts/RealtimeContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function RealtimeStatusIndicator() {
  const { isConnected, error } = useRealtime();

  const statusText = isConnected ? "Live" : error ? "Error" : "Disconnected";
  const statusColor = isConnected ? "bg-green-500" : "bg-red-500";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 text-sm cursor-pointer">
            <div className={`h-2 w-2 rounded-full ${statusColor}`} />
            <span className="text-muted-foreground">{statusText}</span>
          </div>
        </TooltipTrigger>
        {error && (
          <TooltipContent>
            <p className="text-xs">{error}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
