import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5176/api", 
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  role: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const registerUser = (data: RegisterPayload) =>
  api.post("/auth/register", data);

export const loginUser = (data: LoginPayload) =>
  api.post("/auth/login", data);

export const checkAdminAccess = () =>
  api.get("/auth/admin-check");