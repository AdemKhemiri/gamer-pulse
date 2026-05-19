import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, GripVertical, Gamepad2, Folder, Star, Trophy,
  BookOpen, Flame, Clock, Check, X, Search, Sparkles,
} from "lucide-react";
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
  rectSortingStrategy,
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
  "#6c7086",
  "#cba6f7",
  "#89b4fa",
  "#94e2d5",
  "#a6e3a1",
  "#f9e2af",
  "#fab387",
  "#f38ba8",
];

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

// ─── Predefined templates ─────────────────────────────────────────────────────

const PREDEFINED_TEMPLATES: NewCollection[] = [
  { name: "Currently Playing",  description: "Games you're actively playing right now", icon: "gamepad-2", color: "#89b4fa" },
  { name: "Favorites",          description: "Your all-time favorites",                  icon: "star",      color: "#f9e2af" },
  { name: "Backlog",            description: "Games you plan to play someday",           icon: "clock",     color: "#cba6f7" },
  { name: "Completed",          description: "Games you've finished",                    icon: "trophy",    color: "#a6e3a1" },
  { name: "Multiplayer",        description: "Games to play with friends",               icon: "gamepad-2", color: "#94e2d5" },
  { name: "Hidden Gems",        description: "Underrated games worth your time",         icon: "flame",     color: "#fab387" },
];

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortKey = "position" | "name-asc" | "name-desc" | "most-games" | "fewest-games";

const SORT_LABELS: Record<SortKey, string> = {
  position:       "Custom order",
  "name-asc":     "Name A → Z",
  "name-desc":    "Name Z → A",
  "most-games":   "Most games",
  "fewest-games": "Fewest games",
};

// ─── FilterSelect (matches Library.tsx pattern) ───────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative" onBlur={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-white/60 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        {selected.label}
        <svg
          width="9" height="9" viewBox="0 0 10 10" fill="none"
          className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 right-0 z-[200] rounded-xl py-1 min-w-[140px]"
          style={{ background: "rgb(18,18,24)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onMouseDown={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                opt.value === value ? "text-white font-medium" : "text-white/50 hover:text-white"
              }`}
              style={opt.value === value ? { background: "rgba(255,255,255,0.08)" } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Templates modal ──────────────────────────────────────────────────────────

function TemplatesModal({
  existingNames, onClose, onCreate, creating,
}: {
  existingNames: Set<string>;
  onClose: () => void;
  onCreate: (t: NewCollection) => void;
  creating: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-ps5-up"
        style={{ background: "rgba(10,10,20,0.96)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <Sparkles size={14} className="text-white/50" />
              <p className="text-xs text-white/40 uppercase tracking-[0.15em]">Collections</p>
            </div>
            <h2 className="text-lg font-bold text-white">Quick Start Templates</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/30 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Template grid — mirrors collection tiles */}
        <div className="p-5 grid grid-cols-3 gap-3">
          {PREDEFINED_TEMPLATES.map((t) => {
            const exists = existingNames.has(t.name!.toLowerCase());
            return (
              <button
                key={t.name}
                onClick={() => !exists && !creating && onCreate(t)}
                disabled={exists || creating}
                className="relative flex flex-col rounded-2xl overflow-hidden text-left transition-all cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, ${t.color}15 0%, rgba(255,255,255,0.02) 100%)`,
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: exists ? 0.45 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!exists) e.currentTarget.style.borderColor = `${t.color}55`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                }}
              >
                {/* Thin color strip — same as CollectionTile */}
                <div className="h-0.5 w-full flex-shrink-0" style={{ background: t.color }} />

                <div className="p-4 flex flex-col gap-3">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: t.color + "25" }}
                  >
                    <CollectionIcon iconKey={t.icon!} size={19} style={{ color: t.color }} />
                  </div>

                  {/* Text */}
                  <div>
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-xs text-white/35 mt-1 leading-relaxed line-clamp-2">{t.description}</p>
                  </div>

                  {/* Footer */}
                  <div className="pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {exists ? (
                      <span className="flex items-center gap-1.5 text-xs text-white/35">
                        <Check size={11} />
                        Already created
                      </span>
                    ) : (
                      <span className="text-xs font-medium" style={{ color: t.color }}>
                        + Add to library
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="text-xs text-white/25">
            Click any template to create it instantly. Already-created ones are dimmed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  collection, onSave, onClose, saving,
}: {
  collection: Collection;
  onSave: (data: CollectionPatch) => void;
  onClose: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-ps5-up"
        style={{ background: "rgba(10,10,20,0.95)", border: "1px solid rgba(255,255,255,0.10)" }}
      >
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="text-sm font-semibold text-white">Edit Collection</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-6">
          <CollectionForm
            initial={{ name: collection.name, description: collection.description, color: collection.color, icon: collection.icon }}
            onSave={onSave}
            onCancel={onClose}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Collection form ──────────────────────────────────────────────────────────

function CollectionForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<NewCollection>;
  onSave: (data: NewCollection) => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  const [name, setName]               = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor]             = useState(initial?.color ?? COLLECTION_COLORS[1]);
  const [icon, setIcon]               = useState(initial?.icon ?? "folder");

  return (
    <div className="space-y-4">
      {/* Live preview */}
      <div
        className="flex items-center gap-3 p-3.5 rounded-xl"
        style={{ background: `linear-gradient(135deg, ${color}18 0%, rgba(255,255,255,0.02) 100%)`, border: `1px solid ${color}30` }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "30" }}>
          <CollectionIcon iconKey={icon} size={16} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {name.trim() || <span className="text-white/25 font-normal italic">Collection name</span>}
          </p>
          {description && <p className="text-xs text-white/40 truncate">{description}</p>}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs text-white/40 uppercase tracking-wider mb-1.5 block">Name *</label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Currently Playing"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          onFocus={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-white/40 uppercase tracking-wider mb-1.5 block">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A short description…"
          className="w-full rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none transition-colors"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          onFocus={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
        />
      </div>

      {/* Icon + Colour */}
      <div className="flex gap-8">
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider mb-2 block">Icon</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLLECTION_ICONS.map(({ key, component: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  background: icon === key ? color + "30" : "rgba(255,255,255,0.05)",
                  border: icon === key ? `1px solid ${color}60` : "1px solid rgba(255,255,255,0.08)",
                  color: icon === key ? color : "rgba(255,255,255,0.40)",
                }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider mb-2 block">Colour</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLLECTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ background: c }}
                className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                  color === c ? "border-white scale-110" : "border-transparent hover:scale-105"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined, color, icon })}
          disabled={!name.trim() || saving}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity cursor-pointer"
          style={{ background: color, color: "#000" }}
        >
          <Check size={13} />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2 rounded-xl text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Collection tile ──────────────────────────────────────────────────────────

