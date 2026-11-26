using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TaskManagement.API.Data;
using TaskManagement.API.DTOs;
using TaskManagement.API.Models;

namespace TaskManagement.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TasksController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<TasksController> _logger;

    public TasksController(AppDbContext db, ILogger<TasksController> logger)
    {
        _db = db;
        _logger = logger;
    }

    private int GetCurrentUserId()
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub)
                  ?? User.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!int.TryParse(sub, out var userId))
            throw new UnauthorizedAccessException("Invalid user token.");

        return userId;
    }

    private bool IsAdmin() => User.IsInRole("Admin");

    // GET /api/tasks?status=Pending&priority=High&category=Work
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskResponse>>> GetTasks(
        [FromQuery] TaskItemStatus? status,
        [FromQuery] TaskPriority? priority,
        [FromQuery] string? category)
    {
        var currentUserId = GetCurrentUserId();

        var query = _db.Tasks
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .AsQueryable();

        // Regular users only see tasks they created or are assigned to; Admins see all tasks
        if (!IsAdmin())
        {
            query = query.Where(t => t.CreatedByUserId == currentUserId || t.AssignedToUserId == currentUserId);
        }

        if (status.HasValue)
            query = query.Where(t => t.Status == status.Value);

        if (priority.HasValue)
            query = query.Where(t => t.Priority == priority.Value);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(t => t.Category.ToLower() == category.Trim().ToLower());

        var tasks = await query
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.DueDate ?? DateTime.MaxValue)
            .ThenByDescending(t => t.CreatedAt)
            .Select(t => MapToResponse(t))
            .ToListAsync();

        return Ok(tasks);
    }

    // GET /api/tasks/5
    [HttpGet("{id:int}")]
    public async Task<ActionResult<TaskResponse>> GetTaskById(int id)
    {
        var currentUserId = GetCurrentUserId();

        var task = await _db.Tasks
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new KeyNotFoundException($"Task with ID {id} was not found.");

        if (!IsAdmin() && task.CreatedByUserId != currentUserId && task.AssignedToUserId != currentUserId)
            return Forbid();

        return Ok(MapToResponse(task));
    }

    // POST /api/tasks
    [HttpPost]
    public async Task<ActionResult<TaskResponse>> CreateTask(CreateTaskRequest req)
    {
        var currentUserId = GetCurrentUserId();

        if (req.AssignedToUserId.HasValue && !await _db.Users.AnyAsync(u => u.Id == req.AssignedToUserId.Value))
            throw new ArgumentException($"Assigned user with ID {req.AssignedToUserId.Value} does not exist.");

        var task = new TaskItem
        {
            Title = req.Title.Trim(),
            Description = req.Description?.Trim(),
            Priority = req.Priority,
            Status = TaskItemStatus.Pending,
            Category = req.Category.Trim(),
            DueDate = req.DueDate,
            CreatedByUserId = currentUserId,
            AssignedToUserId = req.AssignedToUserId
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        var createdTask = await _db.Tasks
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .FirstAsync(t => t.Id == task.Id);

        _logger.LogInformation(
            "Task {TaskId} ('{Title}') created by UserId {UserId} and assigned to UserId {AssignedToUserId}",
            createdTask.Id,
            createdTask.Title,
            currentUserId,
            createdTask.AssignedToUserId);

        return CreatedAtAction(nameof(GetTaskById), new { id = createdTask.Id }, MapToResponse(createdTask));
    }

    // PUT /api/tasks/5
    [HttpPut("{id:int}")]
    public async Task<ActionResult<TaskResponse>> UpdateTask(int id, UpdateTaskRequest req)
    {
        var currentUserId = GetCurrentUserId();

        var task = await _db.Tasks
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .FirstOrDefaultAsync(t => t.Id == id)
            ?? throw new KeyNotFoundException($"Task with ID {id} was not found.");

        if (!IsAdmin() && task.CreatedByUserId != currentUserId && task.AssignedToUserId != currentUserId)
            return Forbid();

        if (req.AssignedToUserId.HasValue && !await _db.Users.AnyAsync(u => u.Id == req.AssignedToUserId.Value))
            throw new ArgumentException($"Assigned user with ID {req.AssignedToUserId.Value} does not exist.");

        task.Title = req.Title.Trim();
        task.Description = req.Description?.Trim();
        task.Priority = req.Priority;
        task.Status = req.Status;
        task.Category = req.Category.Trim();
        task.DueDate = req.DueDate;
        task.AssignedToUserId = req.AssignedToUserId;
        task.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Reload AssignedToUser in case assignee changed
        await _db.Entry(task).Reference(t => t.AssignedToUser).LoadAsync();

        _logger.LogInformation(
            "Task {TaskId} updated by UserId {UserId} (New Status: {Status}, Priority: {Priority})",
            task.Id,
            currentUserId,
            task.Status,
            task.Priority);

        return Ok(MapToResponse(task));
    }

    // DELETE /api/tasks/5
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteTask(int id)
    {
        var currentUserId = GetCurrentUserId();

        var task = await _db.Tasks.FindAsync(id)
            ?? throw new KeyNotFoundException($"Task with ID {id} was not found.");

        // Only Admin or the task creator can delete a task
        if (!IsAdmin() && task.CreatedByUserId != currentUserId)
            return Forbid();

        _db.Tasks.Remove(task);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Task {TaskId} ('{Title}') deleted by UserId {UserId}", task.Id, task.Title, currentUserId);

        return NoContent();
    }

    // GET /api/tasks/assignees (for populating the React "Assign To" dropdown)
    [HttpGet("assignees")]
    public async Task<ActionResult<IEnumerable<AssigneeOptionResponse>>> GetAssignees()
    {
        var users = await _db.Users
            .OrderBy(u => u.FullName)
            .Select(u => new AssigneeOptionResponse(u.Id, u.FullName, u.Email))
            .ToListAsync();

        return Ok(users);
    }

    // PATCH /api/tasks/5/status
[HttpPatch("{id:int}/status")]
public async Task<ActionResult<TaskResponse>> UpdateTaskStatus(int id, UpdateTaskStatusRequest req)
{
    var currentUserId = GetCurrentUserId();

    var task = await _db.Tasks
        .Include(t => t.CreatedByUser)
        .Include(t => t.AssignedToUser)
        .FirstOrDefaultAsync(t => t.Id == id)
        ?? throw new KeyNotFoundException($"Task with ID {id} was not found.");

    if (!IsAdmin() && task.CreatedByUserId != currentUserId && task.AssignedToUserId != currentUserId)
        return Forbid();

    task.Status = req.Status;
    task.UpdatedAt = DateTime.UtcNow;

    await _db.SaveChangesAsync();

    _logger.LogInformation(
        "Task {TaskId} status updated to {Status} by UserId {UserId}",
        task.Id,
        task.Status,
        currentUserId);

    return Ok(MapToResponse(task));
}

    private static TaskResponse MapToResponse(TaskItem t) => new(
        t.Id,
        t.Title,
        t.Description,
        t.Priority,
        t.Status,
        t.Category,
        t.DueDate,
        t.CreatedAt,
        t.UpdatedAt,
        t.CreatedByUserId,
        t.CreatedByUser.FullName,
        t.AssignedToUserId,
        t.AssignedToUser?.FullName
    );
}