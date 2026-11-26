import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { checkAdminAccess } from "../api/authApi";
import {
  createTask,
  deleteTask,
  getAssignees,
  getTasks,
  updateTask,
  type AssigneeOption,
  type TaskItem,
  type TaskItemStatus,
  type TaskPriority,
} from "../api/tasksApi";
import {
  clearSession,
  getValidUserSession,
  subscribeToSessionChanges,
  type UserSession,
} from "../utils/sessionStorage";

const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  1: { label: "Low", color: "#1d4ed8", bg: "#dbeafe" },
  2: { label: "Medium", color: "#b45309", bg: "#fef3c7" },
  3: { label: "High", color: "#b91c1c", bg: "#fee2e2" },
};

const STATUS_LABELS: Record<TaskItemStatus, { label: string; color: string; bg: string }> = {
  1: { label: "Pending", color: "#374151", bg: "#f3f4f6" },
  2: { label: "In Progress", color: "#0369a1", bg: "#e0f2fe" },
  3: { label: "Completed", color: "#15803d", bg: "#dcfce7" },
};

function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Connection error: Unable to reach the server.";
    const data = err.response.data as { detail?: string; title?: string; message?: string } | undefined;
    if (data?.detail) return data.detail;
    if (data?.message) return data.message;
    if (data?.title) return data.title;
    if (err.response.status === 403) return "Access denied (403 Forbidden).";
    return `Request failed (${err.response.status}).`;
  }
  return "An unexpected error occurred.";
}

