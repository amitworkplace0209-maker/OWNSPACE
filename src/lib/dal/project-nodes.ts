import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { ProjectNode, ProjectResource, ProjectHistory } from "@/types";

export const getProjectNodes = cache(
  async (projectId: string): Promise<ProjectNode[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_nodes")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as ProjectNode[];
  }
);

export const getProjectNode = cache(
  async (nodeId: string): Promise<ProjectNode | null> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_nodes")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", nodeId)
      .maybeSingle();

    if (error || !data) return null;
    return data as ProjectNode;
  }
);

export const getProjectNodeChildren = cache(
  async (parentId: string): Promise<ProjectNode[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_nodes")
      .select("*")
      .eq("user_id", user.id)
      .eq("parent_id", parentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as ProjectNode[];
  }
);

export type ProjectNodeWithChildren = ProjectNode & {
  children: ProjectNodeWithChildren[];
};

export const getProjectNodeTree = cache(
  async (projectId: string): Promise<ProjectNodeWithChildren[]> => {
    const nodes = await getProjectNodes(projectId);
    const nodeMap = new Map<string, ProjectNodeWithChildren>();
    const roots: ProjectNodeWithChildren[] = [];

    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    for (const node of nodes) {
      const nodeWithChildren = nodeMap.get(node.id)!;
      if (node.parent_id) {
        const parent = nodeMap.get(node.parent_id);
        if (parent) {
          parent.children.push(nodeWithChildren);
        } else {
          roots.push(nodeWithChildren);
        }
      } else {
        roots.push(nodeWithChildren);
      }
    }

    return roots;
  }
);

export const getProjectResources = cache(
  async (projectId: string): Promise<ProjectResource[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as ProjectResource[];
  }
);

export const getNodeResources = cache(
  async (nodeId: string): Promise<ProjectResource[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_resources")
      .select("*")
      .eq("user_id", user.id)
      .eq("node_id", nodeId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as ProjectResource[];
  }
);

export const getProjectHistory = cache(
  async (projectId: string, limit = 100): Promise<ProjectHistory[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_history")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as ProjectHistory[];
  }
);