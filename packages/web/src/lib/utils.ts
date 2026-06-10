import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  // 合并字符串，去除冲突类
  return twMerge(clsx(inputs))
}
