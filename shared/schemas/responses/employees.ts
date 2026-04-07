import { z } from 'zod';

export const EmployeeResponse = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  employeeNumber: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  role: z.string().nullable(),
  position: z.string().nullable(),
  organizationalTitle: z.string().nullable(),
  workspaceRole: z.string().nullable(),
  hourlyRate: z.string().nullable(),
  overtimeRate: z.string().nullable(),
  doubletimeRate: z.string().nullable(),
  payType: z.string().nullable(),
  workerType: z.string().nullable(),
  payAmount: z.string().nullable(),
  payFrequency: z.string().nullable(),
  hireDate: z.string().nullable(),
  terminationDate: z.string().nullable(),
  status: z.string(),
  onboardingStatus: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
}).passthrough();

export const PaginatedEmployeeListResponse = z.object({
  data: z.array(EmployeeResponse),
  pagination: z.object({
    total: z.number(),
    totalPages: z.number(),
    page: z.number().optional(),
    limit: z.number().optional(),
  }),
});

export const EmployeeListResponse = z.array(EmployeeResponse);

export type TEmployeeResponse = z.infer<typeof EmployeeResponse>;
export type TPaginatedEmployeeListResponse = z.infer<typeof PaginatedEmployeeListResponse>;
