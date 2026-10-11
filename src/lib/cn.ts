import { clsx, type ClassValue } from "clsx";

/** 合并 className。 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
