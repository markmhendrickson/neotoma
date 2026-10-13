/**
 * Unit tests for the OBSERVATION_SOURCE_OMITTED helper (#2241).
 *
 * Pins the two rules the helper centralises for the REST, MCP and
 * conditional store paths:
 *  - omission is judged on the raw request value, so an explicit
 *    `"unspecified"` does not warn while an absent field does;
 *  - the message is a static template naming the stored default and the fix,
 *    carrying no request content.
 */

import { describe, expect, it } from "vitest";
import {
  OBSERVATION_SOURCE_OMITTED_CODE,
  OBSERVATION_SOURCE_OMITTED_MESSAGE,
  buildObservationSourceOmittedWarning,
  wasObservationSourceOmitted,
} from "../../src/services/observation_source_warning.js";
import { DEFAULT_OBSERVATION_SOURCE } from "../../src/services/observation_storage.js";
import { OBSERVATION_SOURCE_VALUES } from "../../src/shared/action_schemas.js";

const FIRST = { observation_index: 0, entity_type: "note", entity_id: "ent_abc" };

describe("DEFAULT_OBSERVATION_SOURCE (#2241)", () => {
  it("is the unspecified sentinel, not llm_summary", () => {
    expect(DEFAULT_OBSERVATION_SOURCE).toBe("unspecified");
  });
});

describe("wasObservationSourceOmitted", () => {
  it("is true only when no value was supplied", () => {
    expect(wasObservationSourceOmitted(undefined)).toBe(true);
    expect(wasObservationSourceOmitted(null)).toBe(true);
  });

  it.each([...OBSERVATION_SOURCE_VALUES])("is false for explicit %s", (value) => {
    expect(wasObservationSourceOmitted(value)).toBe(false);
  });
});

describe("buildObservationSourceOmittedWarning", () => {
  it("builds one store_warnings entry naming the first stored entity", () => {
    const warning = buildObservationSourceOmittedWarning({
      rawObservationSource: undefined,
      firstStored: FIRST,
    });
    expect(warning).toEqual({
      code: OBSERVATION_SOURCE_OMITTED_CODE,
      message: OBSERVATION_SOURCE_OMITTED_MESSAGE,
      ...FIRST,
    });
    expect(warning!.code).toBe("OBSERVATION_SOURCE_OMITTED");
  });

  it("does not warn when the caller sent unspecified explicitly", () => {
    expect(
      buildObservationSourceOmittedWarning({ rawObservationSource: "unspecified", firstStored: FIRST })
    ).toBeNull();
  });

  it("does not warn for an explicit llm_summary", () => {
    expect(
      buildObservationSourceOmittedWarning({ rawObservationSource: "llm_summary", firstStored: FIRST })
    ).toBeNull();
  });

  it("does not warn when nothing was stored", () => {
    expect(
      buildObservationSourceOmittedWarning({ rawObservationSource: undefined, firstStored: undefined })
    ).toBeNull();
  });

  it("message names the field, the stored default, and how to fix it", () => {
    expect(OBSERVATION_SOURCE_OMITTED_MESSAGE).toContain("observation_source");
    expect(OBSERVATION_SOURCE_OMITTED_MESSAGE).toContain('"unspecified"');
    expect(OBSERVATION_SOURCE_OMITTED_MESSAGE).toContain('"llm_summary"');
    expect(OBSERVATION_SOURCE_OMITTED_MESSAGE).toContain('"import"');
  });

  it("message is static: it carries nothing from the request", () => {
    const a = buildObservationSourceOmittedWarning({
      rawObservationSource: undefined,
      firstStored: { observation_index: 3, entity_type: "lab_reading", entity_id: "ent_secret_1" },
    });
    const b = buildObservationSourceOmittedWarning({
      rawObservationSource: undefined,
      firstStored: FIRST,
    });
    expect(a!.message).toBe(b!.message);
    expect(a!.message).not.toContain("lab_reading");
    expect(a!.message).not.toContain("ent_secret_1");
  });
});
