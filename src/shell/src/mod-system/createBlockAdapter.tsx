import type { ComponentType } from "react";
import type { BlockComponentProps } from "./types";

export function createBlockAdapter<InnerProps extends Record<string, unknown>>(
  Inner: ComponentType<InnerProps>,
  extract: (props: BlockComponentProps) => InnerProps,
): ComponentType<BlockComponentProps> {
  const Adapter = (props: BlockComponentProps) => <Inner {...extract(props)} />;
  Adapter.displayName = `BlockAdapter(${Inner.displayName ?? Inner.name ?? "Component"})`;
  return Adapter;
}
