import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Имя должно быть не короче 2 символов").max(60),
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z
    .string()
    .min(8, "Пароль должен быть не короче 8 символов")
    .max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль").max(128),
});

export const columnSchema = z.object({
  title: z.string().trim().min(1, "Название колонки обязательно").max(60),
});

export const cardSchema = z.object({
  title: z.string().trim().min(1, "Название задачи обязательно").max(120),
  description: z.string().trim().max(2000).optional().default(""),
});
