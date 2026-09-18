"use client";

import { GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";

type SortableListProps<Item> = {
  readonly items: readonly Item[];
  readonly itemId: (item: Item) => string;
  readonly itemLabel: (item: Item) => string;
  readonly busy: boolean;
  readonly onReorder: (items: readonly Item[]) => void;
  readonly renderItem: (item: Item, handle: ReactNode) => ReactNode;
};

/**
 * A small dependency-free sortable list for the admin panel. The visible grip
 * is the only drag source, which keeps selecting text and using form controls
 * inside a card from accidentally moving it. Arrow keys provide the same
 * ordering control without requiring a pointer.
 */
export function AdminSortableList<Item>({
  items,
  itemId,
  itemLabel,
  busy,
  onReorder,
  renderItem,
}: SortableListProps<Item>): React.JSX.Element {
  const [ordered, setOrdered] = useState<readonly Item[]>(items);
  const [prevItems, setPrevItems] = useState<readonly Item[]>(items);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  if (items !== prevItems) {
    setPrevItems(items);
    setOrdered(items);
  }

  function commit(fromId: string, toId: string): void {
    const from = ordered.findIndex((item) => itemId(item) === fromId);
    const to = ordered.findIndex((item) => itemId(item) === toId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    setOrdered(next);
    onReorder(next);
  }

  function moveByKeyboard(id: string, direction: -1 | 1): void {
    const from = ordered.findIndex((item) => itemId(item) === id);
    const to = from + direction;
    const target = ordered[to];
    if (from < 0 || target === undefined) return;
    commit(id, itemId(target));
  }

  return (
    <div className="flex flex-col gap-3" role="list">
      {ordered.map((item) => {
        const id = itemId(item);
        const label = itemLabel(item);
        const handle = (
          <span
            aria-label={`Reorder ${label}. Use the up and down arrow keys, or drag.`}
            className="border-border bg-bg text-text-muted hover:border-accent hover:text-text focus-visible:ring-accent inline-flex size-10 shrink-0 cursor-grab items-center justify-center border focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing disabled:pointer-events-none"
            draggable={!busy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setTargetId(null);
            }}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", id);
              setDraggedId(id);
            }}
            onKeyDown={(event) => {
              if (
                busy ||
                (event.key !== "ArrowUp" && event.key !== "ArrowDown")
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              moveByKeyboard(id, event.key === "ArrowUp" ? -1 : 1);
            }}
            role="button"
            tabIndex={busy ? -1 : 0}
            title="Drag to reorder"
          >
            <GripVertical aria-hidden="true" size={18} />
          </span>
        );
        return (
          <div
            className={`${targetId === id && draggedId !== id ? "outline-accent outline-2 outline-offset-2" : ""} ${draggedId === id ? "opacity-60" : ""}`}
            key={id}
            onDragEnter={(event) => {
              if (draggedId === null || draggedId === id) return;
              event.preventDefault();
              setTargetId(id);
            }}
            onDragOver={(event) => {
              if (draggedId === null || draggedId === id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromId =
                draggedId ?? event.dataTransfer.getData("text/plain");
              if (fromId.length > 0) commit(fromId, id);
              setDraggedId(null);
              setTargetId(null);
            }}
            role="listitem"
          >
            {renderItem(item, handle)}
          </div>
        );
      })}
    </div>
  );
}
