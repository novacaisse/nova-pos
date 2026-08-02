// Data layer ZegERP — module 7/10 : RH (migrations 056+057). Périmètre
// strictement resserré owner/manager/hr_manager (données personnelles
// sensibles) — pas d'accountant ni d'autre rôle métier, cf.
// ARCHITECTURE_ERP.md.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

// ============ Types ============
export type ErpDepartment = { id: string; organization_id: string; name: string; created_at: string };
export type ErpPosition = { id: string; organization_id: string; department_id: string | null; title: string; created_at: string };
export type ErpEmployeeStatus = "active" | "on_leave" | "terminated";
export type ErpEmployee = {
  id: string; organization_id: string; department_id: string | null; position_id: string | null; user_id: string | null;
  first_name: string; last_name: string; email: string | null; phone: string | null;
  hire_date: string | null; termination_date: string | null; status: ErpEmployeeStatus; notes: string | null; created_at: string;
  erp_departments: { name: string } | null; erp_positions: { title: string } | null;
};
export type ErpAttendanceStatus = "present" | "absent" | "late" | "half_day";
export type ErpAttendance = {
  id: string; organization_id: string; employee_id: string; date: string;
  check_in: string | null; check_out: string | null; status: ErpAttendanceStatus; notes: string | null; created_at: string;
};
export type ErpLeaveType = "paid" | "unpaid" | "sick" | "other";
export type ErpLeaveStatus = "pending" | "approved" | "rejected";
export type ErpLeaveRequest = {
  id: string; organization_id: string; employee_id: string; leave_type: ErpLeaveType;
  start_date: string; end_date: string; status: ErpLeaveStatus; reason: string | null; created_at: string;
  erp_employees: { first_name: string; last_name: string } | null;
};
export type ErpEmployeeDocumentType = "contract" | "id_card" | "diploma" | "certificate" | "other";
export type ErpEmployeeDocument = {
  id: string; organization_id: string; employee_id: string; name: string; document_type: ErpEmployeeDocumentType;
  file_url: string | null; notes: string | null; created_at: string;
};

// ============ Départements ============
export function useErpDepartments() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_departments", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpDepartment[]> => {
      const { data, error } = await supabase.from("erp_departments").select("*").eq("organization_id", organizationId!).order("name");
      if (error) throw error;
      return (data ?? []) as ErpDepartment[];
    },
  });
}
export function useUpsertErpDepartment() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string }) => {
      const { data, error } = await supabase.from("erp_departments").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpDepartment;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_departments", organizationId] }),
  });
}
export function useDeleteErpDepartment() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_departments", organizationId] }),
  });
}

// ============ Postes ============
export function useErpPositions() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_positions", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpPosition[]> => {
      const { data, error } = await supabase.from("erp_positions").select("*").eq("organization_id", organizationId!).order("title");
      if (error) throw error;
      return (data ?? []) as ErpPosition[];
    },
  });
}
export function useUpsertErpPosition() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; department_id?: string | null }) => {
      const { data, error } = await supabase.from("erp_positions").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpPosition;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_positions", organizationId] }),
  });
}
export function useDeleteErpPosition() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_positions", organizationId] }),
  });
}

// ============ Employés ============
export function useErpEmployees() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_employees", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpEmployee[]> => {
      const { data, error } = await supabase.from("erp_employees")
        .select("*, erp_departments(name), erp_positions(title)").eq("organization_id", organizationId!).order("last_name");
      if (error) throw error;
      return (data ?? []) as unknown as ErpEmployee[];
    },
  });
}
export function useUpsertErpEmployee() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpEmployee> & { first_name: string; last_name: string }) => {
      const { data, error } = await supabase.from("erp_employees").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpEmployee;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_employees", organizationId] }),
  });
}
export function useDeleteErpEmployee() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_employees", organizationId] }),
  });
}

// ============ Pointage ============
export function useErpAttendance(employeeId?: string) {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_attendance", organizationId, employeeId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpAttendance[]> => {
      let q = supabase.from("erp_attendance").select("*").eq("organization_id", organizationId!);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q.order("date", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as ErpAttendance[];
    },
  });
}
export function useUpsertErpAttendance() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; date: string; status: ErpAttendanceStatus; check_in?: string; check_out?: string; notes?: string }) => {
      const { data, error } = await supabase.from("erp_attendance").upsert({ ...input, organization_id: organizationId }, { onConflict: "employee_id,date" }).select().single();
      if (error) throw error;
      return data as ErpAttendance;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_attendance", organizationId] }),
  });
}

// ============ Congés (owner/manager/hr_manager, pas de split créateur/
// approbateur — hr_manager porte une autorité managériale complète) ============
export function useErpLeaveRequests() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_leave_requests", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpLeaveRequest[]> => {
      const { data, error } = await supabase.from("erp_leave_requests")
        .select("*, erp_employees(first_name, last_name)").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ErpLeaveRequest[];
    },
  });
}
export function useUpsertErpLeaveRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; leave_type: ErpLeaveType; start_date: string; end_date: string; reason?: string }) => {
      const { data, error } = await supabase.from("erp_leave_requests").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpLeaveRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_leave_requests", organizationId] }),
  });
}
export function useReviewErpLeaveRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.from("erp_leave_requests")
        .update({ status: approve ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_leave_requests", organizationId] }),
  });
}
export function useDeleteErpLeaveRequest() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_leave_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_leave_requests", organizationId] }),
  });
}

// ============ Documents employé (file_url texte simple en V1 — pas
// encore de bucket dédié, voir module 8) ============
export function useErpEmployeeDocuments(employeeId: string | null) {
  return useQuery({
    queryKey: ["erp_employee_documents", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<ErpEmployeeDocument[]> => {
      const { data, error } = await supabase.from("erp_employee_documents").select("*").eq("employee_id", employeeId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpEmployeeDocument[];
    },
  });
}
export function useUpsertErpEmployeeDocument() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; name: string; document_type: ErpEmployeeDocumentType; file_url?: string; notes?: string }) => {
      const { data, error } = await supabase.from("erp_employee_documents").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpEmployeeDocument;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_employee_documents", vars.employee_id] }),
  });
}
export function useDeleteErpEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; employeeId: string }) => {
      const { error } = await supabase.from("erp_employee_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_employee_documents", vars.employeeId] }),
  });
}
