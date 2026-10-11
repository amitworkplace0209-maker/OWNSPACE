import { getProjectNodes } from "@/lib/dal/project-nodes";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { FolderTree } from "lucide-react";
import { NODE_TYPES, type NodeType } from "@/types";
import { cn } from "cn";

export const metadata = {
  title: "Structure",
};

const NODE_LABELS: Record<NodeType, string> = {
  phase: "Phase",
  chapter: "Chapter",
  lesson: "Lesson",
  topic: "Topic",
  section: "Section",
  collection: "Collection",
  module: "Module",
  milestone: "Milestone",
  custom: "Custom",
};

/** Depth-bounded indentation, so a deeply nested plan still fits the page. */
function indent(depth: number) {
  return Math.min(depth, 6);
}

type Node = Awaited<ReturnType<typeof getProjectNodes>>[number];

function buildTree(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, { ...node, children: [] as Node[] }]));
  const roots: Array<Node & { children: Node[] }> = [];

  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node as Node);
    else roots.push(node as Node & { children: Node[] });
  }

  const sort = (list: Node[]): Node[] => {
    list.sort((a, b) => a.sort_order - b.sort_order);
    for (const node of list) {
      const children = (node as Node & { children?: Node[] }).children;
      if (children) sort(children);
    }
    return list;
  };

  return sort(roots);
}

function NodeRow({ node, depth }: { node: Node & { children?: Node[] }; depth: number }) {
  const done = node.status === "completed";
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = node.due_date ?? "";
  const overdue = Boolean(dueDate) && dueDate < today;

  return (
    <li>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg border bg-card p-3",
          done && "opacity-70"
        )}
        style={{ marginLeft: `${indent(depth) * 1.25}rem` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
            {NODE_LABELS[node.node_type as NodeType] ?? node.node_type}
          </span>
          <span className="text-sm font-medium">{node.title}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {node.status.replace("_", " ")}
          </span>
          {dueDate ? (
            <span className={cn("text-xs", overdue ? "text-danger" : "text-muted-foreground")}>
              due {dueDate}
              {overdue ? " · overdue" : ""}
            </span>
          ) : null}
        </div>

        {node.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{node.description}</p>
        ) : null}

        {node.progress > 0 ? (
          <div className="flex items-center gap-2">
            <Progress value={node.progress} className="h-1.5" />
            <span className="shrink-0 text-xs tabular-nums">{node.progress}%</span>
          </div>
        ) : null}
      </div>

      {node.children && node.children.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2">
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default async function ProjectStructurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const nodes = await getProjectNodes(id);

  const tree = buildTree(nodes);
  const counts = Object.fromEntries(NODE_TYPES.map((type) => [type, 0])) as Record<
    NodeType,
    number
  >;
  for (const node of nodes) counts[node.node_type as NodeType] += 1;

  return (
    <ProjectSection
      title="Structure"
      description="The hierarchy you built during project creation. Edit any item from its context menu."
    >
      <div className="flex flex-wrap gap-2">
        {NODE_TYPES.filter((type) => counts[type] > 0).map((type) => (
          <span
            key={type}
            className="rounded-full border bg-card px-2.5 py-0.5 text-xs"
          >
            {counts[type]} {NODE_LABELS[type].toLowerCase()}
            {counts[type] === 1 ? "" : "s"}
          </span>
        ))}
      </div>

      {nodes.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No structure yet"
          description="Structure items are created from the project wizard, or added from the project context menu."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{nodes.length} items</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {tree.map((node) => (
                <NodeRow key={node.id} node={node} depth={0} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </ProjectSection>
  );
}