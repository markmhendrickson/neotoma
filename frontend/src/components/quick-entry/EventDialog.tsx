/**
 * Event Quick Entry Dialog
 * 
 * Form for quickly adding events/appointments
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useSettings } from "@/hooks/useSettings";
import { useKeys } from "@/hooks/useKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface EventDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (entityType: string, entityId: string) => void;
}

export function EventDialog({ open, onClose, onSave }: EventDialogProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();
  const { settings } = useSettings();
  const { bearerToken: keysBearerToken } = useKeys();
  const { sessionToken, user } = useAuth();
  const bearerToken = keysBearerToken || sessionToken || settings.bearerToken;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title) {
      toast({
        title: "Validation error",
        description: "Title is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      }

      const eventData: Record<string, unknown> = {
        entity_type: "event",
        title,
      };

      if (date) eventData.date = date;
      if (time) eventData.time = time;
      if (location) eventData.location = location;
      if (participants) {
        // Split comma-separated participants into array
        eventData.participants = participants.split(",").map((p) => p.trim());
      }
      if (notes) eventData.notes = notes;

      const response = await fetch("/api/store", {
        method: "POST",
        headers,
        body: JSON.stringify({
          entities: [eventData],
          user_id: user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save event: ${response.statusText}`);
      }

      const data = await response.json();
      const entityId = data.entities?.[0]?.entity_id;

      toast({
        title: "Event saved",
        description: `Added event: ${title}`,
      });

      // Reset form
      setTitle("");
      setDate("");
      setTime("");
      setLocation("");
      setParticipants("");
      setNotes("");

      onSave("event", entityId);
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save event",
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
          <DialogTitle>Add Event</DialogTitle>
          <DialogDescription>
            Quickly add an event or appointment
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Team Meeting"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
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
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g., Conference Room A"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="participants">Participants</Label>
              <Input
                id="participants"
                placeholder="e.g., John, Sarah (comma-separated)"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
