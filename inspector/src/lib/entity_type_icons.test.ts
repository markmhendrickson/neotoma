import { describe, expect, it } from "vitest";
import { File, FileText } from "lucide-react";
import { getIconForEntityType } from "./entity_type_icons";

describe("entity_type_icons", () => {
  it("uses File for custom SVG schema icons", () => {
    const Icon = getIconForEntityType("novel_type", {
      icon: { icon_type: "svg", icon_name: "custom" },
    });
    expect(Icon).toBe(File);
  });

  it("prefers lucide schema icon over heuristics", () => {
    const Icon = getIconForEntityType("document", {
      icon: { icon_type: "lucide", icon_name: "FileText" },
    });
    expect(Icon).toBe(FileText);
  });
});
