import { createElement, type ReactElement } from "react";
import { NEOTOMA_LOGO_FILTER } from "./neotoma_logo_drafting.generated";

/**
 * Renders the drafting filter from the same description the static SVG is generated from
 * (scripts/derive_neotoma_logo_drafting.mjs), so the component and the file cannot drift.
 * No JSX, so a unit test can render it with react-dom/server.
 */
type FilterNode = {
  readonly tag: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly FilterNode[];
};

const camel = (name: string) => name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function renderNode(
  node: FilterNode,
  vars: Record<string, string | number>,
  key: number
): ReactElement {
  const props: Record<string, string | number> = { key };
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    props[camel(name)] = value.replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v]));
  }
  return createElement(
    node.tag,
    props,
    node.children?.map((c, i) => renderNode(c, vars, i))
  );
}

export function logoFilter(id: string, radius: number, tintOpacity: number): ReactElement {
  const attrs: Record<string, string> = { id };
  for (const [name, value] of Object.entries(NEOTOMA_LOGO_FILTER.attrs)) attrs[camel(name)] = value;
  return createElement(
    "filter",
    attrs,
    (NEOTOMA_LOGO_FILTER.primitives as readonly FilterNode[]).map((p, i) =>
      renderNode(p, { radius, ink: "currentColor", tint: tintOpacity }, i)
    )
  );
}
