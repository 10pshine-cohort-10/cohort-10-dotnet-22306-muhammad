import { api } from "./authApi";

export type TaskPriority = 1 | 2 | 3; // 1 = Low, 2 = Medium, 3 = High
export type TaskItemStatus = 1 | 2 | 3; // 1 = Pending, 2 = InProgress, 3 = Completed

export interface TaskItem {
  id: number;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskItemStatus;
  category: string;
  dueDate?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  createdByUserId: number;
  createdByName: string;
  assignedToUserId?: number | null;
  assignedToName?: string | null;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  priority: TaskPriority;
  category: string;
  dueDate?: string | null;
  assignedToUserId?: number | null;
}

export interface UpdateTaskPayload extends CreateTaskPayload {
  status: TaskItemStatus;
}

export interface AssigneeOption {
  id: number;
  fullName: string;
  email: string;
}

export interface TaskFilters {
  status?: TaskItemStatus | "";
  priority?: TaskPriority | "";
  category?: string;
}

export const getTasks = (filters?: TaskFilters) => {
  const params: Record<string, string | number> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.priority) params.priority = filters.priority;
  if (filters?.category?.trim()) params.category = filters.category.trim();
  return api.get<TaskItem[]>("/tasks", { params });
};

export const createTask = (data: CreateTaskPayload) =>
  api.post<TaskItem>("/tasks", data);

export const updateTask = (id: number, data: UpdateTaskPayload) =>
  api.put<TaskItem>(`/tasks/${id}`, data);

export const updateTaskStatus = (id: number, status: TaskItemStatus) =>
  api.patch<TaskItem>(`/tasks/${id}/status`, { status });

export const deleteTask = (id: number) =>
  api.delete(`/tasks/${id}`);

export const getAssignees = () =>
  api.get<AssigneeOption[]>("/tasks/assignees");