/**
 * Visit lengths a manager can hand an inspector — an inspection is hours, not
 * days. Plain module on purpose: a `"use server"` file may only export async
 * functions, so a constant declared there reaches the client as an action
 * reference instead of an array.
 */
export const INSPECTOR_LINK_HOURS = [4, 8, 24] as const;

export type InspectorLinkHours = (typeof INSPECTOR_LINK_HOURS)[number];
