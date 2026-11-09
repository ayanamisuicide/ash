import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Склеивает классы и корректно разрешает конфликты Tailwind */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