export default function TasksDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserSession | null>(null);
  const [lookupError, setLookupError] = useState(false);
  const [banner, setBanner] = useState<{ type: "error" | "info"; text: string } | null>(null);
  const syncGenRef = useRef(0);

  // Task state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<TaskItemStatus | "">("");
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "">("");
  const [filterCategory, setFilterCategory] = useState("");

  // Form state (supports both Create & Edit)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [status, setStatus] = useState<TaskItemStatus>(1);
  const [category, setCategory] = useState("Work");
  const [dueDate, setDueDate] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState<number | "">("");

  const handleUnauthorized = useCallback(
    async (requestToken?: string) => {
      try {
        await clearSession(requestToken);
      } catch {
        // Ignore storage errors on forced sign-out
      }
      setUser(null);
      navigate("/login", { replace: true });
    },
    [navigate]
  );

  const syncSession = useCallback(
    (isMounted: () => boolean) => {
      const currentGen = ++syncGenRef.current;
      getValidUserSession()
        .then((session) => {
          if (!isMounted() || currentGen !== syncGenRef.current) return;
          if (!session) {
            setUser(null);
            navigate("/login", { replace: true });
          } else {
            setLookupError(false);
            setUser(session);
          }
        })
        .catch(() => {
          if (!isMounted() || currentGen !== syncGenRef.current) return;
          setUser((prev) => {
            if (!prev) setLookupError(true);
            return prev;
          });
        });
    },
    [navigate]
  );

  useEffect(() => {
    let active = true;
    const isMounted = () => active;

    syncSession(isMounted);
    const unsubscribe = subscribeToSessionChanges(() => {
      syncSession(isMounted);
    });

    return () => {
      active = false;
      syncGenRef.current += 1;
      unsubscribe();
    };
  }, [syncSession]);

  const loadTasksAndAssignees = useCallback(async () => {
    if (!user) return;
    setLoadingTasks(true);
    try {
      const [tasksRes, assigneesRes] = await Promise.all([
        getTasks({
          status: filterStatus,
          priority: filterPriority,
          category: filterCategory,
        }),
        getAssignees(),
      ]);
      setTasks(tasksRes.data);
      setAssignees(assigneesRes.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await handleUnauthorized(user.token);
        return;
      }
      setBanner({ type: "error", text: extractApiError(err) });
    } finally {
      setLoadingTasks(false);
    }
  }, [user, filterStatus, filterPriority, filterCategory, handleUnauthorized]);

  useEffect(() => {
    loadTasksAndAssignees();
  }, [loadTasksAndAssignees]);

  const resetForm = () => {
    setEditingTaskId(null);
    setTitle("");
    setDescription("");
    setPriority(2);
    setStatus(1);
    setCategory("Work");
    setDueDate("");
    setAssignedToUserId("");
  };

  const startEditing = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setStatus(task.status);
    setCategory(task.category);
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : "");
    setAssignedToUserId(task.assignedToUserId ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !category.trim() || !user) return;

    setSubmitting(true);
    setBanner(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      category: category.trim(),
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      assignedToUserId: assignedToUserId === "" ? null : Number(assignedToUserId),
    };

    try {
      if (editingTaskId !== null) {
        await updateTask(editingTaskId, { ...payload, status });
        setBanner({ type: "info", text: "Task updated successfully." });
      } else {
        await createTask(payload);
        setBanner({ type: "info", text: "Task created successfully." });
      }
      resetForm();
      await loadTasksAndAssignees();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await handleUnauthorized(user.token);
        return;
      }
      setBanner({ type: "error", text: extractApiError(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatusChange = async (task: TaskItem, nextStatus: TaskItemStatus) => {
    if (!user) return;
    setBanner(null);
    try {
      await updateTask(task.id, {
        title: task.title,
        description: task.description ?? undefined,
        priority: task.priority,
        status: nextStatus,
        category: task.category,
        dueDate: task.dueDate ?? null,
        assignedToUserId: task.assignedToUserId ?? null,
      });
      await loadTasksAndAssignees();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await handleUnauthorized(user.token);
        return;
      }
      setBanner({ type: "error", text: extractApiError(err) });
    }
  };

  const handleDelete = async (taskId: number) => {
    if (!user) return;
    setBanner(null);
    try {
      await deleteTask(taskId);
      if (editingTaskId === taskId) resetForm();
      setBanner({ type: "info", text: "Task deleted." });
      await loadTasksAndAssignees();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await handleUnauthorized(user.token);
        return;
      }
      setBanner({ type: "error", text: extractApiError(err) });
    }
  };

  const testAdminRoute = async () => {
    if (!user) return;
    try {
      const res = await checkAdminAccess();
      setBanner({ type: "info", text: `Success: ${res.data.message}` });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        await handleUnauthorized(user.token);
        return;
      }
      setBanner({ type: "error", text: extractApiError(err) });
    }
  };

  const handleLogout = async () => {
    try {
      await clearSession();
      setUser(null);
      navigate("/login", { replace: true });
    } catch {
      setBanner({ type: "error", text: "Logout failed: Unable to clear local session." });
    }
  };

  if (lookupError && !user) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>Unable to load your session due to a local storage error.</p>
        <button onClick={() => syncSession(() => true)}>Retry</button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      {/* Top Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Task Management Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#4b5563" }}>
            Signed in as <strong>{user.fullName}</strong> ({user.role})
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={testAdminRoute} style={{ padding: "8px 12px", cursor: "pointer" }}>
            Test Admin Endpoint
          </button>
          <button onClick={handleLogout} style={{ padding: "8px 12px", cursor: "pointer", background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 4 }}>
            Logout
          </button>
        </div>
      </div>

      {/* Feedback / Error Banner */}
      {banner && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 6,
            background: banner.type === "error" ? "#fee2e2" : "#dcfce7",
            color: banner.type === "error" ? "#991b1b" : "#166534",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontWeight: "bold" }}>
            ✕
          </button>
        </div>
      )}

      {/* Create / Edit Task Form */}
      <form
        onSubmit={handleSaveTask}
        style={{
          marginTop: 20,
          padding: 20,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "#f9fafb",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>
          {editingTaskId !== null ? `Edit Task #${editingTaskId}` : "Create New Task"}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title *</label>
            <input
              type="text"
              required
              maxLength={150}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Implement JWT refresh flow"
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Category *</label>
            <input
              type="text"
              required
              maxLength={50}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Work, Bug, Feature..."
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            >
              <option value={1}>Low</option>
              <option value={2}>Medium</option>
              <option value={3}>High</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Assign To</label>
            <select
              value={assignedToUserId}
              onChange={(e) => setAssignedToUserId(e.target.value === "" ? "" : Number(e.target.value))}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} ({a.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </div>

          {editingTaskId !== null && (
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(Number(e.target.value) as TaskItemStatus)}
                style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
              >
                <option value={1}>Pending</option>
                <option value={2}>In Progress</option>
                <option value={3}>Completed</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Description</label>
          <textarea
            rows={2}
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional task details..."
            style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: "9px 16px", background: "#111827", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            {submitting ? "Saving..." : editingTaskId !== null ? "Update Task" : "Add Task"}
          </button>
          {editingTaskId !== null && (
            <button type="button" onClick={resetForm} style={{ padding: "9px 14px", cursor: "pointer" }}>
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 24, marginBottom: 12 }}>
        <strong>Filter Tasks:</strong>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value === "" ? "" : (Number(e.target.value) as TaskItemStatus))}
          style={{ padding: 6 }}
        >
          <option value="">All Statuses</option>
          <option value={1}>Pending</option>
          <option value={2}>In Progress</option>
          <option value={3}>Completed</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value === "" ? "" : (Number(e.target.value) as TaskPriority))}
          style={{ padding: 6 }}
        >
          <option value="">All Priorities</option>
          <option value={1}>Low</option>
          <option value={2}>Medium</option>
          <option value={3}>High</option>
        </select>

        <input
          type="text"
          placeholder="Filter by category..."
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: 6 }}
        />

        {(filterStatus !== "" || filterPriority !== "" || filterCategory !== "") && (
          <button
            onClick={() => {
              setFilterStatus("");
              setFilterPriority("");
              setFilterCategory("");
            }}
            style={{ padding: "6px 10px", cursor: "pointer" }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Task List */}
      {loadingTasks ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: "#6b7280", padding: "20px 0" }}>No tasks found. Create your first task above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {tasks.map((task) => {
            const pStyle = PRIORITY_LABELS[task.priority];
            const sStyle = STATUS_LABELS[task.status];
            const isOverdue =
              task.dueDate && task.status !== 3 && new Date(task.dueDate) < new Date(new Date().toDateString());

            return (
              <div
                key={task.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 16,
                  background: "#fff",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 17, textDecoration: task.status === 3 ? "line-through" : "none" }}>
                      {task.title}
                    </h3>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: pStyle.bg, color: pStyle.color, fontWeight: 600 }}>
                      {pStyle.label}
                    </span>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: sStyle.bg, color: sStyle.color, fontWeight: 600 }}>
                      {sStyle.label}
                    </span>
                    <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "#f3e8ff", color: "#6b21a8" }}>
                      {task.category}
                    </span>
                  </div>

                  {task.description && (
                    <p style={{ margin: "8px 0", color: "#374151", fontSize: 14 }}>{task.description}</p>
                  )}

                  <div style={{ fontSize: 12, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
                    <span>
                      <strong>Assigned to:</strong> {task.assignedToName ?? "Unassigned"}
                    </span>
                    <span>
                      <strong>Created by:</strong> {task.createdByName}
                    </span>
                    {task.dueDate && (
                      <span style={{ color: isOverdue ? "#dc2626" : "#6b7280", fontWeight: isOverdue ? 600 : 400 }}>
                        <strong>Due:</strong> {new Date(task.dueDate).toLocaleDateString()}
                        {isOverdue ? " (Overdue)" : ""}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    aria-label="Task Status"
                    value={task.status}
                    onChange={(e) => handleQuickStatusChange(task, Number(e.target.value) as TaskItemStatus)}
                    style={{ padding: "6px 8px" }}
                  >
                    <option value={1}>Pending</option>
                    <option value={2}>In Progress</option>
                    <option value={3}>Completed</option>
                  </select>
                  <button onClick={() => startEditing(task)} style={{ padding: "6px 10px", cursor: "pointer" }}>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    style={{ padding: "6px 10px", cursor: "pointer", background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", borderRadius: 4 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}