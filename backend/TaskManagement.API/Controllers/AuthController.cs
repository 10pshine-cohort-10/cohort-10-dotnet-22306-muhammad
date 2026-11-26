using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using TaskManagement.API.Data;
using TaskManagement.API.DTOs;
using TaskManagement.API.Models;

namespace TaskManagement.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtSettings _jwtSettings;
    private readonly ILogger<AuthController> _logger;

    public AuthController(AppDbContext db, JwtSettings jwtSettings, ILogger<AuthController> logger)
    {
        _db = db;
        _jwtSettings = jwtSettings;
        _logger = logger;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (await _db.Users.AnyAsync(u => u.Email == req.Email))
        {
            _logger.LogWarning("Registration rejected: email {Email} is already registered", req.Email);
            return Conflict(new { message = "Email already registered." });
        }

        // Always assign RegularUser on public self-registration
        var user = new User
        {
            FullName = req.FullName,
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = "RegularUser"
        };

        _db.Users.Add(user);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        {
            _logger.LogWarning(ex, "Registration race condition: duplicate email {Email}", req.Email);
            return Conflict(new { message = "Email already registered." });
        }

        _logger.LogInformation("New user registered: {Email} (UserId: {UserId}, Role: {Role})", user.Email, user.Id, user.Role);

        var token = GenerateJwt(user);
        return Ok(new AuthResponse(token, user.FullName, user.Email, user.Role));
    }

    [Authorize(Roles = "Admin")]
    [HttpPatch("users/{userId:int}/promote")]
    public async Task<IActionResult> PromoteToAdmin(int userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user is null)
        {
            _logger.LogWarning("Admin promotion failed: target UserId {UserId} not found", userId);
            return NotFound(new { message = "User not found." });
        }

        user.Role = "Admin";
        await _db.SaveChangesAsync();

        var adminEmail = User.FindFirstValue(JwtRegisteredClaimNames.Email) ?? User.Identity?.Name ?? "UnknownAdmin";
        _logger.LogInformation("User {TargetEmail} (UserId: {UserId}) promoted to Admin by {AdminEmail}", user.Email, user.Id, adminEmail);

        return Ok(new { message = $"{user.Email} promoted to Admin." });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == req.Email);
        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            _logger.LogWarning("Failed login attempt for email {Email}", req.Email);
            return Unauthorized(new { message = "Invalid email or password." });
        }

        _logger.LogInformation("User {Email} (UserId: {UserId}, Role: {Role}) logged in successfully", user.Email, user.Id, user.Role);

        var token = GenerateJwt(user);
        return Ok(new AuthResponse(token, user.FullName, user.Email, user.Role));
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin-check")]
    public IActionResult AdminOnly() => Ok(new { message = "Welcome, Admin!" });

    private string GenerateJwt(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Name, user.FullName),
            new Claim(ClaimTypes.Role, user.Role)
        };

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(4),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}