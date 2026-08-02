// Data layer ZegERP — module 8/10 : Gestion documentaire (migration 058).
// Aucun rôle nouveau. RLS entité-scopée via erp_document_attachments : un
// document suit les droits de l'entité à laquelle il est rattaché (voir
// ARCHITECTURE_ERP.md) — ce fichier ne fait qu'exposer les requêtes, la
// visibilité réelle vient entièrement de la RLS. Bucket `erp-documents`
// PRIVÉ (premier bucket privé du dépôt) : on ne stocke jamais d'URL
// publique, seulement `file_path` (chemin dans le bucket) — la lecture
// passe par une URL signée à durée limitée, générée à la demande.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/auth/OrganizationProvider";

function useOrganizationId() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id;
}

// ============ Types ============
export type ErpContractType = "supplier" | "customer" | "employee" | "lease" | "other";
export type ErpContractStatus = "active" | "expired" | "terminated";
export type ErpContract = {
  id: string; organization_id: string; supplier_id: string | null; customer_id: string | null; employee_id: string | null;
  name: string; contract_type: ErpContractType; value: number | null; start_date: string | null; end_date: string | null;
  status: ErpContractStatus; notes: string | null; created_at: string;
};

export type ErpDocumentType = "contract" | "invoice" | "id_card" | "certificate" | "report" | "other";
export type ErpDocument = {
  id: string; organization_id: string; name: string; document_type: ErpDocumentType;
  file_path: string; file_size: number | null; mime_type: string | null; notes: string | null; created_at: string;
};

export type ErpDocumentEntityType = "supplier" | "customer" | "employee" | "contract";
export type ErpDocumentAttachment = {
  id: string; organization_id: string; document_id: string; entity_type: ErpDocumentEntityType; entity_id: string; created_at: string;
};

// ============ Contrats ============
export function useErpContracts() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_contracts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpContract[]> => {
      const { data, error } = await supabase.from("erp_contracts").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpContract[];
    },
  });
}
export function useUpsertErpContract() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ErpContract> & { name: string }) => {
      const { data, error } = await supabase.from("erp_contracts").upsert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpContract;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_contracts", organizationId] }),
  });
}
export function useDeleteErpContract() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("erp_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_contracts", organizationId] }),
  });
}

// ============ Documents + attachements ============
export function useErpDocuments() {
  const organizationId = useOrganizationId();
  return useQuery({
    queryKey: ["erp_documents", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<ErpDocument[]> => {
      const { data, error } = await supabase.from("erp_documents").select("*").eq("organization_id", organizationId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErpDocument[];
    },
  });
}
export function useErpDocumentAttachments(documentId: string | null) {
  return useQuery({
    queryKey: ["erp_document_attachments", documentId],
    enabled: !!documentId,
    queryFn: async (): Promise<ErpDocumentAttachment[]> => {
      const { data, error } = await supabase.from("erp_document_attachments").select("*").eq("document_id", documentId!);
      if (error) throw error;
      return (data ?? []) as ErpDocumentAttachment[];
    },
  });
}
// Upload : chemin {organization_id}/{document_id}/{nom_fichier} (convention
// migration 058) — id du document pré-généré côté client pour connaître le
// chemin avant l'insertion de la ligne (même ordre que product-images :
// upload puis insert, ici insert d'abord avec id explicite car le fichier a
// besoin d'un id de document dans son chemin, pas l'inverse).
export function useUploadErpDocument() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, name, documentType, notes }: { file: File; name: string; documentType: ErpDocumentType; notes?: string }) => {
      const documentId = crypto.randomUUID();
      const path = `${organizationId}/${documentId}/${file.name}`;
      const { error: upErr } = await supabase.storage.from("erp-documents").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data, error } = await supabase.from("erp_documents").insert({
        id: documentId, organization_id: organizationId, name, document_type: documentType,
        file_path: path, file_size: file.size, mime_type: file.type, notes: notes ?? null,
      }).select().single();
      if (error) throw error;
      return data as ErpDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_documents", organizationId] }),
  });
}
export function useDeleteErpDocument() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: ErpDocument) => {
      await supabase.storage.from("erp-documents").remove([doc.file_path]);
      const { error } = await supabase.from("erp_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["erp_documents", organizationId] }),
  });
}
// URL signée à durée limitée (1h) — jamais d'URL publique, bucket privé.
export function useErpDocumentSignedUrl() {
  return useMutation({
    mutationFn: async (path: string): Promise<string> => {
      const { data, error } = await supabase.storage.from("erp-documents").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
export function useAttachErpDocument() {
  const organizationId = useOrganizationId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { document_id: string; entity_type: ErpDocumentEntityType; entity_id: string }) => {
      const { data, error } = await supabase.from("erp_document_attachments").insert({ ...input, organization_id: organizationId }).select().single();
      if (error) throw error;
      return data as ErpDocumentAttachment;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_document_attachments", vars.document_id] }),
  });
}
export function useDetachErpDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; documentId: string }) => {
      const { error } = await supabase.from("erp_document_attachments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["erp_document_attachments", vars.documentId] }),
  });
}
