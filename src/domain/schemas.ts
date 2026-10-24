import { z } from 'zod';
export const daySchema = z.enum(['mon','tue','wed','thu','fri','sat','sun']);
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const conditionsSchema = z.object({
  activityTags: z.array(z.string().trim().min(1).max(50)).min(1).max(8),
  maxPrice: z.number().finite().min(0).max(10000).optional(),
  days: z.array(daySchema).min(1).max(7).optional(), endsBefore: timeSchema.optional(),
  minGroupSize: z.number().int().min(1).max(4).optional(),
  requireApprovedFriend: z.boolean().optional(), beginnerOnly: z.boolean().optional(),
}).strict();
const ref = {proposalId:z.string().min(1),version:z.number().int().positive()};
export const commandSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('intake'),text:z.string().trim().min(1).max(2000)}).strict(),
  z.object({type:z.literal('edit_conditions'),conditions:conditionsSchema}).strict(),
  z.object({type:z.literal('approve_discovery'),expectedRevision:z.number().int().nonnegative(),expiresAt:z.iso.datetime()}).strict(),
  z.object({type:z.literal('reveal'),...ref,decision:z.enum(['approve','pass'])}).strict(),
  z.object({type:z.literal('attendance'),...ref,decision:z.enum(['in','out'])}).strict(),
  z.object({type:z.literal('withdraw'),...ref}).strict(),
  z.object({type:z.literal('answer_recheck'),...ref,expectedRevision:z.number().int().nonnegative(),decision:z.enum(['approve_change','pass']),conditions:conditionsSchema}).strict(),
]);
