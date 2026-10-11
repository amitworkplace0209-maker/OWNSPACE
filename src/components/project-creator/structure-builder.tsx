"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "cn";
import {
  Plus, ChevronRight, ChevronDown, GripVertical,
  Edit2, Trash2, Copy, ArrowUp, ArrowDown,
  FolderOpen, FileText, BookOpen, Layers, Boxes,
  Target, Flag, Calendar, ClipboardList, MoreHorizontal,
} from "lucide-react";
import { IconPreview } from "./icon-picker";
import type { NodeType } from "@/types";

export interface ProjectNode {
  id: string;
  parentId: string | null;
  nodeType: NodeType;
  title: string;
  description?: string;
  status?: "planned" | "in_progress" | "completed" | "blocked" | "on_hold";
  priority?: "none" | "low" | "medium" | "high" | "urgent";
  startDate?: string;
  dueDate?: string;
  sortOrder: number;
  children: ProjectNode[];
  isNew?: boolean;
  isEditing?: boolean;
}

interface NodeTreeProps {
  nodes: ProjectNode[];
  onAddNode: (parentId: string | null, nodeType: NodeType) => void;
  onEditNode: (node: ProjectNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (node: ProjectNode) => void;
  onMoveNode: (nodeId: string, newParentId: string | null, newIndex: number) => void;
  onReorderNodes: (nodes: ProjectNode[]) => void;
  selectedNodeId?: string | null;
  onSelectNode: (nodeId: string | null) => void;
  className?: string;
}

const NODE_TYPE_CONFIG: Record<NodeType, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  phase: { label: "Phase", icon: FolderOpen, color: "text-indigo-500" },
  chapter: { label: "Chapter", icon: BookOpen, color: "text-violet-500" },
  lesson: { label: "Lesson", icon: FileText, color: "text-blue-500" },
  topic: { label: "Topic", icon: Layers, color: "text-cyan-500" },
  section: { label: "Section", icon: FileText, color: "text-teal-500" },
  collection: { label: "Collection", icon: Boxes, color: "text-emerald-500" },
  module: { label: "Module", icon: Layers, color: "text-teal-500" },
  milestone: { label: "Milestone", icon: Target, color: "text-amber-500" },
  custom: { label: "Custom", icon: MoreHorizontal, color: "text-rose-500" },
};

const ALLOWED_CHILD_TYPES: Record<NodeType, NodeType[]> = {
  phase: ["chapter", "lesson", "topic", "section", "collection", "milestone", "custom"],
  chapter: ["lesson", "topic", "section", "collection", "custom"],
  lesson: ["topic", "section", "custom"],
  topic: ["section", "custom"],
  section: ["topic", "custom"],
  collection: ["phase", "chapter", "lesson", "topic", "section", "collection", "milestone", "custom"],
  module: ["chapter", "lesson", "topic", "section", "custom"],
  milestone: ["custom"],
  custom: ["phase", "chapter", "lesson", "topic", "section", "collection", "module", "milestone", "custom"],
};

interface TreeNodeProps {
  node: ProjectNode;
  depth: number;
  props: NodeTreeProps;
  isDragging?: boolean;
}