function CollectionTile({
  collection: col,
  onOpen, onEdit, onDelete,
  confirmingDelete, onConfirmDelete, onCancelDelete, deleting,
  dragHandleProps,
}: {
  collection: Collection;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleting: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  return (
    <div
      className="group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all animate-ps5-up"
      style={{
        background: `linear-gradient(135deg, ${col.color}18 0%, rgba(255,255,255,0.02) 100%)`,
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      onClick={onOpen}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${col.color}50`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
    >
      {/* Thin color accent line */}
      <div className="h-0.5 w-full flex-shrink-0" style={{ background: col.color }} />

      {/* Card body */}
      <div className="p-4 flex flex-col flex-1">
        {/* Top row: icon + drag + actions */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: col.color + "25" }}
          >
            <CollectionIcon iconKey={col.icon} size={20} style={{ color: col.color }} />
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {/* Drag handle */}
            <div
              {...(dragHandleProps as React.HTMLAttributes<HTMLDivElement>)}
              className="p-1.5 rounded-lg text-white/25 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical size={13} />
            </div>

            {/* Edit / Delete */}
            {confirmingDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onConfirmDelete}
                  disabled={deleting}
                  className="px-2 py-1 rounded-lg text-xs text-white font-medium disabled:opacity-50 transition-opacity cursor-pointer"
                  style={{ background: "rgba(243,139,168,0.30)", border: "1px solid rgba(243,139,168,0.40)" }}
                >
                  Delete
                </button>
                <button
                  onClick={onCancelDelete}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <X size={11} />
                </button>
              </div>
            ) : (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={onDelete}
                  className="p-1.5 rounded-lg text-white/35 hover:text-red-400 transition-colors cursor-pointer"
                  style={{}}
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Name & description */}
        <p className="text-sm font-semibold text-white truncate">{col.name}</p>
        {col.description ? (
          <p className="text-xs text-white/40 line-clamp-2 mt-1 leading-relaxed flex-1">{col.description}</p>
        ) : (
          <p className="text-xs text-white/20 italic mt-1 flex-1">No description</p>
        )}

        {/* Footer: game count */}
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xs font-medium" style={{ color: col.color }}>
            {col.gameCount} {col.gameCount === 1 ? "game" : "games"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable tile wrapper ─────────────────────────────────────────────────────

function SortableCollectionTile({
  col, onOpen, onEdit, onDelete,
  confirmingDelete, onConfirmDelete, onCancelDelete, deleting,
}: {
  col: Collection;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? "opacity-40 z-50" : ""}
    >
      <CollectionTile
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
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Collections() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate]           = useState(false);
  const [editingId, setEditingId]             = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [search, setSearch]                   = useState("");
  const [sortKey, setSortKey]                 = useState<SortKey>("position");
  const [showTemplates, setShowTemplates]     = useState(false);

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
      setShowTemplates(false);
      toast.success("Collection created");
    },
    onError: () => toast.error("Failed to create collection"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CollectionPatch }) => updateCollection(id, patch),
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = collections.map((c) => c.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderMutation.mutate(arrayMove(ids, oldIndex, newIndex));
  }

  const existingNames = useMemo(
    () => new Set(collections.map((c) => c.name.toLowerCase())),
    [collections],
  );

  const displayed = useMemo(() => {
    let list = [...collections];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q),
      );
    }
    switch (sortKey) {
      case "name-asc":     list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "name-desc":    list.sort((a, b) => b.name.localeCompare(a.name)); break;
      case "most-games":   list.sort((a, b) => b.gameCount - a.gameCount);    break;
      case "fewest-games": list.sort((a, b) => a.gameCount - b.gameCount);    break;
    }
    return list;
  }, [collections, search, sortKey]);

  const editingCollection = editingId ? collections.find((c) => c.id === editingId) : null;

  return (
    <div className="h-full overflow-auto">
      {/* PS5-style background */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 60% 0%, rgba(80,40,140,0.20) 0%, transparent 55%), " +
            "radial-gradient(ellipse at 0% 85%, rgba(20,50,120,0.12) 0%, transparent 50%), " +
            "#050505",
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-8 py-8 space-y-6">
        {/* ── Page header ── */}
        <div className="animate-ps5-fade">
          <p className="text-xs text-white/35 uppercase tracking-[0.15em] mb-1">Library</p>
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">Collections</h1>
              <p className="text-sm text-white/40 mt-1">
                {collections.length > 0
                  ? `${collections.length} ${collections.length === 1 ? "collection" : "collections"} · organise your library`
                  : "Organise your library into named shelves"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white transition-colors cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <Sparkles size={13} />
                Templates
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                style={{ background: "rgba(203,166,247,0.25)", border: "1px solid rgba(203,166,247,0.35)" }}
              >
                <Plus size={14} />
                New
              </button>
            </div>
          </div>
        </div>

        {/* ── Search + sort ── */}
        <div className="relative z-50 flex items-center gap-3 animate-ps5-fade">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search collections…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>
          <FilterSelect
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ value: k, label: SORT_LABELS[k] }))}
          />
        </div>

        {/* ── Create form ── */}
        {showCreate && (
          <div
            className="rounded-2xl overflow-hidden animate-ps5-up"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h2 className="text-xs text-white/40 uppercase tracking-[0.12em] font-semibold">New Collection</h2>
            </div>
            <div className="p-6">
              <CollectionForm
                onSave={(data) => createMutation.mutate(data)}
                onCancel={() => setShowCreate(false)}
                saving={createMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex items-center justify-center h-40 text-white/25 text-sm">
            Loading…
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && collections.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center py-24 gap-5 animate-ps5-fade">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <Folder size={26} className="text-white/20" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white/80">No collections yet</p>
              <p className="text-sm text-white/30 mt-1">Create one or start from a quick-start template</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm text-white/60 hover:text-white transition-colors cursor-pointer"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <Sparkles size={13} />
                Use templates
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
                style={{ background: "rgba(203,166,247,0.25)", border: "1px solid rgba(203,166,247,0.35)" }}
              >
                <Plus size={13} />
                New collection
              </button>
            </div>
          </div>
        )}

        {/* ── No search results ── */}
        {!isLoading && collections.length > 0 && displayed.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
            <Search size={24} className="opacity-30" />
            <p className="text-sm">No collections match "{search}"</p>
          </div>
        )}

        {/* ── Grid ── */}
        {displayed.length > 0 && (
          <>
            {sortKey === "position" ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={displayed.map((c) => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {displayed.map((col) => (
                      <SortableCollectionTile
                        key={col.id}
                        col={col}
                        onOpen={() => navigate(`/collections/${col.id}`)}
                        onEdit={() => setEditingId(col.id)}
                        onDelete={() => setConfirmDeleteId(col.id)}
                        confirmingDelete={confirmDeleteId === col.id}
                        onConfirmDelete={() => deleteMutation.mutate(col.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        deleting={deleteMutation.isPending && confirmDeleteId === col.id}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayed.map((col) => (
                  <CollectionTile
                    key={col.id}
                    collection={col}
                    onOpen={() => navigate(`/collections/${col.id}`)}
                    onEdit={() => setEditingId(col.id)}
                    onDelete={() => setConfirmDeleteId(col.id)}
                    confirmingDelete={confirmDeleteId === col.id}
                    onConfirmDelete={() => deleteMutation.mutate(col.id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                    deleting={deleteMutation.isPending && confirmDeleteId === col.id}
                  />
                ))}
              </div>
            )}

            {displayed.length > 1 && sortKey === "position" && (
              <p className="text-xs text-white/20 text-center pt-2">
                Drag tiles to reorder
              </p>
            )}
          </>
        )}

        <div className="h-4" />
      </div>

      {/* Modals */}
      {editingCollection && (
        <EditModal
          collection={editingCollection}
          onSave={(data) => updateMutation.mutate({ id: editingCollection.id, patch: data })}
          onClose={() => setEditingId(null)}
          saving={updateMutation.isPending}
        />
      )}
      {showTemplates && (
        <TemplatesModal
          existingNames={existingNames}
          onClose={() => setShowTemplates(false)}
          onCreate={(t) => createMutation.mutate(t)}
          creating={createMutation.isPending}
        />
      )}
    </div>
  );
}
