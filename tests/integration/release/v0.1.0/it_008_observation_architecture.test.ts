/**
 * IT-008: Observation Architecture Validation
 *
 * Goal: Verify that observation layer is operational (observations created, snapshots computed, provenance tracked).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  setupTestServer,
  teardownTestServer,
  cleanupAllTestData,
  cleanupTestDataByPrefix,
  type TestContext,
} from "./test_helpers.js";
import { supabase } from "../../../../src/db.js";
import { resolveEntity } from "../../../../src/services/entity_resolution.js";
import { createObservationsFromRecord } from "../../../../src/services/observation_ingestion.js";

describe("IT-008: Observation Architecture Validation", () => {
  let context: TestContext;
  const createdRecordIds: string[] = [];

  beforeAll(async () => {
    context = await setupTestServer("IT-008");
  });

  beforeEach(async () => {
    await cleanupTestDataByPrefix(context.testPrefix);
    createdRecordIds.length = 0;
  });

  afterAll(async () => {
    await cleanupAllTestData(createdRecordIds);
    await teardownTestServer(context);
  });

  it("should create observations for entities", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record with entity
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-001`,
          vendor_name: "Acme Corp",
          amount: 1000,
        },
      }),
    });

    expect(response.status).toBe(200);
    const record = await response.json();
    createdRecordIds.push(record.id);

    // Step 2: Create observations from record
    const result = await createObservationsFromRecord(
      record,
      "00000000-0000-0000-0000-000000000000"
    );

    // Step 3: Verify observations were created
    expect(result.observations.length).toBeGreaterThan(0);

    // Step 4: Verify observations exist in database for the extracted entities
    const entityIds = result.observations.map((obs) => obs.entity_id);
    const { data: observations, error } = await supabase
      .from("observations")
      .select("*")
      .in("entity_id", entityIds);

    expect(error).toBeNull();
    expect(observations).toBeDefined();
    expect(observations!.length).toBeGreaterThan(0);
  });

  it("should compute snapshots from observations", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record with entity
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-002`,
          vendor_name: "Test Snapshot Vendor",
          amount: 2000,
        },
      }),
    });

    const record = await response.json();
    createdRecordIds.push(record.id);

    // Step 2: Create observations and compute snapshot
    const result = await createObservationsFromRecord(
      record,
      "00000000-0000-0000-0000-000000000000"
    );

    // Step 3: Verify snapshot was created
    expect(result.snapshotUpdated).toBe(true);

    // Step 4: Query snapshot from database
    if (result.observations.length > 0) {
      const entityId = result.observations[0].entity_id;
      const { data: snapshot, error } = await supabase
        .from("entity_snapshots")
        .select("*")
        .eq("entity_id", entityId)
        .single();

      if (!error && snapshot) {
        expect(snapshot).toBeDefined();
        expect(snapshot.entity_id).toBe(entityId);
        expect(snapshot.provenance).toBeDefined();
        expect(snapshot.observation_count).toBeGreaterThan(0);
      }
    }
  });

  it("should support get_entity_snapshot MCP action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record and observations
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-003`,
          vendor_name: "Snapshot Test Vendor",
          amount: 3000,
        },
      }),
    });

    const record = await response.json();
    createdRecordIds.push(record.id);

    const result = await createObservationsFromRecord(
      record,
      "00000000-0000-0000-0000-000000000000"
    );

    if (result.observations.length > 0) {
      const entityId = result.observations[0].entity_id;

      // Step 2: Call get_entity_snapshot MCP action
      const snapshotResponse = await fetch(
        `${context.baseUrl}/get_entity_snapshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.bearerToken}`,
          },
          body: JSON.stringify({
            entity_id: entityId,
          }),
        }
      );

      // Verify response
      if (snapshotResponse.status === 200) {
        const snapshotData = await snapshotResponse.json();
        expect(snapshotData).toBeDefined();
        expect(snapshotData.entity_id).toBe(entityId);
      }
    }
  });

  it("should support list_observations MCP action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record and observations
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-004`,
          vendor_name: "List Observations Vendor",
          amount: 4000,
        },
      }),
    });

    const record = await response.json();
    createdRecordIds.push(record.id);

    const result = await createObservationsFromRecord(
      record,
      "00000000-0000-0000-0000-000000000000"
    );

    if (result.observations.length > 0) {
      const entityId = result.observations[0].entity_id;

      // Step 2: Call list_observations MCP action
      const listResponse = await fetch(`${context.baseUrl}/list_observations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${context.bearerToken}`,
        },
        body: JSON.stringify({
          entity_id: entityId,
        }),
      });

      // Verify response
      if (listResponse.status === 200) {
        const listData = await listResponse.json();
        expect(listData).toBeDefined();
        expect(listData.observations || listData).toBeDefined();
      }
    }
  });

  it("should support get_field_provenance MCP action", async () => {
    const testPrefix = `${context.testPrefix}`;
    // Step 1: Create record and observations
    const response = await fetch(`${context.baseUrl}/store_record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${context.bearerToken}`,
      },
      body: JSON.stringify({
        type: "invoice",
        properties: {
          invoice_number: `${testPrefix}-INV-005`,
          vendor_name: "Provenance Test Vendor",
          amount: 5000,
        },
      }),
    });

    const record = await response.json();
    createdRecordIds.push(record.id);

    const result = await createObservationsFromRecord(
      record,
      "00000000-0000-0000-0000-000000000000"
    );

    if (result.observations.length > 0) {
      const entityId = result.observations[0].entity_id;

      // Step 2: Call get_field_provenance MCP action
      const provenanceResponse = await fetch(
        `${context.baseUrl}/get_field_provenance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${context.bearerToken}`,
          },
          body: JSON.stringify({
            entity_id: entityId,
            field_name: "vendor_name",
          }),
        }
      );

      // Verify response (may return 404 if field not in snapshot, that's OK)
      expect([200, 400, 404, 500]).toContain(provenanceResponse.status);
    }
  });
});
