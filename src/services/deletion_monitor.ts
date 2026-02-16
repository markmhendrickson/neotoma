/**
 * Deletion Monitor Service (Phase 2: Deadline Tracking)
 *
 * Monitors deletion request deadlines and sends alerts for approaching/overdue requests.
 * Designed to run as a daily cron job.
 */

import { supabase } from "../db.js";

export interface DeadlineAlert {
  deletion_request_id: string;
  user_id: string;
  deletion_type: string;
  deadline: string;
  days_remaining: number;
  status: "approaching" | "overdue";
  message: string;
}

/**
 * Check deletion request deadlines and generate alerts
 *
 * @param alertThresholdDays - Days before deadline to start alerting (default 7)
 * @returns Array of alerts for approaching/overdue deadlines
 */
export async function checkDeletionDeadlines(
  alertThresholdDays: number = 7
): Promise<DeadlineAlert[]> {
  const now = new Date();
  const alerts: DeadlineAlert[] = [];

  // Get pending/in_progress deletion requests
  const { data: requests, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .in("status", ["pending", "in_progress", "extended"])
    .order("deadline", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch deletion requests: ${error.message}`);
  }

  for (const request of requests || []) {
    const deadline = new Date(request.deadline);
    const daysRemaining = Math.floor(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if approaching deadline (within threshold)
    if (daysRemaining >= 0 && daysRemaining <= alertThresholdDays) {
      alerts.push({
        deletion_request_id: request.id,
        user_id: request.user_id,
        deletion_type: request.deletion_type,
        deadline: request.deadline,
        days_remaining: daysRemaining,
        status: "approaching",
        message: `Deletion request ${request.id} approaching deadline in ${daysRemaining} days (${deadline.toISOString()})`,
      });
    }

    // Check if overdue
    if (daysRemaining < 0) {
      alerts.push({
        deletion_request_id: request.id,
        user_id: request.user_id,
        deletion_type: request.deletion_type,
        deadline: request.deadline,
        days_remaining: daysRemaining,
        status: "overdue",
        message: `Deletion request ${request.id} is ${Math.abs(daysRemaining)} days overdue (deadline was ${deadline.toISOString()})`,
      });
    }
  }

  return alerts;
}

/**
 * Process overdue deletion requests (escalate or auto-process)
 *
 * @param autoProcess - Automatically process simple overdue requests (default false)
 * @returns Processing results
 */
export async function processOverdueRequests(
  autoProcess: boolean = false
): Promise<{ processed: number; escalated: number; errors: string[] }> {
  const alerts = await checkDeletionDeadlines();
  const overdueAlerts = alerts.filter((a) => a.status === "overdue");

  const results = {
    processed: 0,
    escalated: 0,
    errors: [] as string[],
  };

  for (const alert of overdueAlerts) {
    const { data: request } = await supabase
      .from("deletion_requests")
      .select("*")
      .eq("id", alert.deletion_request_id)
      .single();

    if (!request) {
      results.errors.push(
        `Deletion request ${alert.deletion_request_id} not found`
      );
      continue;
    }

    if (autoProcess && request.status === "pending") {
      // Auto-process simple pending requests
      try {
        const { processDeletionRequest } = await import("./gdpr_deletion.js");
        await processDeletionRequest(alert.deletion_request_id);
        results.processed++;
      } catch (err) {
        results.errors.push(
          `Failed to process ${alert.deletion_request_id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      // Escalate complex/in_progress requests
      await escalateDeletionRequest(alert.deletion_request_id, alert);
      results.escalated++;
    }
  }

  return results;
}

/**
 * Escalate deletion request (for manual review)
 *
 * @param deletionRequestId - Deletion request ID
 * @param alert - Deadline alert
 */
async function escalateDeletionRequest(
  deletionRequestId: string,
  alert: DeadlineAlert
): Promise<void> {
  // Log escalation (in production, this would send notifications)
  console.warn(`ESCALATED: ${alert.message}`);

  // Update request notes
  const { error } = await supabase
    .from("deletion_requests")
    .update({
      reason: `${alert.message}. Manual review required.`,
    })
    .eq("id", deletionRequestId);

  if (error) {
    console.error(
      `Failed to update escalation for ${deletionRequestId}:`,
      error.message
    );
  }
}

/**
 * Check retention period expirations and trigger hard deletion
 *
 * @returns Processing results
 */
export async function checkRetentionExpirations(): Promise<{
  processed: number;
  errors: string[];
}> {
  const now = new Date();
  const results = {
    processed: 0,
    errors: [] as string[],
  };

  // Get soft-deleted requests with retention periods that have expired
  const { data: requests, error } = await supabase
    .from("deletion_requests")
    .select("*")
    .eq("deletion_method", "soft_only")
    .not("soft_deleted_at", "is", null)
    .is("hard_deleted_at", null)
    .not("retention_period_days", "is", null);

  if (error) {
    results.errors.push(`Failed to fetch retention expirations: ${error.message}`);
    return results;
  }

  for (const request of requests || []) {
    const softDeletedAt = new Date(request.soft_deleted_at);
    const expirationDate = new Date(softDeletedAt);
    expirationDate.setDate(
      expirationDate.getDate() + (request.retention_period_days || 0)
    );

    if (now >= expirationDate) {
      // Retention period expired - trigger hard deletion
      try {
        const { processDeletionRequest } = await import("./gdpr_deletion.js");

        // Update deletion method to physical deletion
        await supabase
          .from("deletion_requests")
          .update({ deletion_method: "physical_deletion" })
          .eq("id", request.id);

        // Process deletion
        await processDeletionRequest(request.id);
        results.processed++;
      } catch (err) {
        results.errors.push(
          `Failed to process retention expiration for ${request.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return results;
}

/**
 * Generate deletion monitoring report
 *
 * @returns Monitoring report
 */
export async function generateMonitoringReport(): Promise<{
  total_pending: number;
  total_in_progress: number;
  total_completed: number;
  approaching_deadline: number;
  overdue: number;
  retention_expirations_pending: number;
  alerts: DeadlineAlert[];
}> {
  const alerts = await checkDeletionDeadlines();

  const { data: statusCounts } = await supabase
    .from("deletion_requests")
    .select("status")
    .in("status", ["pending", "in_progress", "completed"]);

  const pending = statusCounts?.filter((s: { status: string }) => s.status === "pending").length || 0;
  const inProgress =
    statusCounts?.filter((s: { status: string }) => s.status === "in_progress").length || 0;
  const completed =
    statusCounts?.filter((s: { status: string }) => s.status === "completed").length || 0;

  const approaching = alerts.filter((a) => a.status === "approaching").length;
  const overdue = alerts.filter((a) => a.status === "overdue").length;

  // Count retention expirations
  const now = new Date();
  const { data: retentionRequests } = await supabase
    .from("deletion_requests")
    .select("soft_deleted_at, retention_period_days")
    .eq("deletion_method", "soft_only")
    .not("soft_deleted_at", "is", null)
    .is("hard_deleted_at", null)
    .not("retention_period_days", "is", null);

  const retentionExpirations =
    retentionRequests?.filter((r: { soft_deleted_at: string; retention_period_days: number }) => {
      const softDeletedAt = new Date(r.soft_deleted_at);
      const expirationDate = new Date(softDeletedAt);
      expirationDate.setDate(
        expirationDate.getDate() + (r.retention_period_days || 0)
      );
      return now >= expirationDate;
    }).length || 0;

  return {
    total_pending: pending,
    total_in_progress: inProgress,
    total_completed: completed,
    approaching_deadline: approaching,
    overdue: overdue,
    retention_expirations_pending: retentionExpirations,
    alerts,
  };
}

/**
 * Daily cron job handler
 *
 * Checks deadlines, processes overdue requests, and checks retention expirations.
 *
 * @param autoProcessOverdue - Automatically process overdue requests (default true for automated environments)
 * @returns Cron job results
 */
export async function dailyCronJob(
  autoProcessOverdue: boolean = true
): Promise<{
  report: Awaited<ReturnType<typeof generateMonitoringReport>>;
  overdue_processing: Awaited<ReturnType<typeof processOverdueRequests>>;
  retention_processing: Awaited<ReturnType<typeof checkRetentionExpirations>>;
}> {
  const report = await generateMonitoringReport();
  const overdueProcessing = await processOverdueRequests(autoProcessOverdue);
  const retentionProcessing = await checkRetentionExpirations();

  // Log report
  console.log("Deletion Monitoring Report:", {
    report,
    overdueProcessing,
    retentionProcessing,
  });

  return {
    report,
    overdue_processing: overdueProcessing,
    retention_processing: retentionProcessing,
  };
}