function TreeNode({ node, depth, props, isDragging = false }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const config = NODE_TYPE_CONFIG[node.nodeType];
  const allowedChildren = ALLOWED_CHILD_TYPES[node.nodeType] ?? [];
  const hasChildren = node.children.length > 0;
  const isSelected = props.selectedNodeId === node.id;

  const handleAddChild = (type: NodeType) => {
    props.onAddNode(node.id, type);
    setShowMenu(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ nodeId: node.id, parentId: node.parentId }));
    e.dataTransfer.effectAllowed = "move";
    nodeRef.current?.classList.add("opacity-50");
  };

  const handleDragEnd = () => {
    nodeRef.current?.classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    nodeRef.current?.classList.add("bg-accent/50");
  };

  const handleDragLeave = () => {
    nodeRef.current?.classList.remove("bg-accent/50");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    nodeRef.current?.classList.remove("bg-accent/50");

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.nodeId && data.nodeId !== node.id) {
        props.onMoveNode(data.nodeId, node.id, node.children.length);
      }
    } catch {
      // Ignore invalid drag data
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (hasChildren) setIsExpanded(!isExpanded);
    }
    if (e.key === "ArrowRight" && hasChildren && !isExpanded) {
      setIsExpanded(true);
    }
    if (e.key === "ArrowLeft" && hasChildren && isExpanded) {
      setIsExpanded(false);
    }
  };

  return (
    <div ref={nodeRef} className={cn("select-none", isDragging && "opacity-50")}>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "bg-accent",
          node.isNew && "bg-green-500/10 border-l-2 border-green-500",
          node.isEditing && "bg-primary/10 border-l-2 border-primary"
        )}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        draggable={!node.isEditing}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-level={depth + 1}
        onClick={() => props.onSelectNode(node.id)}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        )}

        {!hasChildren && <span className="size-5 shrink-0" />}

        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded",
            config.color,
            isSelected && "bg-primary/20"
          )}
        >
          <config.icon className="size-3.5" aria-hidden="true" />
        </div>

        <span className={cn("flex-1 min-w-0 truncate font-medium", node.isEditing && "text-primary")}>
          {node.title}
        </span>

        {node.status && (
          <span className={cn(
            "px-1.5 py-0.5 text-[10px] font-medium rounded",
            node.status === "completed" && "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
            node.status === "in_progress" && "bg-blue-500/20 text-blue-600 dark:text-blue-400",
            node.status === "blocked" && "bg-red-500/20 text-red-600 dark:text-red-400",
            node.status === "on_hold" && "bg-amber-500/20 text-amber-600 dark:text-amber-400",
            node.status === "planned" && "bg-muted text-muted-foreground"
          )}>
            {node.status.replace("_", " ")}
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); props.onEditNode(node); }}
            className="p-1 rounded hover:bg-accent"
            aria-label="Edit"
          >
            <Edit2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); props.onDuplicateNode(node); }}
            className="p-1 rounded hover:bg-accent"
            aria-label="Duplicate"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
            className="p-1 rounded hover:bg-accent"
            aria-label="More options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); props.onDeleteNode(node.id); }}
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {showMenu && (
        <div className="absolute z-10 mt-1 min-w-[160px] rounded-md border bg-popover p-1 shadow-lg" role="menu">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Add child</div>
          {allowedChildren.map((type) => {
            const childConfig = NODE_TYPE_CONFIG[type];
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                onClick={() => handleAddChild(type)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent"
              >
                <childConfig.icon className={cn("size-4", childConfig.color)} />
                <span>Add {childConfig.label}</span>
              </button>
            );
          })}
          <hr className="my-1 border-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { props.onEditNode(node); setShowMenu(false); }}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent"
          >
            <Edit2 className="size-4" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { props.onDuplicateNode(node); setShowMenu(false); }}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent"
          >
            <Copy className="size-4" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { props.onDeleteNode(node.id); setShowMenu(false); }}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-destructive rounded hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {isExpanded && hasChildren && (
        <div className="ml-4 border-l border-border/50 pl-2" role="group" aria-label={`${node.title} children`}>
          {node.children.map((child, index) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} props={props} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeTree({
  nodes,
  onAddNode,
  onEditNode,
  onDeleteNode,
  onDuplicateNode,
  onMoveNode,
  onReorderNodes,
  selectedNodeId,
  onSelectNode,
  className,
}: NodeTreeProps) {
  return (
    <div className={cn("space-y-0.5", className)} role="tree" aria-label="Project structure">
      {nodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Layers className="size-12 mb-3 opacity-30" />
          <p className="text-sm">No structure yet</p>
          <p className="text-xs">Add phases, chapters, or custom sections to build your project</p>
        </div>
      ) : (
        nodes.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} props={{
            nodes,
            onAddNode,
            onEditNode,
            onDeleteNode,
            onDuplicateNode,
            onMoveNode,
            onReorderNodes,
            selectedNodeId,
            onSelectNode,
          }} />
        ))
      )}
    </div>
  );
}

export function StructureBuilderToolbar({
  onAddRootNode,
  className,
}: {
  onAddRootNode: (type: NodeType) => void;
  className?: string;
}) {
  const rootTypes: NodeType[] = ["phase", "chapter", "collection", "module", "custom"];

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {rootTypes.map((type) => {
        const config = NODE_TYPE_CONFIG[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => onAddRootNode(type)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
              "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label={`Add ${config.label}`}
          >
            <config.icon className={cn("size-4", config.color)} />
            <span>Add {config.label}</span>
          </button>
        );
      })}
    </div>
  );
}