namespace TaskManagement.API.Models;

public sealed record JwtSettings(string Key, string Issuer, string Audience);