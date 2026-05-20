import { describe, it, expect } from "vitest";
import {
  buildExternalActor,
  buildExternalActorFromGithubIssue,
  buildExternalActorFromGithubComment,
} from "../../src/services/issues/external_actor_builder.js";
import type { GitHubIssue, GitHubComment } from "../../src/services/issues/types.js";

describe("buildExternalActorFromGithubIssue", () => {
  it("builds actor from issue with user", () => {
    const issue: GitHubIssue = {
      number: 1,
      title: "Test",
      body: "Body",
      state: "open",
      labels: [],
      html_url: "https://github.com/owner/repo/issues/1",
      user: { login: "alice", id: 42, type: "User" },
      created_at: "2026-01-01T00:00:00Z",
      closed_at: null,
      updated_at: "2026-01-01T00:00:00Z",
    };

    const actor = buildExternalActorFromGithubIssue(issue, { repository: "owner/repo" });
    expect(actor).not.toBeNull();
    expect(actor!.login).toBe("alice");
    expect(actor!.id).toBe(42);
    expect(actor!.type).toBe("User");
    expect(actor!.verified_via).toBe("claim");
    expect(actor!.repository).toBe("owner/repo");
    expect(actor!.event_id).toBe(1);
  });

  it("returns null when user is null", () => {
    const issue: GitHubIssue = {
      number: 1,
      title: "Test",
      body: null,
      state: "open",
      labels: [],
      html_url: "",
      user: null,
      created_at: "",
      closed_at: null,
      updated_at: "",
    };
    expect(buildExternalActorFromGithubIssue(issue)).toBeNull();
  });

  it("defaults id to 0 when not present", () => {
    const issue: GitHubIssue = {
      number: 5,
      title: "T",
      body: "",
      state: "open",
      labels: [],
      html_url: "",
      user: { login: "bob" },
      created_at: "",
      closed_at: null,
      updated_at: "",
    };
    const actor = buildExternalActorFromGithubIssue(issue);
    expect(actor!.id).toBe(0);
  });
});

describe("buildExternalActorFromGithubComment", () => {
  it("builds actor from comment with user", () => {
    const comment: GitHubComment = {
      id: 999,
      body: "Hello",
      user: { login: "commenter", id: 77, type: "Bot" },
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      html_url: "",
    };
    const issue: GitHubIssue = {
      number: 3,
      title: "T",
      body: "",
      state: "open",
      labels: [],
      html_url: "",
      user: { login: "owner" },
      created_at: "",
      closed_at: null,
      updated_at: "",
    };

    const actor = buildExternalActorFromGithubComment(comment, issue, { repository: "o/r" });
    expect(actor!.login).toBe("commenter");
    expect(actor!.id).toBe(77);
    expect(actor!.type).toBe("Bot");
    expect(actor!.comment_id).toBe(999);
    expect(actor!.event_id).toBe(3);
  });
});

describe("buildExternalActor", () => {
  it("builds with all parameters", () => {
    const actor = buildExternalActor({
      login: "test",
      id: 100,
      type: "Organization",
      verified_via: "webhook_signature",
      delivery_id: "del-1",
      event_type: "issues",
      repository: "foo/bar",
      event_id: 10,
      comment_id: 20,
    });
    expect(actor.provider).toBe("github");
    expect(actor.login).toBe("test");
    expect(actor.id).toBe(100);
    expect(actor.type).toBe("Organization");
    expect(actor.verified_via).toBe("webhook_signature");
    expect(actor.delivery_id).toBe("del-1");
    expect(actor.event_type).toBe("issues");
    expect(actor.repository).toBe("foo/bar");
    expect(actor.event_id).toBe(10);
    expect(actor.comment_id).toBe(20);
  });
});
