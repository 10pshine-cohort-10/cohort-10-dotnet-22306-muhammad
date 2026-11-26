using System.ComponentModel.DataAnnotations;
using TaskManagement.API.Models;

namespace TaskManagement.API.DTOs;

public record CreateTaskRequest(
    [Required, MaxLength(150)] string Title,
    [MaxLength(1000)] string? Description,
    TaskPriority Priority,
    [Required, MaxLength(50)] string Category,
    DateTime? DueDate,
    int? AssignedToUserId
);

public record UpdateTaskRequest(
    [Required, MaxLength(150)] string Title,
    [MaxLength(1000)] string? Description,
    TaskPriority Priority,
    TaskItemStatus Status,
    [Required, MaxLength(50)] string Category,
    DateTime? DueDate,
    int? AssignedToUserId
);

public record TaskResponse(
    int Id,
    string Title,
    string? Description,
    TaskPriority Priority,
    TaskItemStatus Status,
    string Category,
    DateTime? DueDate,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    int CreatedByUserId,
    string CreatedByName,
    int? AssignedToUserId,
    string? AssignedToName
);

public record AssigneeOptionResponse(
    int Id,
    string FullName,
    string Email
);