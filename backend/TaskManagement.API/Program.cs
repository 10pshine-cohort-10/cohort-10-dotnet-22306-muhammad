using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using TaskManagement.API.Data;
using TaskManagement.API.Models;
using TaskManagement.API.Middleware;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    Log.Information("Starting TaskManagement.API...");

    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) => configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services));

    builder.Services.AddControllers();
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
    builder.Services.AddProblemDetails();
    builder.Services.AddOpenApi();

    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

    var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT signing key is missing.");
    var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? throw new InvalidOperationException("JWT issuer is missing.");
    var jwtAudience = builder.Configuration["Jwt:Audience"] ?? throw new InvalidOperationException("JWT audience is missing.");

    var jwtSettings = new JwtSettings(jwtKey, jwtIssuer, jwtAudience);
    builder.Services.AddSingleton(jwtSettings);

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = jwtSettings.Issuer,
                ValidAudience = jwtSettings.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Key))
            };
        });

    builder.Services.AddAuthorization();

    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowReact", policy =>
            policy.WithOrigins("http://localhost:5173")
                  .AllowAnyHeader()
                  .AllowAnyMethod());
    });

    var app = builder.Build();
    app.UseExceptionHandler();
    app.UseSerilogRequestLogging();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    app.UseCors("AllowReact");
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();

    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        var seedEmail = builder.Configuration["SeedAdmin:Email"];
        var seedPassword = builder.Configuration["SeedAdmin:Password"];

        if (!string.IsNullOrWhiteSpace(seedEmail) &&
            !string.IsNullOrWhiteSpace(seedPassword) &&
            !await db.Users.AnyAsync(u => u.Role == "Admin"))
        {
            var existingUser = await db.Users.FirstOrDefaultAsync(u => u.Email == seedEmail);
            if (existingUser is not null)
            {
                Log.Warning(
                    "Initial Admin seeding skipped: configured SeedAdmin:Email '{SeedEmail}' already belongs to an existing account (Role: {Role}). " +
                    "Configure an unused SeedAdmin:Email via User Secrets or environment variables and restart the API to provision the first Admin.",
                    seedEmail,
                    existingUser.Role);
            }
            else
            {
                db.Users.Add(new User
                {
                    FullName = "System Administrator",
                    Email = seedEmail,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(seedPassword),
                    Role = "Admin"
                });
                await db.SaveChangesAsync();
                Log.Information("Seeded initial Admin account: {SeedEmail}", seedEmail);
            }
        }
    }

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "TaskManagement.API terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}