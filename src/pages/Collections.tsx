import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, GripVertical, Gamepad2, Folder, Star, Trophy, BookOpen, Flame, Clock, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  reorderCollections,
  Collection,
  NewCollection,
  CollectionPatch,
} from "../api/client";

// ─── Icon & colour palettes ───────────────────────────────────────────────────

export const COLLECTION_ICONS: { key: string; component: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "folder",    component: Folder },
  { key: "gamepad-2", component: Gamepad2 },
  { key: "star",      component: Star },
  { key: "trophy",    component: Trophy },
  { key: "book-open", component: BookOpen },
  { key: "flame",     component: Flame },
  { key: "clock",     component: Clock },
];

export const COLLECTION_COLORS = [
  "#6c7086", // muted grey
  "#cba6f7", // mauve / accent
  "#89b4fa", // blue
  "#94e2d5", // teal
  "#a6e3a1", // green
  "#f9e2af", // yellow
  "#fab387", // peach / orange
  "#f38ba8", // red / pink
];

/** Render the correct icon component for a given key. */
export function CollectionIcon({
  iconKey,
  size = 16,
  className,
  style,
}: {
  iconKey: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const match = COLLECTION_ICONS.find((i) => i.key === iconKey);
  const Icon = match?.component ?? Folder;
  return <Icon size={size} className={className} style={style} />;
}

// ─── Inline form (create / edit) ──────────────────────────────────────────────

interface CollectionFormProps {
  initial?: Partial<NewCollection>;
  onSave: (data: NewCollection) => void;
  onCancel: () => void;
  saving?: boolean;
}

function CollectionForm({ initial, onSave, onCancel, saving }: CollectionFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? COLLECTION_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? "folder");

  return (
    <div className="bg-[var(--gt-surface)] border border-[var(--gt-overlay)] rounded-xl p-5 space-y-4">
      {/* Name */}
      <div>
        <label className="text-xs text-[var(--gt-sub)] mb-1 block">Name *</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Currently Playing"
          className="w-full bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-md px-3 py-2 text-sm text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-[var(--gt-sub)] mb-1 block">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description…"
          className="w-full bg-[var(--gt-base)] border border-[var(--gt-overlay)] rounded-md px-3 py-2 text-sm text-[var(--gt-text)] placeholder-[var(--gt-muted)] focus:outline-none focus:border-[var(--gt-accent)]"
        />
      </div>

      {/* Icon picker */}
      <div>
        <label className="text-xs text-[var(--gt-sub)] mb-2 block">Icon</label>
        <div className="flex gap-2 flex-wrap">
          {COLLECTION_ICONS.map(({ key, component: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setIcon(key)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${
                icon === key
                  ? "border-[var(--gt-accent)] bg-[var(--gt-accent)]/10 text-[var(--gt-accent)]"
                  : "border-[var(--gt-overlay)] text-[var(--gt-sub)] hover:text-[var(--gt-text)] hover:border-[var(--gt-hover)]"
              }`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Colour picker */}
      <div>
        <label className="text-xs text-[var(--gt-sub)] mb-2 block">Colour</label>
        <div className="flex gap-2 flex-wrap">
          {COLLECTION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{ background: c }}
              className={`w-7 h-7 rounded-full border-2 transition-transform ${
                color === c ? "border-white scale-110" : "border-transparent hover:scale-105"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined, color, icon })}
          disabled={!name.trim() || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-[var(--gt-accent)] text-[var(--gt-base)] text-sm font-medium hover:bg-[var(--gt-accent-dim)] disabled:opacity-50 transition-colors"
        >
          <Check size={13} />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-[var(--gt-overlay)] text-sm text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Collections() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: getCollections,
  });

  const createMutation = useMutation({
    mutationFn: (payload: NewCollection) => createCollection(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setShowCreate(false);
      toast.success("Collection created");
    },
    onError: () => toast.error("Failed to create collection"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CollectionPatch }) =>
      updateCollection(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setEditingId(null);
      toast.success("Collection updated");
    },
    onError: () => toast.error("Failed to update collection"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      setConfirmDeleteId(null);
      toast.success("Collection deleted");
    },
    onError: () => toast.error("Failed to delete collection"),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderCollections(ids),
    onSuccess: (updated) => {
      queryClient.setQueryData(["collections"], updated);
    },
  });

  // ── drag-and-drop reorder ──────────────────────────────────────────────────

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = collections.map((c) => c.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderMutation.mutate(arrayMove(ids, oldIndex, newIndex));
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--gt-overlay)] flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-[var(--gt-text)]">Collections</h1>
          <p className="text-xs text-[var(--gt-muted)] mt-0.5">
            Organise your library into named shelves with custom ordering
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--gt-accent)]/10 border border-[var(--gt-accent)]/30 text-[var(--gt-accent)] text-sm hover:bg-[var(--gt-accent)]/20 transition-colors"
        >
          <Plus size={14} />
          New Collection
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-3">
        {/* Create form */}
        {showCreate && (
          <CollectionForm
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setShowCreate(false)}
            saving={createMutation.isPending}
          />
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[var(--gt-muted)] text-sm">
            Loading…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && collections.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-[var(--gt-muted)]">
            <Folder size={36} className="opacity-30" />
            <p className="text-sm">No collections yet.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-[var(--gt-accent)] text-sm hover:underline"
            >
              Create your first collection
            </button>
          </div>
        )}

        {/* Collection cards */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={collections.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {collections.map((col) => (
              <SortableCollectionRow
                key={col.id}
                col={col}
                editingId={editingId === col.id}
                onOpen={() => navigate(`/collections/${col.id}`)}
                onEdit={() => { setEditingId(col.id); setShowCreate(false); }}
                onSaveEdit={(data) => updateMutation.mutate({ id: col.id, patch: data })}
                onCancelEdit={() => setEditingId(null)}
                saving={updateMutation.isPending}
                onDelete={() => setConfirmDeleteId(col.id)}
                confirmingDelete={confirmDeleteId === col.id}
                onConfirmDelete={() => deleteMutation.mutate(col.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                deleting={deleteMutation.isPending && confirmDeleteId === col.id}
              />
            ))}
          </SortableContext>
        </DndContext>

        {collections.length > 1 && (
          <p className="text-xs text-[var(--gt-muted)] text-center pt-1">
            Drag cards to reorder collections
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Sortable row wrapper ─────────────────────────────────────────────────────

interface SortableCollectionRowProps {
  col: Collection;
  editingId: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onSaveEdit: (data: NewCollection) => void;
  onCancelEdit: () => void;
  saving: boolean;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleting: boolean;
}

function SortableCollectionRow({
  col, editingId, onOpen, onEdit, onSaveEdit, onCancelEdit, saving,
  onDelete, confirmingDelete, onConfirmDelete, onCancelDelete, deleting,
}: SortableCollectionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50" : ""}
    >
      {editingId ? (
        <CollectionForm
          initial={{ name: col.name, description: col.description, color: col.color, icon: col.icon }}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          saving={saving}
        />
      ) : (
        <CollectionCard
          collection={col}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
          confirmingDelete={confirmingDelete}
          onConfirmDelete={onConfirmDelete}
          onCancelDelete={onCancelDelete}
          deleting={deleting}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      )}
    </div>
  );
}

// ─── Collection card ──────────────────────────────────────────────────────────

interface CollectionCardProps {
  collection: Collection;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleting: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function CollectionCard({
  collection: col,
  onOpen,
  onEdit,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  deleting,
  dragHandleProps,
}: CollectionCardProps) {
  return (
    <div className="group flex items-center gap-4 p-4 rounded-xl bg-[var(--gt-surface)] border border-[var(--gt-overlay)] hover:border-[var(--gt-hover)] transition-colors cursor-pointer select-none">
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical
          size={16}
          className="text-[var(--gt-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {/* Colour swatch + icon */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: col.color + "33" /* 20% alpha */ }}
        onClick={onOpen}
      >
        <CollectionIcon iconKey={col.icon} size={18} style={{ color: col.color } as React.CSSProperties} />
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0" onClick={onOpen}>
        <p className="text-sm font-medium text-[var(--gt-text)] truncate">{col.name}</p>
        {col.description && (
          <p className="text-xs text-[var(--gt-muted)] truncate mt-0.5">{col.description}</p>
        )}
      </div>

      {/* Game count badge */}
      <span
        className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
        style={{ background: col.color + "22", color: col.color }}
        onClick={onOpen}
      >
        {col.gameCount} {col.gameCount === 1 ? "game" : "games"}
      </span>

      {/* Actions */}
      {confirmingDelete ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[var(--gt-red)]">Delete?</span>
          <button
            onClick={onConfirmDelete}
            disabled={deleting}
            className="px-2 py-1 rounded bg-[var(--gt-red)] text-white text-xs hover:bg-[var(--gt-red)]/80 disabled:opacity-50 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={onCancelDelete}
            className="px-2 py-1 rounded border border-[var(--gt-overlay)] text-xs text-[var(--gt-sub)] hover:text-[var(--gt-text)] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-text)] hover:bg-[var(--gt-overlay)] transition-colors"
            title="Edit collection"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-md text-[var(--gt-muted)] hover:text-[var(--gt-red)] hover:bg-[var(--gt-red)]/10 transition-colors"
            title="Delete collection"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
