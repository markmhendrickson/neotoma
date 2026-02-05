/**
 * Transaction Quick Entry Dialog
 * 
 * Form for quickly adding financial transactions
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { getApiClient } from "@/lib/api_client";
import { createIdempotencyKey } from "@/lib/idempotency";

interface TransactionDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (entityType: string, entityId: string) => void;
}

export function TransactionDialog({ open, onClose, onSave }: TransactionDialogProps) {
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken } = useKeys();
  const { sessionToken, user } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!amount || !merchant) {
      toast({
        title: "Validation error",
        description: "Amount and merchant are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const api = getApiClient(bearerToken);
      const transactionData = {
        entity_type: "transaction",
        amount: parseFloat(amount),
        merchant,
        category: category || "uncategorized",
        transaction_date: date,
        description: description || undefined,
      };
      const idempotencyKey = await createIdempotencyKey({
        entities: [transactionData],
        source_priority: 100,
        user_id: user?.id,
      });
      const { data, error } = await api.POST("/api/store", {
        body: {
          entities: [transactionData],
          idempotency_key: idempotencyKey,
          user_id: user?.id,
        },
      });

      if (error || !data) {
        throw new Error("Failed to save transaction");
      }
      const entityId = data.entities?.[0]?.entity_id;

      toast({
        title: "Transaction saved",
        description: `Added ${merchant} transaction for $${amount}`,
      });

      // Reset form
      setAmount("");
      setMerchant("");
      setCategory("");
      setDescription("");
      setDate(new Date().toISOString().split("T")[0]);

      onSave("transaction", entityId);
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save transaction",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
          <DialogDescription>
            Quickly add a financial transaction to your timeline
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="merchant">Merchant *</Label>
              <Input
                id="merchant"
                placeholder="e.g., Whole Foods"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g., groceries"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional notes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Transaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
