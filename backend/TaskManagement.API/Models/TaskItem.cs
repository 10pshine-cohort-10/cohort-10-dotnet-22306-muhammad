using System.ComponentModel.DataAnnotations;

namespace TaskManagement.API.Models;

public enum TaskPriority
{
    Low = 1,
    Medium = 2,
    High = 3
}

public enum TaskItemStatus
{
    Pending = 1,
    InProgress = 2,
    Completed = 3
}

public class TaskItem
{
    public int Id { get; set; }

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    public TaskPriority Priority { get; set; } = TaskPriority.Medium;

    public TaskItemStatus Status { get; set; } = TaskItemStatus.Pending;

    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = "General";

    public DateTime? DueDate { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    // Foreign key to creator
    public int CreatedByUserId { get; set; }
    public User CreatedByUser { get; set; } = null!;

    // Optional foreign key to assignee
    public int? AssignedToUserId { get; set; }
    public User? AssignedToUser { get; set; }
}