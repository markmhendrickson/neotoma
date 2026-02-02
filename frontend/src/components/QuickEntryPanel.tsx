/**
 * Quick Entry Panel
 * 
 * Quick-entry buttons and dialogs for common entity types
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CheckSquare, User, Calendar } from "lucide-react";
import { TransactionDialog } from "./quick-entry/TransactionDialog";
import { TaskDialog } from "./quick-entry/TaskDialog";
import { ContactDialog } from "./quick-entry/ContactDialog";
import { EventDialog } from "./quick-entry/EventDialog";

interface QuickEntryPanelProps {
  onEntityCreated?: (entityType: string, entityId: string) => void;
}

export function QuickEntryPanel({ onEntityCreated }: QuickEntryPanelProps) {
  const [dialogOpen, setDialogOpen] = useState<string | null>(null);

  const handleSave = (entityType: string, entityId: string) => {
    if (onEntityCreated) {
      onEntityCreated(entityType, entityId);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Quick Add</CardTitle>
          <CardDescription>
            Quickly add common data types to your knowledge graph
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setDialogOpen("transaction")}
            >
              <DollarSign className="h-5 w-5" />
              <span className="text-sm">Transaction</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setDialogOpen("task")}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="text-sm">Task</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setDialogOpen("contact")}
            >
              <User className="h-5 w-5" />
              <span className="text-sm">Contact</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              onClick={() => setDialogOpen("event")}
            >
              <Calendar className="h-5 w-5" />
              <span className="text-sm">Event</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog forms for each type */}
      <TransactionDialog
        open={dialogOpen === "transaction"}
        onClose={() => setDialogOpen(null)}
        onSave={handleSave}
      />
      <TaskDialog
        open={dialogOpen === "task"}
        onClose={() => setDialogOpen(null)}
        onSave={handleSave}
      />
      <ContactDialog
        open={dialogOpen === "contact"}
        onClose={() => setDialogOpen(null)}
        onSave={handleSave}
      />
      <EventDialog
        open={dialogOpen === "event"}
        onClose={() => setDialogOpen(null)}
        onSave={handleSave}
      />
    </>
  );
}
