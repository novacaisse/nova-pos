// Gestion documentaire ZegERP (Frontend Phase 8) — Documents / Contrats.
// RLS entité-scopée (pas une simple liste de rôles à plat, cf. migration
// 058) : un document suit les droits déjà accordés sur l'entité à laquelle
// il est rattaché (fournisseur → buyer/accountant, client →
// salesperson/accountant, employé → hr_manager, contrat → accountant).
// owner/manager voient/gèrent toujours tout. Bucket `erp-documents` PRIVÉ :
// jamais d'URL publique, uniquement des URL signées à durée limitée.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2, X, AlertCircle, FileText, FileSignature, Link2, ExternalLink, Upload } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { useMyRole } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";
import {
  useErpContracts, useUpsertErpContract, useDeleteErpContract,
  useErpDocuments, useErpDocumentAttachments, useUploadErpDocument, useDeleteErpDocument,
  useErpDocumentSignedUrl, useAttachErpDocument, useDetachErpDocument,
  type ErpContract, type ErpContractType, type ErpContractStatus,
  type ErpDocument, type ErpDocumentType, type ErpDocumentEntityType,
} from "@/lib/data/erpDocumentsHooks";
import { useErpSuppliers } from "@/lib/data/erpPurchasesHooks";
import { useErpCustomers } from "@/lib/data/erpSalesHooks";
import { useErpEmployees } from "@/lib/data/erpHrHooks";

export const Route = createFileRoute("/app/erp/documents")({
  component: ErpDocumentsPage,
});

const TABS = [
  { k: "documents", label: "Documents", icon: FileText },
  { k: "contrats", label: "Contrats", icon: FileSignature },
] as const;
type TabKey = (typeof TABS)[number]["k"];

function ErpDocumentsPage() {
  const [tab, setTab] = useState<TabKey>("documents");
  const { data: myRole } = useMyRole();
  const canManageContracts = myRole === "owner" || myRole === "manager" || myRole === "accountant";
  const canUploadDocuments = !!myRole && myRole !== "stock" && myRole !== "cashier";

  return (
    <div>
      <PageHeader title="Gestion documentaire" subtitle="Documents et contrats de l'organisation" />
      <div className="space-y-4 p-5 sm:p-8">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "documents" && <DocumentsTab canUpload={canUploadDocuments} />}
        {tab === "contrats" && <ContractsTab canManage={canManageContracts} />}
      </div>
    </div>
  );
}

