/**
 * Contact Quick Entry Dialog
 * 
 * Form for quickly adding contacts
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

interface ContactDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (entityType: string, entityId: string) => void;
}

export function ContactDialog({ open, onClose, onSave }: ContactDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken } = useKeys();
  const { sessionToken, user } = useAuth();
  const bearerToken = sessionToken || keysBearerToken || settings.bearerToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      toast({
        title: "Validation error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const contactData: Record<string, unknown> = {
        entity_type: "contact",
        name,
      };

      if (email) contactData.email = email;
      if (company) contactData.company = company;
      if (phone) contactData.phone = phone;

      const api = getApiClient(bearerToken);
      const { data, error } = await api.POST("/api/store", {
        body: {
          entities: [contactData],
          user_id: user?.id,
        },
      });

      if (error || !data) {
        throw new Error("Failed to save contact");
      }
      const entityId = data.entities?.[0]?.entity_id;

      toast({
        title: "Contact saved",
        description: `Added contact: ${name}`,
      });

      // Reset form
      setName("");
      setEmail("");
      setCompany("");
      setPhone("");

      onSave("contact", entityId);
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save contact",
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
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Quickly add a contact to your network
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="e.g., john@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                placeholder="e.g., Acme Corp"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="e.g., (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