// ============ Documents ============
const DOCUMENT_TYPE_LABEL: Record<ErpDocumentType, string> = {
  contract: "Contrat", invoice: "Facture", id_card: "Pièce d'identité", certificate: "Certificat", report: "Rapport", other: "Autre",
};
function DocumentsTab({ canUpload }: { canUpload: boolean }) {
  const { data: documents = [], isLoading } = useErpDocuments();
  const remove = useDeleteErpDocument();
  const getSignedUrl = useErpDocumentSignedUrl();
  const [uploading, setUploading] = useState(false);
  const [attaching, setAttaching] = useState<ErpDocument | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const open = async (doc: ErpDocument) => {
    setOpenError(null);
    try {
      const url = await getSignedUrl.mutateAsync(doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) { setOpenError(e?.message ?? "Impossible d'ouvrir le document."); }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canUpload && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setUploading(true)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Upload className="h-4 w-4" /> Téléverser
          </button>
        </div>
      )}
      <ErrorBanner error={openError} />
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun document pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABEL[d.document_type]}
                  {d.file_size != null && ` · ${Math.round(d.file_size / 1024)} Ko`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => open(d)} disabled={getSignedUrl.isPending} className="flex items-center gap-1 text-muted-foreground hover:text-primary" title="Voir">
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button onClick={() => setAttaching(d)} className="flex items-center gap-1 text-muted-foreground hover:text-primary" title="Attacher à…">
                  <Link2 className="h-4 w-4" />
                </button>
                {canUpload && (
                  <button onClick={() => { if (confirm(`Supprimer "${d.name}" ?`)) remove.mutate(d); }} className="text-muted-foreground hover:text-destructive" title="Supprimer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} />}
      {attaching && <AttachDialog document={attaching} onClose={() => setAttaching(null)} />}
    </div>
  );
}
function UploadDialog({ onClose }: { onClose: () => void }) {
  const upload = useUploadErpDocument();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<ErpDocumentType>("other");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!file || !name.trim()) return;
    setError(null);
    try {
      await upload.mutateAsync({ file, name: name.trim(), documentType, notes: notes.trim() || undefined });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible de téléverser le document."); }
  };

  return (
    <Dialog title="Téléverser un document" onClose={onClose}>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fichier *</span>
        <input type="file" onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          if (f && !name.trim()) setName(f.name);
        }} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-semibold" />
      </label>
      <Field label="Nom *" value={name} onChange={setName} placeholder="Ex : Contrat de bail 2026" />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={documentType} onChange={(e) => setDocumentType(e.target.value as ErpDocumentType)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(DOCUMENT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <Field label="Notes" value={notes} onChange={setNotes} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!file || !name.trim()} pending={upload.isPending} label="Téléverser" />
    </Dialog>
  );
}
const ENTITY_TYPE_LABEL: Record<ErpDocumentEntityType, string> = { supplier: "Fournisseur", customer: "Client", employee: "Employé", contract: "Contrat" };
function AttachDialog({ document, onClose }: { document: ErpDocument; onClose: () => void }) {
  const { data: attachments = [], isLoading } = useErpDocumentAttachments(document.id);
  const { data: suppliers = [] } = useErpSuppliers();
  const { data: customers = [] } = useErpCustomers();
  const { data: employees = [] } = useErpEmployees();
  const { data: contracts = [] } = useErpContracts();
  const attach = useAttachErpDocument();
  const detach = useDetachErpDocument();
  const [entityType, setEntityType] = useState<ErpDocumentEntityType>("supplier");
  const [entityId, setEntityId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const options = entityType === "supplier" ? suppliers.map((s) => ({ id: s.id, name: s.name }))
    : entityType === "customer" ? customers.map((c) => ({ id: c.id, name: c.name }))
    : entityType === "employee" ? employees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))
    : contracts.map((c) => ({ id: c.id, name: c.name }));

  const entityLabel = (t: ErpDocumentEntityType, id: string) => {
    const list = t === "supplier" ? suppliers.map((s) => ({ id: s.id, name: s.name }))
      : t === "customer" ? customers.map((c) => ({ id: c.id, name: c.name }))
      : t === "employee" ? employees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))
      : contracts.map((c) => ({ id: c.id, name: c.name }));
    return list.find((o) => o.id === id)?.name ?? "—";
  };

  const doAttach = async () => {
    if (!entityId) return;
    setError(null);
    try { await attach.mutateAsync({ document_id: document.id, entity_type: entityType, entity_id: entityId }); setEntityId(""); }
    catch (e: any) { setError(e?.message ?? "Impossible d'attacher le document."); }
  };

  return (
    <Dialog title={`${document.name} — Attachements`} onClose={onClose}>
      {isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" /> : attachments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Non attaché.</div>
      ) : (
        <div className="divide-y divide-border">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>{ENTITY_TYPE_LABEL[a.entity_type]} · {entityLabel(a.entity_type, a.entity_id)}</span>
              <button onClick={() => detach.mutate({ id: a.id, documentId: document.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-border pt-3">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value as ErpDocumentEntityType); setEntityId(""); }} className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
          {Object.entries(ENTITY_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm">
          <option value="">—</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button onClick={doAttach} disabled={!entityId || attach.isPending} className="rounded-lg bg-primary p-2 text-primary-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>
      </div>
      <ErrorBanner error={error} />
    </Dialog>
  );
}

// ============ Contrats ============
const CONTRACT_TYPE_LABEL: Record<ErpContractType, string> = { supplier: "Fournisseur", customer: "Client", employee: "Employé", lease: "Bail", other: "Autre" };
const CONTRACT_STATUS_LABEL: Record<ErpContractStatus, string> = { active: "Actif", expired: "Expiré", terminated: "Résilié" };
function ContractsTab({ canManage }: { canManage: boolean }) {
  const { data: contracts = [], isLoading } = useErpContracts();
  const upsert = useUpsertErpContract();
  const remove = useDeleteErpContract();
  const [editing, setEditing] = useState<ErpContract | null | "new">(null);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {canManage && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Nouveau contrat
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="grid place-items-center p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Aucun contrat pour l'instant.</div>
      ) : (
        <div className="divide-y divide-border">
          {contracts.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <button onClick={() => canManage && setEditing(c)} className="min-w-0 flex-1 text-left" disabled={!canManage}>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {CONTRACT_TYPE_LABEL[c.contract_type]}
                  {c.start_date && ` · ${c.start_date}${c.end_date ? ` → ${c.end_date}` : ""}`}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  c.status === "active" ? "bg-success/15 text-success" : c.status === "expired" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
                  {CONTRACT_STATUS_LABEL[c.status]}
                </span>
                {canManage && (
                  <button onClick={() => { if (confirm(`Supprimer "${c.name}" ?`)) remove.mutate(c.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <ContractDialog contract={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={upsert} />}
    </div>
  );
}
function ContractDialog({ contract, onClose, onSave }: { contract: ErpContract | null; onClose: () => void; onSave: ReturnType<typeof useUpsertErpContract> }) {
  const { data: suppliers = [] } = useErpSuppliers();
  const { data: customers = [] } = useErpCustomers();
  const { data: employees = [] } = useErpEmployees();
  const [name, setName] = useState(contract?.name ?? "");
  const [contractType, setContractType] = useState<ErpContractType>(contract?.contract_type ?? "other");
  const [supplierId, setSupplierId] = useState(contract?.supplier_id ?? "");
  const [customerId, setCustomerId] = useState(contract?.customer_id ?? "");
  const [employeeId, setEmployeeId] = useState(contract?.employee_id ?? "");
  const [value, setValue] = useState(contract?.value != null ? String(contract.value) : "");
  const [startDate, setStartDate] = useState(contract?.start_date ?? "");
  const [endDate, setEndDate] = useState(contract?.end_date ?? "");
  const [status, setStatus] = useState<ErpContractStatus>(contract?.status ?? "active");
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setError(null);
    try {
      await onSave.mutateAsync({
        id: contract?.id, name: name.trim(), contract_type: contractType,
        supplier_id: contractType === "supplier" ? supplierId || null : null,
        customer_id: contractType === "customer" ? customerId || null : null,
        employee_id: contractType === "employee" ? employeeId || null : null,
        value: value ? Number(value) : null, start_date: startDate || null, end_date: endDate || null,
        status, notes: notes.trim() || null,
      });
      onClose();
    } catch (e: any) { setError(e?.message ?? "Impossible d'enregistrer le contrat."); }
  };

  return (
    <Dialog title={contract ? "Modifier le contrat" : "Nouveau contrat"} onClose={onClose}>
      <Field label="Nom *" value={name} onChange={setName} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
        <select value={contractType} onChange={(e) => setContractType(e.target.value as ErpContractType)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {Object.entries(CONTRACT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      {contractType === "supplier" && <SelectField label="Fournisseur" value={supplierId} onChange={setSupplierId} options={suppliers.map((s) => ({ id: s.id, name: s.name }))} />}
      {contractType === "customer" && <SelectField label="Client" value={customerId} onChange={setCustomerId} options={customers.map((c) => ({ id: c.id, name: c.name }))} />}
      {contractType === "employee" && <SelectField label="Employé" value={employeeId} onChange={setEmployeeId} options={employees.map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valeur" value={value} onChange={setValue} placeholder="0" />
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statut</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ErpContractStatus)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
            {Object.entries(CONTRACT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Début" value={startDate} onChange={setStartDate} />
        <DateField label="Fin" value={endDate} onChange={setEndDate} />
      </div>
      <Field label="Notes" value={notes} onChange={setNotes} />
      <ErrorBanner error={error} />
      <DialogFooter onClose={onClose} onSave={save} disabled={!name.trim()} pending={onSave.isPending} />
    </Dialog>
  );
}

// ============ Composants partagés ============
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-elegant">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="font-display text-lg font-bold">{title}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
function DialogFooter({ onClose, onSave, disabled, pending, label = "Enregistrer" }: { onClose: () => void; onSave: () => void; disabled: boolean; pending: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Annuler</button>
      <button onClick={onSave} disabled={disabled || pending} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
      </button>
    </div>
  );
}
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
    </label>
  );
}
function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; name: string }[] }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
}
